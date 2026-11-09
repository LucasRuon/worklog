import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { normalizeCodex, queueCodex, getCodexDiagnostic } from '../../src/collectors/codex.js';
import { registerSource, publishCaptureManifest } from '../../src/collectors/source-config.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { prepareCapture } from '../../src/collectors/queue.js';
import { projectSessions, listSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import { openStore } from '../../src/core/context.js';
import { stableId } from '../../src/core/policy.js';
import type { AppContext, WorkEvent } from '../../src/core/contracts.js';

const range = { from: '2026-11-05T09:00:00.000Z', to: '2026-11-05T09:02:00.000Z' };
const start = Date.parse(range.from) / 1000;
const jsonl = (values: unknown[]) => values.map((v) => JSON.stringify(v)).join('\n') + '\n';
const row = (type: string, payload: unknown, ordinal?: number) => ({ type, payload, timestamp: '2026-11-05T12:00:00.000Z', ...(ordinal !== undefined ? { ordinal } : {}) });
const all = (ctx: AppContext) => ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY origin_seq').map((r) => JSON.parse(r.document) as WorkEvent);

async function setup() {
  const f = await fixture(); const id = randomUUID();
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'rollout.jsonl');
  const meta = (extra: object = {}) => row('session_meta', { id, session_id: id, cwd: f.root, cli_version: '0.167.0', timestamp: '2026-11-05T08:00:00.000Z', originator: 'codex_cli_rs', history_mode: 'legacy', base_instructions: 'PRIVATE_INSTRUCTIONS', ...extra });
  const hook = (hook_event_name: string, extra: object = {}) => ({ session_id: id, cwd: f.root, turn_id: 'turn-one', hook_event_name, prompt: 'PRIVATE_PROMPT', ...extra });
  const turns = () => [meta(), row('event_msg', { type: 'task_started', turn_id: 'turn-one', started_at: start }), row('event_msg', { type: 'task_complete', turn_id: 'turn-one', started_at: start, completed_at: start + 60, last_agent_message: 'PRIVATE_RESPONSE' })];
  const write = async (values: unknown[]) => { await writeFile(path, jsonl(values)); configureHistory(f.ctx, source.id, { parser: 'codex-rollout-0.167.0', path }); };
  return { ...f, source, id, path, meta, hook, turns, write };
}

test('Codex rollout: lifecycle explícito, contexto, período e privacidade', async (t) => {
  for (const mode of ['legacy', 'paginated']) await t.test(mode, async () => {
    const f = await setup(); await mkdir(join(f.root, 'pasta á')); const nested = await realpath(join(f.root, 'pasta á'));
    try {
      const records = [f.meta({ history_mode: mode }),
        row('event_msg', { type: 'task_started', turn_id: 'turn-one', started_at: start }),
        row('turn_context', { turn_id: 'turn-one', cwd: nested, user_instructions: 'PRIVATE_CONTEXT' }),
        row('event_msg', { type: 'task_complete', turn_id: 'turn-one', started_at: start, completed_at: start + 60, last_agent_message: 'PRIVATE_RESPONSE' }),
        row('event_msg', { type: 'turn_started', turn_id: 'outside', started_at: start + 120 })];
      await f.write(records); const before = await readFile(f.path);
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
      const events = f.allEvents(); assert.deepEqual(events.map((e) => e.type), ['turn.start', 'turn.end']);
      assert.deepEqual(events.map((e) => e.occurredAt), ['2026-11-05T09:00:00.000Z', '2026-11-05T09:01:00.000Z']);
      assert.ok(events.every((e) => e.cwd === nested && e.sourceId === f.source.id && e.nativeSessionId === f.id));
      projectSessions(f.ctx, events); assert.equal(deriveTime(f.ctx, f.filter).agentAccumulatedMs, 60_000); assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 0);
      const sessions = listSessions(f.ctx, f.filter); assert.equal(sessions.length, 1); assert.equal(sessions[0]!.provenance, 'imported'); assert.equal(sessions[0]!.complete, false);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
      assert.equal(JSON.stringify(events).includes('PRIVATE_'), false); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
      assert.deepEqual(await readFile(f.path), before);
    } finally { await f.close(); }
  });
});

test('Codex rollout: sobreposição live nas duas ordens e recibo legado', async (t) => {
  for (const order of ['live-first', 'history-first', 'legacy-receipt']) await t.test(order, async () => {
    const f = await setup(); let ctx = f.ctx;
    try {
      const observed = { originId: 'live', occurredAt: '2026-11-05T09:00:03.000Z' };
      if (order === 'live-first') { queueCodex(ctx.config.dataDir, f.source.id, f.hook('UserPromptSubmit'), observed); drainQueue(ctx); }
      if (order === 'legacy-receipt') {
        const batch = prepareCapture(ctx.config.dataDir, normalizeCodex(f.source, f.hook('UserPromptSubmit'), observed)).events;
        await mkdir(join(ctx.config.dataDir, 'codex-receipts'), { mode: 0o700 });
        await writeFile(join(ctx.config.dataDir, 'codex-receipts', `${stableId(f.source.id, ...batch.map((e) => e.eventId))}.json`), JSON.stringify(batch), { mode: 0o600 });
      }
      await f.write(f.turns()); await importHistory(ctx, f.source.id, range);
      const before = all(ctx).filter((e) => e.type === 'turn.start' || e.type === 'turn.end').map((e) => JSON.stringify(e));
      const started = all(ctx).find((e) => e.type === 'turn.start')!;
      assert.equal(started.occurredAt, order === 'history-first' ? range.from : observed.occurredAt);
      queueCodex(ctx.config.dataDir, f.source.id, f.hook('UserPromptSubmit'), { ...observed, occurredAt: '2026-11-05T09:00:09.000Z' });
      queueCodex(ctx.config.dataDir, f.source.id, f.hook('Stop'), { ...observed, occurredAt: '2026-11-05T09:01:04.000Z' });
      drainQueue(ctx);
      assert.deepEqual(all(ctx).filter((e) => e.type === 'turn.start' || e.type === 'turn.end').map((e) => JSON.stringify(e)), before);
      assert.equal(all(ctx).length, 3); assert.equal(all(ctx).filter((e) => e.type === 'turn.submit').length, 1);
      assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0);
      assert.equal(getCodexDiagnostic(ctx.config.dataDir, f.source.id)?.code, 'CODEX_CAPTURE_OK');
      assert.equal((await readdir(join(ctx.config.dataDir, 'queue'))).some((name) => name.endsWith('.rejected')), false);
      await ctx.shutdown(); ctx = await openStore(ctx.config.dataDir);
      assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0); assert.equal(all(ctx).length, 3);
    } finally { await ctx.shutdown(); await rm(f.directory, { recursive: true, force: true }); }
  });
});

test('Codex rollout: conflitos conservam eventos imutáveis e falha explícita', async () => {
  const f = await setup();
  try {
    queueCodex(f.ctx.config.dataDir, f.source.id, f.hook('Stop'), { originId: 'stop', occurredAt: '2026-11-05T09:01:00.000Z' }); drainQueue(f.ctx);
    const before = JSON.stringify(f.allEvents());
    await f.write([f.meta(), row('event_msg', { type: 'task_complete', turn_id: 'turn-one', completed_at: start + 60, error: { message: 'PRIVATE_FAILURE' } })]);
    const failed = await importHistory(f.ctx, f.source.id, range); assert.ok(failed.warnings.includes('HISTORY_EVENT_CONFLICT')); assert.equal(failed.imported, 0); assert.equal(JSON.stringify(f.allEvents()), before);
    assert.equal(JSON.stringify(failed).includes('PRIVATE_'), false);
  } finally { await f.close(); }
  const g = await setup();
  try {
    await g.write([g.meta(), row('event_msg', { type: 'task_complete', turn_id: 'turn-one', completed_at: start + 60, error: { message: 'PRIVATE_FAILURE' } })]);
    assert.equal((await importHistory(g.ctx, g.source.id, range)).imported, 1);
    const before = JSON.stringify(g.allEvents());
    assert.equal(queueCodex(g.ctx.config.dataDir, g.source.id, g.hook('Stop')), 0);
    assert.equal(getCodexDiagnostic(g.ctx.config.dataDir, g.source.id)?.code, 'CODEX_EVENT_CONFLICT');
    assert.equal(JSON.stringify(g.allEvents()), before);
  } finally { await g.close(); }
});

test('Codex rollout: horários ausentes, falhas e interrupções não são fabricados', async () => {
  const f = await setup();
  try {
    await f.write([f.meta(),
      row('event_msg', { type: 'task_started', turn_id: 'missing' }),
      row('event_msg', { type: 'task_complete', turn_id: 'zero', completed_at: 0, duration_ms: 60_000 }),
      row('event_msg', { type: 'task_complete', turn_id: 'failed', completed_at: start + 60, error: { message: 'PRIVATE_ERROR' } }),
      row('event_msg', { type: 'turn_aborted', turn_id: 'aborted', reason: 'interrupted', completed_at: start + 61 })]);
    const result = await importHistory(f.ctx, f.source.id, range);
    assert.ok(result.warnings.includes('HISTORY_TIMESTAMPS_UNAVAILABLE')); assert.equal(result.imported, 3);
    assert.deepEqual(f.allEvents().map((e) => [e.type, e.payload]), [['turn.end', { turnId: 'failed', outcome: 'failed' }], ['turn.end', { turnId: 'aborted', outcome: 'interrupted' }], ['session.interrupt', { reason: 'user' }]]);
    assert.ok(f.allEvents().every((e) => e.occurredAt.startsWith('2026-11-05T09:01:')));
    projectSessions(f.ctx, f.allEvents()); assert.equal(deriveTime(f.ctx, f.filter).agentAccumulatedMs, 0);
    assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_'), false);
  } finally { await f.close(); }
});

test('Codex rollout: contrato e autorização negam entradas não suportadas', async (t) => {
  const cases: [string, (f: Awaited<ReturnType<typeof setup>>) => Promise<unknown[]>][] = [
    ['version', async (f) => [f.meta({ cli_version: '0.168.0' })]],
    ['source-version', async (f) => { registerSource(f.ctx, { ...f.source, version: '0.168.0' }); return [f.meta()]; }],
    ['invalid-id', async (f) => [f.meta({ id: 'not-a-native-thread', session_id: 'not-a-native-thread' })]],
    ['outside', async (f) => [f.meta({ cwd: f.directory })]],
    ['paused', async (f) => { f.ctx.db.run('UPDATE project_roots SET enabled = 0'); publishCaptureManifest(f.ctx); return [f.meta()]; }],
    ['symlink', async (f) => { await symlink(f.directory, join(f.root, 'escape')); return [f.meta({ cwd: join(f.root, 'escape') })]; }],
    ['thread', async (f) => [f.meta({ session_id: randomUUID() })]],
    ['fork', async (f) => [f.meta({ forked_from_id: randomUUID() })]],
    ['prefix', async (f) => [f.meta({ history_base: { thread_id: randomUUID(), end_ordinal_exclusive: 5, end_byte_offset: 1024 } })]],
    ['inherited', async (f) => [f.meta({ subagent_history_start_ordinal: 0 })]],
    ['review-subagent', async (f) => [f.meta({ source: { subagent: 'review' } })]],
    ['spawn-subagent', async (f) => [f.meta({ source: { subagent: { thread_spawn: { parent_thread_id: randomUUID(), depth: 1 } } } })]],
    ['thread-source-subagent', async (f) => [f.meta({ thread_source: 'subagent' })]],
    ['thread-source-review', async (f) => [f.meta({ thread_source: 'guardian_review' })]],
    ['late-thread-mismatch', async (f) => [f.meta(), row('event_msg', { type: 'task_started', turn_id: 'turn-one', started_at: start }), row('event_msg', { type: 'task_complete', turn_id: 'turn-one', completed_at: start + 60, thread_id: randomUUID() })]],
    ['mode', async (f) => [f.meta({ history_mode: 'PRIVATE_FUTURE' })]],
    ['context', async (f) => [f.meta(), row('turn_context', { turn_id: 'turn-one', cwd: f.directory })]],
    ['settings-cwd', async (f) => { const nested = join(f.root, 'moved'); await mkdir(nested); return [f.meta(), row('event_msg', { type: 'thread_settings_applied', thread_settings: { cwd: nested } })]; }],
  ];
  for (const [name, input] of cases) await t.test(name, async () => {
    const f = await setup();
    try {
      await f.write([...(await input(f)), ...f.turns().slice(1)]);
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);
      assert.ok(result.warnings.some((w) => w !== 'HISTORY_LIFECYCLE_ONLY')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
      assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
    } finally { await f.close(); }
  });
  const f = await setup();
  try {
    const claudeId = f.ctx.db.get<{ id: string }>("SELECT id FROM sources WHERE tool = 'claude'")!.id;
    assert.throws(() => configureHistory(f.ctx, claudeId, { parser: 'codex-rollout-0.167.0', path: f.path }), { code: 'HISTORY_SOURCE_MISMATCH' });
  } finally { await f.close(); }
});

test('Codex rollout: cancelamento, limite e truncamento retomáveis', async () => {
  const f = await setup();
  try {
    const records = [...f.turns(), row('event_msg', { type: 'turn_started', turn_id: 'two', started_at: start + 61 }), row('event_msg', { type: 'turn_complete', turn_id: 'two', completed_at: start + 90 })];
    await f.write(records); const before = await readFile(f.path);
    const controller = new AbortController();
    const cancelled = await importHistory(f.ctx, f.source.id, range, { signal: controller.signal, onProgress: () => controller.abort() });
    assert.equal(cancelled.imported, 1); assert.ok(cancelled.warnings.includes('HISTORY_CANCELLED'));
    const limited = await importHistory(f.ctx, f.source.id, range, { limit: 1 }); assert.equal(limited.imported, 1); assert.ok(limited.warnings.includes('HISTORY_MORE_AVAILABLE'));
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 2); assert.equal(f.allEvents().length, 4);
    assert.deepEqual(await readFile(f.path), before);
    const tail = JSON.stringify(row('event_msg', { type: 'task_started', turn_id: 'third', started_at: start + 100 }));
    await appendFile(f.path, tail.slice(0, 20));
    assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_TRUNCATED'));
    await appendFile(f.path, tail.slice(20) + '\n');
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 1); assert.equal(f.allEvents().length, 5);
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
  } finally { await f.close(); }
});

test('Codex rollout: limites, sequência e schemas desconhecidos', async (t) => {
  for (const name of ['symlink', 'directory', 'size', 'line', 'utf8', 'count', 'ordinal', 'schema']) await t.test(name, async () => {
    const f = await setup();
    try {
      await f.write([f.meta()]);
      if (name === 'symlink') { await rm(f.path); await symlink(join(f.directory, 'missing'), f.path); }
      if (name === 'directory') { await rm(f.path); await mkdir(f.path); }
      if (name === 'size') await truncate(f.path, 64 * 1024 * 1024 + 1);
      if (name === 'line') await appendFile(f.path, 'PRIVATE_'.repeat(140000) + '\n');
      if (name === 'utf8') await appendFile(f.path, Buffer.from([0xff, 10]));
      if (name === 'count') await appendFile(f.path, jsonl(Array.from({ length: 10000 }, () => row('event_msg', { type: 'token_count', info: 'PRIVATE_TOKENS' }))));
      if (name === 'ordinal') await f.write([{ ...f.meta(), ordinal: 0 }, row('event_msg', { type: 'task_started', turn_id: 'one', started_at: start }, 2)]);
      if (name === 'schema') await appendFile(f.path, jsonl([row('PRIVATE_FUTURE_SCHEMA', { contents: 'PRIVATE_CONTENT' })]));
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);
      assert.ok(result.warnings.some((w) => w !== 'HISTORY_LIFECYCLE_ONLY')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
    } finally { await f.close(); }
  });
});
