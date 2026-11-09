import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource, publishCaptureManifest } from '../../src/collectors/source-config.js';
import { queueCodex, getCodexDiagnostic } from '../../src/collectors/codex.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { projectSessions, listSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import { openStore } from '../../src/core/context.js';
import type { AppContext, WorkEvent } from '../../src/core/contracts.js';

const at = Date.parse('2026-11-05T09:00:00.000Z');
const range = { from: new Date(at).toISOString(), to: new Date(at + 120000).toISOString() };
const parser = 'codex-rollout-v2-0.167.0';
const line = (type: string, payload: object, ordinal: number) => ({ timestamp: '2026-11-05T12:00:00.000Z', type, payload, ordinal });
const bytes = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const events = (ctx: AppContext) => ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY origin_seq').map((r) => JSON.parse(r.document) as WorkEvent);

async function setup() {
  const f = await fixture(); const root = await realpath(f.root); const rootId = randomUUID(), childId = randomUUID();
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'items.jsonl');
  const meta = (child = false, extra: object = {}) => line('session_meta', { id: child ? childId : rootId, session_id: rootId, cwd: root, cli_version: '0.167.0', timestamp: '2026-11-05T08:00:00.000Z', source: child ? { subagent: { thread_spawn: { parent_thread_id: rootId, depth: 1 } } } : 'cli', history_mode: 'paginated', ...(child ? { parent_thread_id: rootId, thread_source: 'subagent', subagent_history_start_ordinal: 4 } : {}), ...extra }, 0);
  const tool = (type: 'CommandExecution' | 'FileChange', ordinal: number, child = false, extra: object = {}) => line('event_msg', { type: 'item_completed', thread_id: child ? childId : rootId, turn_id: 'same-turn', started_at_ms: at + (child ? 20100 : type === 'CommandExecution' ? 100 : 300), completed_at_ms: at + (child ? 20200 : type === 'CommandExecution' ? 200 : 400), item: { type, id: type === 'CommandExecution' ? 'call-one' : 'call-two', status: 'completed', source: 'unified_exec_startup', command: ['PRIVATE_COMMAND'], aggregated_output: 'PRIVATE_OUTPUT', changes: { '/PRIVATE_PATH': 'PRIVATE_DIFF' }, cwd: 'file:///PRIVATE_CWD', duration: { secs: 999, nanos: 0 } }, ...extra }, ordinal);
  const rootTools = () => [meta(), tool('CommandExecution', 1), tool('FileChange', 2)];
  const childRows = () => [meta(true), line('session_meta', { id: randomUUID(), cwd: f.directory, cli_version: 'PRIVATE_PARENT_VERSION' }, 1), line('event_msg', { type: 'task_started', turn_id: 'same-turn', started_at: at / 1000 }, 2), line('event_msg', { type: 'task_complete', turn_id: 'same-turn', completed_at: at / 1000 + 60 }, 3), line('event_msg', { type: 'task_started', turn_id: 'same-turn', started_at: at / 1000 + 10, thread_id: childId }, 4), line('turn_context', { turn_id: 'same-turn', cwd: root }, 5), tool('CommandExecution', 6, true), line('event_msg', { type: 'task_complete', turn_id: 'same-turn', completed_at: at / 1000 + 40, thread_id: childId }, 7)];
  const write = async (rows: unknown[], selected = parser) => { await writeFile(path, bytes(rows)); configureHistory(f.ctx, source.id, { parser: selected, path }); };
  const hook = (hook_event_name: string, child = false, extra: object = {}) => ({ hook_event_name, session_id: rootId, ...(child ? { agent_id: childId } : {}), turn_id: 'same-turn', cwd: root, ...extra });
  return { ...f, root, rootId, childId, source, path, meta, tool, rootTools, childRows, write, hook };
}

test('Codex v2: ferramentas comprovadas, ms, contexto e privacidade', async () => {
  const f = await setup(); const nested = join(f.root, 'nested'); await mkdir(nested);
  try {
    await f.write([...f.rootTools(), line('turn_context', { turn_id: 'same-turn', cwd: nested }, 3)]);
    const result = await importHistory(f.ctx, f.source.id, range);
    assert.equal(result.imported, 4); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
    const rows = f.allEvents();
    assert.deepEqual(rows.map((e) => e.type), ['tool.start', 'tool.end', 'tool.start', 'tool.end']);
    assert.deepEqual(rows.map((e) => e.occurredAt), [100, 200, 300, 400].map((ms) => new Date(at + ms).toISOString()));
    assert.deepEqual(rows.map((e) => e.type === 'tool.start' || e.type === 'tool.end' ? e.payload.toolName : null), ['Bash', 'Bash', 'apply_patch', 'apply_patch']);
    assert.ok(rows.every((e) => e.cwd === nested && e.sourceId === f.source.id && e.nativeSessionId === f.rootId));
    assert.equal(JSON.stringify(rows).includes('PRIVATE_'), false); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
  } finally { await f.close(); }
});

test('Codex v2: ferramentas e hooks preservam identidade nas duas ordens', async (t) => {
  for (const order of ['history-first', 'live-first']) await t.test(order, async () => {
    const f = await setup();
    const live = () => { for (const [tool_name, tool_use_id] of [['Bash', 'call-one'], ['apply_patch', 'call-two']]) for (const hook of ['PreToolUse', 'PostToolUse']) queueCodex(f.ctx.config.dataDir, f.source.id, f.hook(hook, false, { tool_name, tool_use_id }), { originId: 'live', occurredAt: new Date(at + 5000).toISOString() }); drainQueue(f.ctx); };
    try {
      if (order === 'live-first') live();
      await f.write(f.rootTools()); await importHistory(f.ctx, f.source.id, range);
      const before = JSON.stringify(f.allEvents()); live();
      assert.equal(JSON.stringify(f.allEvents()), before); assert.equal(f.allEvents().length, 4);
      assert.equal(f.allEvents()[0]!.occurredAt, new Date(at + (order === 'live-first' ? 5000 : 100)).toISOString());
      assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
      const changed = f.tool('FileChange', 1, false, { item: { type: 'FileChange', id: 'call-one', status: 'completed' } });
      await f.write([f.meta(), changed]);
      assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_EVENT_CONFLICT'));
      assert.equal(JSON.stringify(f.allEvents()), before);
    } finally { await f.close(); }
  });
});

test('Codex v2: filho direto ignora prefixo herdado e conserva origem e tempos', async () => {
  const f = await setup();
  try {
    await f.write([f.meta(), line('event_msg', { type: 'task_started', turn_id: 'same-turn', started_at: at / 1000 }, 1), line('event_msg', { type: 'task_complete', turn_id: 'same-turn', completed_at: at / 1000 + 60 }, 2)]);
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 2);
    await f.write(f.childRows()); const result = await importHistory(f.ctx, f.source.id, range);
    assert.equal(result.imported, 4); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
    const child = f.allEvents().filter((e) => e.nativeAgentId === f.childId);
    assert.equal(child.length, 4); assert.ok(child.every((e) => e.nativeSessionId === f.rootId && e.parentSessionId === f.rootId && e.cwd === f.root));
    assert.deepEqual(child.map((e) => e.type), ['turn.start', 'tool.start', 'tool.end', 'turn.end']);
    assert.equal(child[0]!.occurredAt, new Date(at + 10000).toISOString());
    assert.deepEqual(child.at(-1)!.payload, { outcome: 'completed' });
    projectSessions(f.ctx, f.allEvents()); const sessions = listSessions(f.ctx, f.filter);
    assert.equal(sessions.length, 2); const parent = sessions.find((s) => !s.nativeAgentId)!, agent = sessions.find((s) => s.nativeAgentId === f.childId)!;
    assert.equal(agent.parentSessionId, parent.id); assert.equal(agent.provenance, 'imported');
    const time = deriveTime(f.ctx, f.filter); assert.equal(time.agentAccumulatedMs, 90000); assert.equal(time.agentWallMs, 60000); assert.equal(time.humanEstimatedMs, 0);
    assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_'), false);
  } finally { await f.close(); }
});

test('Codex v2: filho e hooks SubagentStop coexistem sem duplicação', async (t) => {
  for (const order of ['history-first', 'live-first']) await t.test(order, async () => {
    const f = await setup(); let ctx = f.ctx;
    const live = () => {
      for (const [hook, ms, extra] of [['UserPromptSubmit', 10003, {}], ['PreToolUse', 20103, { tool_name: 'Bash', tool_use_id: 'call-one' }], ['PostToolUse', 20203, { tool_name: 'Bash', tool_use_id: 'call-one' }], ['SubagentStop', 40003, {}]] as const) queueCodex(ctx.config.dataDir, f.source.id, f.hook(hook, true, extra), { originId: 'live', occurredAt: new Date(at + ms).toISOString() });
      drainQueue(ctx);
    };
    try {
      if (order === 'live-first') live(); await f.write(f.childRows()); await importHistory(ctx, f.source.id, range);
      const before = JSON.stringify(events(ctx).filter((e) => e.type !== 'turn.submit')); live();
      assert.equal(JSON.stringify(events(ctx).filter((e) => e.type !== 'turn.submit')), before);
      assert.equal(events(ctx).length, 5); assert.equal(events(ctx).filter((e) => e.type === 'turn.submit').length, 1);
      assert.ok(events(ctx).every((e) => e.nativeAgentId === f.childId));
      assert.equal(getCodexDiagnostic(ctx.config.dataDir, f.source.id)?.code, 'CODEX_CAPTURE_OK');
      await ctx.shutdown(); ctx = await openStore(ctx.config.dataDir);
      assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0); assert.equal(events(ctx).length, 5);
    } finally { await ctx.shutdown(); await rm(f.directory, { recursive: true, force: true }); }
  });
});

test('Codex v2: limitações de ferramenta e interrupção não fabricam evidências', async (t) => {
  for (const [name, item, clock, warning, expected] of [
    ['mcp', { type: 'McpToolCall', id: 'one', status: 'completed' }, {}, 'HISTORY_TOOL_TYPE_UNSUPPORTED', 0],
    ['source', { type: 'CommandExecution', id: 'one', source: 'user_shell', status: 'completed' }, {}, 'HISTORY_TOOL_SOURCE_UNSUPPORTED', 0],
    ...['failed', 'declined', 'in_progress'].map((status) => [status, { type: 'CommandExecution', id: 'one', source: 'unified_exec_startup', status }, {}, 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0] as const),
    ['duration-only', { type: 'CommandExecution', id: 'one', source: 'unified_exec_startup', status: 'completed', duration: 999 }, { started_at_ms: 0, completed_at_ms: 0 }, 'HISTORY_TIMESTAMPS_UNAVAILABLE', 0],
    ['end-only', { type: 'FileChange', id: 'one', status: 'completed' }, { started_at_ms: 0 }, 'HISTORY_TIMESTAMPS_UNAVAILABLE', 1],
  ] as const) await t.test(String(name), async () => {
    const f = await setup();
    try {
      await f.write([f.meta(), f.tool('CommandExecution', 1, false, { item, ...clock })]);
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, expected); assert.equal(result.complete, false); assert.ok(result.warnings.includes(String(warning))); assert.ok(result.warnings.includes('HISTORY_LIFECYCLE_ONLY'));
      assert.ok(f.allEvents().every((e) => e.type === 'tool.end'));
    } finally { await f.close(); }
  });
  const f = await setup();
  try {
    const rows = f.childRows(); rows[7] = line('event_msg', { type: 'turn_aborted', turn_id: 'same-turn', reason: 'interrupted', completed_at: at / 1000 + 40 }, 7);
    await f.write(rows); const result = await importHistory(f.ctx, f.source.id, range);
    assert.ok(result.warnings.includes('HISTORY_CHILD_INTERRUPT_UNAVAILABLE')); assert.equal(result.imported, 3);
    assert.ok(f.allEvents().every((e) => e.nativeAgentId === f.childId && !['turn.end', 'session.interrupt'].includes(e.type)));
  } finally { await f.close(); }
});

test('Codex v2: linhagem e autorização são validadas antes da persistência', async (t) => {
  for (const name of ['parent', 'depth', 'review', 'root-id', 'boundary', 'ordinal', 'fork', 'late-thread', 'own-meta', 'outside', 'paused', 'symlink']) await t.test(name, async () => {
    const f = await setup();
    try {
      const rows = f.childRows(); const meta = rows[0]!.payload as Record<string, unknown>;
      if (name === 'parent') meta.parent_thread_id = randomUUID();
      if (name === 'depth') meta.source = { subagent: { thread_spawn: { parent_thread_id: f.rootId, depth: 2 } } };
      if (name === 'review') meta.source = { subagent: 'review' };
      if (name === 'root-id') meta.session_id = f.childId;
      if (name === 'boundary') delete meta.subagent_history_start_ordinal;
      if (name === 'ordinal') delete (rows[3] as { ordinal?: number }).ordinal;
      if (name === 'fork') meta.forked_from_id = randomUUID();
      if (name === 'late-thread') (rows[7]!.payload as Record<string, unknown>).thread_id = randomUUID();
      if (name === 'own-meta') rows[7] = line('session_meta', { ...meta }, 7);
      if (name === 'outside') (rows[5]!.payload as Record<string, unknown>).cwd = f.directory;
      if (name === 'paused') { f.ctx.db.run('UPDATE project_roots SET enabled = 0'); publishCaptureManifest(f.ctx); }
      if (name === 'symlink') { await symlink(f.directory, join(f.root, 'escape')); (rows[5]!.payload as Record<string, unknown>).cwd = join(f.root, 'escape'); }
      await f.write(rows); const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0); assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
      assert.ok(result.warnings.some((w) => w !== 'HISTORY_LIFECYCLE_ONLY')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
    } finally { await f.close(); }
  });
});

test('Codex v2: limites, retomada e ausência de história própria', async () => {
  const f = await setup();
  try {
    await f.write(f.rootTools()); const original = await readFile(f.path); const controller = new AbortController();
    const cancelled = await importHistory(f.ctx, f.source.id, range, { signal: controller.signal, onProgress: () => controller.abort() });
    assert.equal(cancelled.imported, 1); assert.ok(cancelled.warnings.includes('HISTORY_CANCELLED'));
    const limited = await importHistory(f.ctx, f.source.id, range, { limit: 1 }); assert.equal(limited.imported, 1); assert.ok(limited.warnings.includes('HISTORY_MORE_AVAILABLE'));
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 2); assert.deepEqual(await readFile(f.path), original);
    const extra = JSON.stringify(f.tool('FileChange', 3, false, { item: { type: 'FileChange', id: 'third', status: 'completed' } }));
    await appendFile(f.path, extra.slice(0, 20)); assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_TRUNCATED'));
    await appendFile(f.path, extra.slice(20) + '\n'); assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 2); assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
    await f.write(f.childRows().slice(0, 4)); const none = await importHistory(f.ctx, f.source.id, range);
    assert.equal(none.imported, 0); assert.ok(none.warnings.includes('HISTORY_OWN_HISTORY_UNAVAILABLE'));
    const before = f.allEvents().length;
    await f.write(f.childRows()); await appendFile(f.path, Buffer.from([0xff, 10])); assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
    assert.equal(f.allEvents().length, before);
    await f.write([f.meta()]); await truncate(f.path, 64 * 1024 * 1024 + 1); assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_INPUT_TOO_LARGE'));
    await f.write([f.meta()]); await appendFile(f.path, 'x'.repeat(1024 * 1024 + 1) + '\n'); assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_RECORD_TOO_LARGE'));
    await f.write([f.meta(), ...Array.from({ length: 10000 }, (_, i) => line('event_msg', { type: 'token_count' }, i + 1))]); assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_NATIVE_SCAN_LIMIT'));
  } finally { await f.close(); }
});
