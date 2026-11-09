import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { queueCodex } from '../../src/collectors/codex.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { openStore } from '../../src/core/context.js';
import type { AppContext, WorkEvent } from '../../src/core/contracts.js';

const at = Date.parse('2026-11-05T09:00:00.000Z');
const range = { from: new Date(at).toISOString(), to: new Date(at + 60000).toISOString() };
const parser = 'codex-rollout-v3-0.167.0';
const line = (type: string, payload: Record<string, unknown>, ordinal: number) => ({ timestamp: '2026-11-05T12:00:00.000Z', type, payload, ordinal });
const events = (ctx: AppContext) => ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY origin_seq').map((r) => JSON.parse(r.document) as WorkEvent);

async function setup(child = false) {
  const f = await fixture(); const root = await realpath(f.root); const rootId = randomUUID(), childId = randomUUID();
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'dynamic.jsonl');
  const meta = () => line('session_meta', { id: child ? childId : rootId, session_id: rootId, cwd: root, cli_version: source.version, history_mode: 'paginated', source: child ? { subagent: { thread_spawn: { parent_thread_id: rootId, depth: 1 } } } : 'cli', ...(child ? { parent_thread_id: rootId, subagent_history_start_ordinal: 2 } : {}) }, 0);
  const item = (extra: object = {}) => ({ type: 'DynamicToolCall', id: 'call-dynamic', tool: 'lookup', namespace: 'catalog.', status: 'completed', success: true, arguments: { secret: 'PRIVATE_ARGS' }, content_items: [{ type: 'input_text', text: 'PRIVATE_OUTPUT' }], duration: { secs: 999, nanos: 0 }, ...extra });
  const call = (extra: object = {}, clock: object = {}) => line('event_msg', { type: 'item_completed', thread_id: child ? childId : rootId, turn_id: 'turn-one', started_at_ms: at + 100, completed_at_ms: at + 200, item: item(extra), ...clock }, child ? 2 : 1);
  const rows = (extra: object = {}, clock: object = {}) => [meta(), ...(child ? [line('turn_context', { turn_id: 'turn-one', cwd: f.directory, thread_id: rootId }, 1)] : []), call(extra, clock)];
  const write = async (value = rows(), selected = parser) => { await writeFile(path, value.map((r) => JSON.stringify(r)).join('\n') + '\n'); configureHistory(f.ctx, source.id, { parser: selected, path }); };
  return { ...f, root, rootId, childId, source, path, meta, call, rows, write, child };
}

test('Codex v3: dynamic canônico, horários e privacidade', async (t) => {
  for (const [namespace, tool, expected] of [[undefined, 'lookup', 'lookup'], [null, 'lookup', 'lookup'], ['', 'lookup', 'lookup'], ['functions', 'lookup', 'lookup'], ['catalog.', 'lookup', 'catalog.lookup'], ['catalog', 'lookup', 'cataloglookup'], ['multi_agent_v1', 'spawn_agent', 'spawn_agent']] as const) await t.test(String(namespace), async () => {
    const f = await setup(); const nested = join(f.root, 'nested'); await mkdir(nested);
    try {
      await f.write([...f.rows({ namespace, tool }), line('turn_context', { turn_id: 'turn-one', cwd: nested }, 2)]);
      const result = await importHistory(f.ctx, f.source.id, range); const rows = f.allEvents();
      assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
      assert.deepEqual(rows.map((e) => e.type), ['tool.start', 'tool.end']);
      assert.deepEqual(rows.map((e) => e.occurredAt), [100, 200].map((ms) => new Date(at + ms).toISOString()));
      assert.deepEqual(rows.map((e) => e.payload), [{ toolName: expected, toolUseId: 'call-dynamic' }, { toolName: expected, toolUseId: 'call-dynamic', outcome: 'completed' }]);
      assert.ok(rows.every((e) => e.cwd === nested && e.nativeSessionId === f.rootId && e.sourceId === f.source.id));
      assert.equal(JSON.stringify({ rows, result }).includes('PRIVATE_'), false);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    } finally { await f.close(); }
  });
});

test('Codex v3: dynamic compartilha recibos live e replay', async (t) => {
  for (const child of [false, true]) for (const order of ['history-first', 'live-first']) await t.test(`${child}/${order}`, async () => {
    const f = await setup(child); let ctx = f.ctx;
    const live = () => {
      for (const hook_event_name of ['PreToolUse', 'PostToolUse']) queueCodex(ctx.config.dataDir, f.source.id, { session_id: f.rootId, ...(child ? { agent_id: f.childId } : {}), cwd: f.root, turn_id: 'turn-one', hook_event_name, tool_name: 'catalog.lookup', tool_use_id: 'call-dynamic' }, { originId: 'live', occurredAt: new Date(at + 5000).toISOString() });
      drainQueue(ctx);
    };
    try {
      if (order === 'live-first') live();
      await f.write(); const imported = await importHistory(ctx, f.source.id, range); assert.equal(imported.imported, order === 'live-first' ? 0 : 2);
      const before = JSON.stringify(events(ctx)); live(); assert.equal(JSON.stringify(events(ctx)), before);
      assert.equal(events(ctx).length, 2); assert.equal(events(ctx)[0]!.occurredAt, new Date(at + (order === 'live-first' ? 5000 : 100)).toISOString());
      assert.ok(events(ctx).every((e) => e.nativeSessionId === f.rootId && (child ? e.nativeAgentId === f.childId && e.parentSessionId === f.rootId : !e.nativeAgentId)));
      await ctx.shutdown(); ctx = await openStore(ctx.config.dataDir);
      assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0); assert.equal(JSON.stringify(events(ctx)), before);
      await writeFile(f.path, f.rows({ tool: 'changed' }).map((r) => JSON.stringify(r)).join('\n') + '\n');
      assert.ok((await importHistory(ctx, f.source.id, range)).warnings.includes('HISTORY_EVENT_CONFLICT')); assert.equal(JSON.stringify(events(ctx)), before);
    } finally { await ctx.shutdown(); await rm(f.directory, { recursive: true, force: true }); }
  });
});

test('Codex v3: limites de contrato não fabricam pares', async (t) => {
  for (const [name, extra, clock, warning, count] of [
    ['failed', { status: 'failed', success: false }, {}, 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0],
    ['in_progress', { status: 'in_progress' }, {}, 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0],
    ['missing-success', { success: undefined }, {}, 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0],
    ['false-success', { success: false }, {}, 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0],
    ['mcp', { type: 'McpToolCall', server: 'catalog' }, {}, 'HISTORY_TOOL_TYPE_UNSUPPORTED', 0],
    ['bad-namespace', { namespace: { secret: 'PRIVATE_NAMESPACE' } }, {}, 'HISTORY_RECORD_INVALID', 0],
    ['bad-name', { tool: 'PRIVATE NAME' }, {}, 'HISTORY_RECORD_INVALID', 0],
    ['long-name', { namespace: 'x'.repeat(160) }, {}, 'HISTORY_RECORD_INVALID', 0],
    ['no-time', {}, { started_at_ms: undefined, completed_at_ms: undefined }, 'HISTORY_TIMESTAMPS_UNAVAILABLE', 0],
    ['zero-time', {}, { started_at_ms: 0, completed_at_ms: 0 }, 'HISTORY_TIMESTAMPS_UNAVAILABLE', 0],
    ['end-only', {}, { started_at_ms: 0 }, 'HISTORY_TIMESTAMPS_UNAVAILABLE', 1],
    ['reversed', {}, { started_at_ms: at + 300 }, 'HISTORY_RECORD_INVALID', 0],
    ['legacy', {}, {}, 'HISTORY_TOOL_HISTORY_UNSUPPORTED', 0],
    ['no-ordinal', {}, {}, 'HISTORY_TOOL_HISTORY_UNSUPPORTED', 0],
    ['v2', {}, {}, 'HISTORY_TOOL_TYPE_UNSUPPORTED', 0],
  ] as const) await t.test(name, async () => {
    const f = await setup();
    try {
      const rows = f.rows(extra, clock);
      if (name === 'legacy') rows[0]!.payload.history_mode = 'legacy';
      if (name === 'no-ordinal') for (const row of rows) delete (row as { ordinal?: number }).ordinal;
      await f.write(rows, name === 'v2' ? 'codex-rollout-v2-0.167.0' : parser);
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, count); assert.equal(result.complete, false); assert.ok(result.warnings.includes(warning));
      assert.ok(f.allEvents().every((e) => e.type === 'tool.end')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
    } finally { await f.close(); }
  });
});

test('Codex v3: preflight conserva autorização e linhagem', async (t) => {
  for (const child of [false, true]) for (const issue of ['thread', 'outside', 'depth']) await t.test(`${child}/${issue}`, async () => {
    const f = await setup(child);
    try {
      const rows = f.rows();
      if (issue === 'thread') rows.push(line('event_msg', { type: 'token_count', thread_id: randomUUID() }, child ? 3 : 2));
      if (issue === 'outside') rows.push(line('turn_context', { turn_id: 'turn-one', cwd: f.directory }, child ? 3 : 2));
      if (issue === 'depth') rows[0]!.payload.source = { subagent: { thread_spawn: { parent_thread_id: randomUUID(), depth: 2 } } };
      await f.write(rows); const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);
      assert.ok(result.warnings.includes(issue === 'thread' ? 'HISTORY_SOURCE_MISMATCH' : issue === 'outside' ? 'HISTORY_ROOT_UNAUTHORIZED' : 'HISTORY_LINEAGE_UNSUPPORTED'));
      assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
    } finally { await f.close(); }
  });
});
