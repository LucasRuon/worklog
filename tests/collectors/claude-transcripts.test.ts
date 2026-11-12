import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { isClaudeSupported } from '../../src/collectors/claude.js';
import { isCodexSupported } from '../../src/collectors/codex.js';
import { projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';

const at = (clock: string) => `2026-11-10T${clock}.000Z`;
const range = { from: '2026-11-10T00:00:00.000Z', to: '2026-11-11T00:00:00.000Z' };
const jsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

async function setup() {
  const f = await fixture();
  const config = join(f.directory, 'claude');
  const projects = join(config, 'projects'); const folder = join(projects, '-repo'); await mkdir(folder, { recursive: true });
  const source = { ...f.source, id: randomUUID(), configPath: join(config, 'settings.json'), version: '2.1.322' }; registerSource(f.ctx, source);
  const old = async (path: string) => { const past = new Date(Date.now() - 3_600_000); await utimes(path, past, past); };
  return { ...f, source, folder, projects, old, configure: () => configureHistory(f.ctx, source.id, { parser: 'claude-transcript-v1', path: projects }) };
}

test('versões: Claude 2.x a partir de 2.1.318 e Codex 0.167+ continuam aceitos depois de atualizações automáticas', () => {
  for (const version of ['2.1.318', '2.1.322', '2.2.0', '2.10.1']) assert.equal(isClaudeSupported(version), true, version);
  for (const version of ['2.1.317', '1.9.9', '3.0.0', 'v2.1.322', undefined]) assert.equal(isClaudeSupported(version), false, String(version));
  for (const version of ['0.167.0', '0.167.2', '0.170.0']) assert.equal(isCodexSupported(version), true, version);
  for (const version of ['0.166.9', '1.0.0', '']) assert.equal(isCodexSupported(version), false, version);
});

test('transcrição Claude: turnos, ferramentas e subagente sem conteúdo, sem duplicar e com prompt humano separado', async () => {
  const f = await setup();
  try {
    const sid = 'd03b0dcb-3f19-4723-a3e8-0c6a2396da5d';
    const user = (uuid: string, clock: string, promptId: string, content: unknown, extra: object = {}) => ({ type: 'user', uuid, timestamp: at(clock), cwd: f.root, sessionId: sid, promptId, message: { role: 'user', content }, ...extra });
    const reply = (uuid: string, clock: string, content: unknown[] = [{ type: 'text', text: 'SECRET resposta' }]) => ({ type: 'assistant', uuid, timestamp: at(clock), cwd: f.root, sessionId: sid, message: { role: 'assistant', content } });
    await writeFile(join(f.folder, `${sid}.jsonl`), jsonl([
      { type: 'mode', mode: 'default' },
      user('u1', '09:00:00', 'p1', 'SECRET prompt humano', { origin: { kind: 'human' }, promptSource: 'typed' }),
      user('m1', '09:00:01', 'p1', [{ type: 'text', text: '<system-reminder>SECRET</system-reminder>' }], { isMeta: true }),
      reply('a1', '09:00:05', [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'SECRET' } }]),
      user('r1', '09:00:20', 'p1', [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'SECRET', is_error: true }]),
      reply('a2', '09:01:00'),
      'linha inválida',
      user('c1', '09:02:00', 'p2', '<local-command-stdout>SECRET</local-command-stdout>', { isMeta: true }),
      // Prompt automático (notificação de tarefa): turno de IA, mas não é prompt humano.
      user('u2', '09:05:00', 'p3', '<task-notification>SECRET</task-notification>', { origin: { kind: 'task-notification' } }),
      reply('a3', '09:05:30'),
      user('i1', '09:05:40', 'p3', [{ type: 'text', text: '[Request interrupted by user]' }]),
      // Lado de subagente no arquivo principal é ignorado (vem do arquivo próprio).
      { ...reply('s1', '09:06:00'), isSidechain: true },
    ]).replace('"linha inválida"', '{quebrado'));
    const agents = join(f.folder, sid, 'subagents'); await mkdir(agents, { recursive: true });
    await writeFile(join(agents, 'agent-a650b162f53c14c97.jsonl'), jsonl([
      { type: 'user', timestamp: at('09:00:06'), cwd: f.root, isSidechain: true, message: { content: 'SECRET tarefa' } },
      { type: 'assistant', timestamp: at('09:00:10'), cwd: f.root, isSidechain: true, message: { content: [{ type: 'tool_use', id: 'toolu_s', name: 'Read' }] } },
      { type: 'user', timestamp: at('09:00:12'), cwd: f.root, isSidechain: true, message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_s', content: 'SECRET' }] } },
      { type: 'assistant', timestamp: at('09:00:15'), cwd: f.root, isSidechain: true, message: { content: [{ type: 'text', text: 'SECRET' }] } },
    ]));
    await f.old(join(f.folder, `${sid}.jsonl`)); await f.old(join(agents, 'agent-a650b162f53c14c97.jsonl'));
    f.configure();
    const result = await importHistory(f.ctx, f.source.id, range, { limit: 10000 });
    assert.deepEqual(result.warnings, ['HISTORY_RECORDS_SKIPPED']);
    const events = f.allEvents().filter((event) => event.sourceId === f.source.id);
    assert.equal(JSON.stringify(events).includes('SECRET'), false);
    const root = events.filter((event) => !event.nativeAgentId);
    assert.deepEqual(root.map((event) => event.type).sort(), ['session.start', 'tool.end', 'tool.start', 'turn.end', 'turn.end', 'turn.start', 'turn.start', 'turn.submit']);
    assert.deepEqual(root.filter((event) => event.type === 'turn.submit').map((event) => event.occurredAt), [at('09:00:00')]);
    assert.deepEqual(root.filter((event) => event.type === 'turn.end').map((event) => [event.occurredAt, event.payload.outcome]).sort(), [[at('09:01:00'), 'completed'], [at('09:05:30'), 'interrupted']]);
    assert.equal(root.find((event) => event.type === 'tool.end')!.payload.outcome, 'failed');
    const child = events.filter((event) => event.nativeAgentId === 'a650b162f53c14c97');
    assert.deepEqual(child.map((event) => event.type).sort(), ['session.end', 'session.start', 'tool.end', 'tool.start', 'turn.end', 'turn.start']);
    assert.ok(child.every((event) => event.nativeSessionId === sid && event.parentSessionId === sid));
    assert.equal((await importHistory(f.ctx, f.source.id, range, { limit: 10000 })).imported, 0);
    projectSessions(f.ctx, events);
    // IA no relógio: 09:00:00–09:01:00 + 09:05:00–09:05:30; o subagente fica dentro do primeiro turno.
    assert.equal(deriveTime(f.ctx, { projectIds: [f.projectId], ...range, timezone: 'UTC' }).agentWallMs, 90_000);
  } finally { await f.close(); }
});

test('transcrição Claude: pasta alheia é pulada, sessão ainda ativa deixa o último turno para os hooks e fonte errada é recusada', async () => {
  const f = await setup();
  try {
    const turn = (sid: string, cwd: string) => jsonl([
      { type: 'user', uuid: `${sid}-u`, timestamp: at('10:00:00'), cwd, promptId: `${sid}-p`, origin: { kind: 'human' }, message: { content: 'x' } },
      { type: 'assistant', uuid: `${sid}-a`, timestamp: at('10:00:20'), cwd, message: { content: [] } },
    ]);
    await writeFile(join(f.folder, 'outside.jsonl'), turn('outside', join(f.directory, 'alheio'))); await f.old(join(f.folder, 'outside.jsonl'));
    await writeFile(join(f.folder, 'live.jsonl'), turn('live', f.root));
    f.configure();
    const result = await importHistory(f.ctx, f.source.id, range, { limit: 10000 });
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(f.allEvents().filter((event) => event.sourceId === f.source.id).map((event) => `${event.nativeSessionId}:${event.type}`), ['live:session.start']);
    assert.throws(() => configureHistory(f.ctx, f.source.id, { parser: 'opencode-db-v2', path: f.projects }), { code: 'HISTORY_SOURCE_MISMATCH' });
    registerSource(f.ctx, { ...f.source, version: '2.1.300' });
    assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_VERSION_UNSUPPORTED']);
  } finally { await f.close(); }
});
