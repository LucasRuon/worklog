import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openStore } from '../../src/core/context.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { registerSource, listSources } from '../../src/collectors/source-config.js';
import { normalizeCodex, queueCodex, getCodexDiagnostic } from '../../src/collectors/codex.js';
import { configureCodexHooks } from '../../src/cli/hooks.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { projectSessions, listSessions } from '../../src/core/sessions.js';
import type { SourceRegistration, WorkEvent } from '../../src/core/contracts.js';

const source: SourceRegistration = { id: randomUUID(), installationId: randomUUID(), deviceId: randomUUID(), tool: 'codex', profile: 'test', configPath: '/tmp/codex/hooks.json', version: '0.167.0', enabled: true };
const observed = { originId: 'delivery-1', occurredAt: '2026-11-06T09:00:00.000Z' };
const common = { session_id: 'parent-1', cwd: '/tmp/repo', model: 'test', transcript_path: '/PRIVATE_TRANSCRIPT', permission_mode: 'default' };

test('Codex: contrato 0.167.0 e privacidade', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/codex/hooks.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  const expected = [
    [['session.start', { reason: 'startup' }]],
    [['turn.submit', { turnId: 'turn-1' }], ['turn.start', { turnId: 'turn-1' }]],
    [['tool.start', { toolName: 'Bash', toolUseId: 'call-1' }]],
    [['tool.end', { toolName: 'Bash', toolUseId: 'call-1', outcome: 'completed' }]],
    [['turn.end', { turnId: 'turn-1', outcome: 'completed' }]],
    [['turn.end', { turnId: 'turn-2', outcome: 'interrupted' }], ['session.interrupt', { reason: 'user' }]],
    [['session.start', { reason: 'subagent' }]],
    [['turn.end', { outcome: 'completed' }]],
    [['session.start', { reason: 'compact' }]],
    [['session.end', { reason: 'other' }]],
  ];
  fixture.forEach((raw, index) => {
    const events = normalizeCodex(source, { ...common, ...raw }, observed);
    assert.deepEqual(events.map((event) => [event.type, event.payload]), expected[index], String(raw.hook_event_name));
    assert.equal(events.some((event) => event.type === 'human.interaction'), false);
    assert.equal(JSON.stringify(events).includes('PRIVATE_'), false);
    assert.ok(events.every((event) => event.occurredAt === observed.occurredAt));
  });
  for (const reason of ['resume', 'compact']) {
    const event = normalizeCodex(source, { ...common, hook_event_name: 'SessionStart', source: reason }, observed)[0];
    assert.ok(event?.type === 'session.start'); assert.equal(event.payload.reason, reason);
  }
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-codex-'));
  const root = join(directory, "repositório com espaço ' $literal"); await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  const ctx = await openStore(join(directory, 'data'));
  const configPath = join(directory, 'perfil com espaço', 'hooks.json'); await mkdir(join(directory, 'perfil com espaço'));
  const local = { ...source, id: randomUUID(), deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, configPath };
  const projectId = registerProjectRoot(ctx, { projectName: 'Codex', deviceId: ctx.config.deviceId, path: root });
  registerSource(ctx, local);
  return { directory, root, ctx, source: local, projectId, cleanup: async () => { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); } };
}

test('Codex: pai, subagente e interrupção nas projeções', async () => {
  const f = await setup();
  try {
    const sequence = [
      { hook_event_name: 'SessionStart', source: 'startup' },
      { hook_event_name: 'UserPromptSubmit', turn_id: 'parent-turn' },
      { hook_event_name: 'SubagentStart', agent_id: 'child-1', turn_id: 'parent-turn' },
      { hook_event_name: 'UserPromptSubmit', agent_id: 'child-1', turn_id: 'child-turn' },
      { hook_event_name: 'PreToolUse', agent_id: 'child-1', turn_id: 'child-turn', tool_name: 'Bash', tool_use_id: 'child-call' },
      { hook_event_name: 'PostToolUse', agent_id: 'child-1', turn_id: 'child-turn', tool_name: 'Bash', tool_use_id: 'child-call' },
      { hook_event_name: 'SubagentStop', agent_id: 'child-1', turn_id: 'child-turn' },
      { hook_event_name: 'Interrupt', turn_id: 'parent-turn' },
    ];
    for (const [index, raw] of sequence.entries()) queueCodex(f.ctx.config.dataDir, f.source.id, { ...common, cwd: f.root, ...raw }, { originId: `delivery-${index}`, occurredAt: `2026-11-06T09:00:0${index}.000Z` });
    drainQueue(f.ctx);
    const events = f.ctx.db.all<{ document: string }>('SELECT document FROM events').map((row) => JSON.parse(row.document) as WorkEvent);
    projectSessions(f.ctx, events);
    const sessions = listSessions(f.ctx, { projectIds: [f.projectId], from: '2026-11-06T00:00:00.000Z', to: '2026-11-07T00:00:00.000Z', timezone: 'UTC' });
    assert.equal(sessions.length, 2);
    const parent = sessions.find((s) => !s.nativeAgentId)!; const child = sessions.find((s) => s.nativeAgentId === 'child-1')!;
    assert.equal(parent.state, 'interrupted'); assert.equal(child.state, 'waiting');
    assert.equal(child.parentSessionId, parent.id); assert.equal(child.projectId, f.projectId);
    assert.equal(f.ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM session_executions WHERE session_id = ? AND kind = 'turn'", child.id)?.n, 1);
    assert.equal(events.filter((e) => e.type === 'human.interaction').length, 0);
  } finally { await f.cleanup(); }
});

test('Codex: fila offline, replay e escopo', async () => {
  const f = await setup(); const dataDir = f.ctx.config.dataDir;
  try {
    await f.ctx.shutdown();
    const raw = { ...common, cwd: f.root, hook_event_name: 'UserPromptSubmit', turn_id: 'one', prompt: 'PRIVATE_PROMPT' };
    assert.equal(queueCodex(dataDir, f.source.id, raw, observed), 2);
    assert.equal(queueCodex(dataDir, f.source.id, raw, { originId: 'retry', occurredAt: '2026-11-06T09:01:00.000Z' }), 2);
    const tool = { ...raw, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'call-a' };
    assert.equal(queueCodex(dataDir, f.source.id, tool, observed), 1);
    assert.equal(queueCodex(dataDir, f.source.id, { ...tool, tool_use_id: 'call-b' }, observed), 1);
    assert.equal(queueCodex(dataDir, f.source.id, { ...raw, cwd: f.directory }, observed), 0);
    const outside = join(f.directory, 'outside'); await mkdir(outside); await symlink(outside, join(f.root, 'escape'));
    assert.equal(queueCodex(dataDir, f.source.id, { ...raw, cwd: join(f.root, 'escape') }, observed), 0);
    const ctx = await openStore(dataDir);
    try {
      const result = drainQueue(ctx); assert.equal(result.inserted, 4); assert.equal(result.duplicates, 2);
      const dates = ctx.db.all<{ occurred_at: string }>('SELECT occurred_at FROM events');
      assert.ok(dates.every((row) => row.occurred_at === observed.occurredAt));
      assert.equal(JSON.stringify(ctx.db.all('SELECT document FROM events')).includes('PRIVATE_'), false);
      registerSource(ctx, { ...f.source, enabled: false });
      assert.equal(queueCodex(dataDir, f.source.id, { ...raw, turn_id: 'paused' }, observed), 0);
    } finally { await ctx.shutdown(); }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('Codex: rejeições e diagnóstico sem payload', async () => {
  const f = await setup();
  try {
    const raw = { ...common, cwd: f.root, hook_event_name: 'UserPromptSubmit', turn_id: 'one' };
    assert.deepEqual(normalizeCodex({ ...f.source, version: '0.168.0' }, raw, observed), []);
    assert.deepEqual(normalizeCodex({ ...f.source, enabled: false }, raw, observed), []);
    for (const invalid of [{ ...raw, turn_id: undefined }, { ...raw, hook_event_name: 'NewSchema' }, { ...raw, session_id: {} }, { ...raw, prompt: 'x'.repeat(1024 * 1024) }]) {
      assert.equal(queueCodex(f.ctx.config.dataDir, f.source.id, invalid, observed), 0);
      const diagnostic = getCodexDiagnostic(f.ctx.config.dataDir, f.source.id)!;
      assert.equal(diagnostic.code, 'CODEX_INPUT_UNSUPPORTED');
      assert.deepEqual(Object.keys(diagnostic).sort(), ['at', 'code']);
    }
    assert.equal(drainQueue(f.ctx).inserted, 0);
    const content = await readFile(join(f.ctx.config.dataDir, `codex-${f.source.id}.diagnostic.json`), 'utf8');
    assert.equal(content.includes('PRIVATE_'), false);
  } finally { await f.cleanup(); }
});

test('Codex: instalação seletiva, backup e confiança', async () => {
  const f = await setup();
  try {
    const configPath = f.source.configPath;
    const original = { description: 'keep', hooks: { Stop: [{ matcher: 'custom', hooks: [{ type: 'command', command: 'existing-hook', timeout: 12 }] }] } };
    await writeFile(configPath, JSON.stringify(original));
    await writeFile(join(f.directory, 'perfil com espaço', 'config.toml'), '[features]\nhooks = false\n');
    await writeFile(join(f.directory, 'perfil com espaço', 'hook-trust.json'), '{"keep":true}');
    await configureCodexHooks(configPath, 'install', { ctx: f.ctx, sourceId: f.source.id });
    const first = await readFile(configPath, 'utf8');
    await configureCodexHooks(configPath, 'install', { ctx: f.ctx, sourceId: f.source.id });
    assert.equal(await readFile(configPath, 'utf8'), first);
    const installed = JSON.parse(first) as { hooks: Record<string, { hooks: { command: string; timeout: number }[] }[]> };
    assert.equal(Object.keys(installed.hooks).length, 10);
    for (const groups of Object.values(installed.hooks)) assert.equal(groups.at(-1)!.hooks[0]!.timeout, 2);
    assert.equal((await readdir(join(f.directory, 'perfil com espaço'))).filter((n) => n.includes('.worklog-backup-')).length, 1);
    assert.equal(await readFile(join(f.directory, 'perfil com espaço', 'config.toml'), 'utf8'), '[features]\nhooks = false\n');
    assert.equal(await readFile(join(f.directory, 'perfil com espaço', 'hook-trust.json'), 'utf8'), '{"keep":true}');
    const foreign = { type: 'command', command: installed.hooks.Stop!.at(-1)!.hooks[0]!.command.replaceAll(f.source.id, randomUUID()) };
    const extended = JSON.parse(first); extended.hooks.Stop.push({ hooks: [foreign] });
    await writeFile(configPath, JSON.stringify(extended));
    await configureCodexHooks(configPath, 'remove', { ctx: f.ctx, sourceId: f.source.id });
    const expected = structuredClone(original) as { description: string; hooks: { Stop: unknown[] } }; expected.hooks.Stop.push({ hooks: [foreign] });
    assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), expected);
    assert.equal(listSources(f.ctx).find((s) => s.id === f.source.id)?.enabled, false);
  } finally { await f.cleanup(); }
});
