import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { queueCodex } from '../../src/collectors/codex.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { openStore } from '../../src/core/context.js';
import { listSessions, projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import type { AppContext, WorkEvent } from '../../src/core/contracts.js';

const at = Date.parse('2026-11-05T09:00:00.000Z');
const range = { from: new Date(at).toISOString(), to: new Date(at + 60000).toISOString() };
const parser = 'codex-rollout-v4-0.167.0';
const row = (type: string, payload: Record<string, unknown>, ordinal: number) => ({ type, payload, ordinal, timestamp: '2026-11-05T12:00:00.000Z' });
const events = (ctx: AppContext) => ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY origin_seq').map((r) => JSON.parse(r.document) as WorkEvent);

async function setup(child = false) {
  const f = await fixture(); const root = await realpath(f.root), rootId = randomUUID(), childId = randomUUID();
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'mcp.jsonl');
  const meta = () => row('session_meta', { id: child ? childId : rootId, session_id: rootId, cli_version: source.version, cwd: root, history_mode: 'paginated', source: child ? { subagent: { thread_spawn: { parent_thread_id: rootId, depth: 1 } } } : 'cli', ...(child ? { parent_thread_id: rootId, subagent_history_start_ordinal: 2 } : {}) }, 0);
  const fn = (extra: object = {}, ordinal = child ? 2 : 1) => row('response_item', { type: 'function_call', namespace: 'mcp__catalog', name: 'lookup', call_id: 'call-mcp', arguments: 'PRIVATE_ARGS', ...extra }, ordinal);
  const call = (extra: object = {}, clock: object = {}, ordinal = child ? 3 : 2) => row('event_msg', { type: 'item_completed', thread_id: child ? childId : rootId, turn_id: 'turn-one', started_at_ms: at + 100, completed_at_ms: at + 200, item: { type: 'McpToolCall', id: 'call-mcp', server: 'PRIVATE_SERVER', tool: 'PRIVATE_RAW_TOOL', arguments: { secret: 'PRIVATE_ARGS' }, result: { content: ['PRIVATE_OUTPUT'] }, duration: { secs: 999 }, status: 'completed', ...extra }, ...clock }, ordinal);
  const rows = () => [meta(), ...(child ? [row('turn_context', { turn_id: 'turn-one', cwd: f.directory, thread_id: rootId }, 1)] : []), fn(), call()];
  const write = async (value = rows(), selected = parser) => { await writeFile(path, value.map((r) => JSON.stringify(r)).join('\n') + '\n'); configureHistory(f.ctx, source.id, { parser: selected, path }); };
  return { ...f, root, rootId, childId, source, path, meta, fn, call, rows, write };
}

test('Codex v4: MCP canônico correlacionado e privado', async (t) => {
  for (const [namespace, name, expected] of [
    ['mcp__catalog', 'lookup', 'mcp__catalog__lookup'],
    ['catalog', 'lookup', 'mcp__catalog__lookup'],
    ['mcp__catalog_a1b2c3d4e5f6', 'lookup_0123456789ab', 'mcp__catalog_a1b2c3d4e5f6__lookup_0123456789ab'],
    ['mcp__catalog___', '__lookup', 'mcp__catalog__lookup'],
  ]) await t.test(namespace!, async () => {
    const f = await setup();
    try {
      await f.write([f.meta(), f.fn({ namespace, name }), f.call()]);
      const result = await importHistory(f.ctx, f.source.id, range); const values = f.allEvents();
      assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
      assert.deepEqual(values.map((e) => [e.type, e.occurredAt, e.payload]), [
        ['tool.start', new Date(at + 100).toISOString(), { toolName: expected, toolUseId: 'call-mcp' }],
        ['tool.end', new Date(at + 200).toISOString(), { toolName: expected, toolUseId: 'call-mcp', outcome: 'completed' }],
      ]);
      assert.ok(values.every((e) => e.cwd === f.root && e.nativeSessionId === f.rootId && e.sourceId === f.source.id));
      assert.equal(JSON.stringify({ result, values }).includes('PRIVATE_'), false);
      projectSessions(f.ctx, values); const filter = { ...range, projectIds: [f.projectId], timezone: 'UTC' };
      assert.equal(listSessions(f.ctx, filter)[0]!.provenance, 'imported'); assert.equal(deriveTime(f.ctx, filter).humanEstimatedMs, 0);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    } finally { await f.close(); }
  });
});

test('Codex v4: MCP recibos live e histórico', async (t) => {
  for (const child of [false, true]) for (const order of ['history-first', 'live-first']) await t.test(`${child}/${order}`, async () => {
    const f = await setup(child); let ctx = f.ctx;
    const live = () => {
      for (const hook_event_name of ['PreToolUse', 'PostToolUse']) queueCodex(ctx.config.dataDir, f.source.id, { session_id: f.rootId, ...(child ? { agent_id: f.childId } : {}), cwd: f.root, turn_id: 'turn-one', hook_event_name, tool_name: 'mcp__catalog__lookup', tool_use_id: 'call-mcp' }, { originId: 'live', occurredAt: new Date(at + 5000).toISOString() });
      drainQueue(ctx);
    };
    try {
      if (order === 'live-first') live();
      await f.write(); assert.equal((await importHistory(ctx, f.source.id, range)).imported, order === 'live-first' ? 0 : 2);
      const before = JSON.stringify(events(ctx)); live(); assert.equal(JSON.stringify(events(ctx)), before);
      assert.equal(events(ctx).length, 2); assert.equal(events(ctx)[0]!.occurredAt, new Date(at + (order === 'live-first' ? 5000 : 100)).toISOString());
      assert.ok(events(ctx).every((e) => e.nativeSessionId === f.rootId && (child ? e.nativeAgentId === f.childId && e.parentSessionId === f.rootId : !e.nativeAgentId)));
      await ctx.shutdown(); ctx = await openStore(ctx.config.dataDir);
      assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0); assert.equal(JSON.stringify(events(ctx)), before);
      await writeFile(f.path, [f.meta(), ...(child ? [row('turn_context', { turn_id: 'turn-one', cwd: f.directory }, 1)] : []), f.fn({ name: 'changed' }), f.call()].map((r) => JSON.stringify(r)).join('\n') + '\n');
      assert.ok((await importHistory(ctx, f.source.id, range)).warnings.includes('HISTORY_EVENT_CONFLICT')); assert.equal(JSON.stringify(events(ctx)), before);
    } finally { await ctx.shutdown(); await rm(f.directory, { recursive: true, force: true }); }
  });
});

test('Codex v4: MCP incompleto não ganha identidade ou duração', async (t) => {
  for (const [issue, warning, count] of [
    ['missing', 'HISTORY_MCP_IDENTITY_UNAVAILABLE', 0], ['namespace', 'HISTORY_MCP_IDENTITY_UNAVAILABLE', 0],
    ['other-id', 'HISTORY_MCP_IDENTITY_UNAVAILABLE', 0], ['failed', 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0],
    ['inProgress', 'HISTORY_TOOL_STATUS_UNSUPPORTED', 0], ['no-time', 'HISTORY_TIMESTAMPS_UNAVAILABLE', 0],
    ['end-only', 'HISTORY_TIMESTAMPS_UNAVAILABLE', 1], ['reversed', 'HISTORY_RECORD_INVALID', 0],
    ['conflict', 'HISTORY_EVENT_CONFLICT', 0], ['bad-name', 'HISTORY_RECORD_INVALID', 0],
    ['v3', 'HISTORY_TOOL_TYPE_UNSUPPORTED', 0],
  ] as const) await t.test(issue, async () => {
    const f = await setup();
    try {
      const rows = f.rows();
      if (issue === 'missing') rows[1]!.payload.type = 'function_call_output';
      if (issue === 'namespace') delete rows[1]!.payload.namespace;
      if (issue === 'other-id') rows[1]!.payload.call_id = 'other';
      if (issue === 'failed' || issue === 'inProgress') (rows[2]!.payload.item as Record<string, unknown>).status = issue;
      if (issue === 'no-time' || issue === 'end-only') rows[2]!.payload.started_at_ms = 0;
      if (issue === 'no-time') rows[2]!.payload.completed_at_ms = 0;
      if (issue === 'reversed') rows[2]!.payload.started_at_ms = at + 300;
      if (issue === 'conflict') rows.push(f.fn({ name: 'different' }, 3));
      if (issue === 'bad-name') rows[1]!.payload.name = 'PRIVATE NAME';
      await f.write(rows, issue === 'v3' ? 'codex-rollout-v3-0.167.0' : parser);
      const result = await importHistory(f.ctx, f.source.id, range);
      assert.equal(result.imported, count); assert.equal(result.complete, false); assert.ok(result.warnings.includes(warning));
      assert.ok(f.allEvents().every((e) => e.type === 'tool.end')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
      if (!count) assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
    } finally { await f.close(); }
  });
});

test('Codex v4: linhagem e prefixos não viram execução própria', async (t) => {
  for (const issue of ['inherited-name', 'nested', 'fork', 'revert', 'child-revert', 'thread', 'outside', 'resume']) await t.test(issue, async () => {
    const f = await setup(issue === 'inherited-name' || issue === 'nested' || issue === 'child-revert');
    try {
      const rows = f.rows();
      if (issue === 'inherited-name') { rows[1] = f.fn({}, 1); rows[2]!.payload.type = 'function_call_output'; }
      if (issue === 'nested') rows[0]!.payload.source = { subagent: { thread_spawn: { parent_thread_id: randomUUID(), depth: 2 } } };
      if (issue === 'fork') rows[0]!.payload.forked_from_id = randomUUID();
      if (issue === 'revert' || issue === 'child-revert') {
        rows[0]!.payload.history_base = { thread_id: randomUUID(), end_ordinal_exclusive: 20, end_byte_offset: 10000 };
        for (const r of rows) r.ordinal += 20;
        if (issue === 'child-revert') rows[0]!.payload.subagent_history_start_ordinal = 22;
      }
      if (issue === 'thread') rows.push(row('event_msg', { type: 'token_count', thread_id: randomUUID() }, 3));
      if (issue === 'outside') rows.push(row('turn_context', { turn_id: 'turn-one', cwd: f.directory }, 3));
      if (issue === 'resume') rows.push(f.fn({}, 3), f.call({}, {}, 4));
      await f.write(rows); const result = await importHistory(f.ctx, f.source.id, range);
      if (issue === 'resume') {
        assert.equal(result.imported, 2); assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
        projectSessions(f.ctx, f.allEvents()); const time = deriveTime(f.ctx, { ...range, projectIds: [f.projectId], timezone: 'UTC' });
        assert.equal(time.agentAccumulatedMs, 100); assert.equal(time.agentWallMs, 100); assert.equal(time.humanEstimatedMs, 0);
      } else {
        assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);
        assert.ok(result.warnings.includes(issue === 'inherited-name' ? 'HISTORY_MCP_IDENTITY_UNAVAILABLE' : issue === 'thread' ? 'HISTORY_SOURCE_MISMATCH' : issue === 'outside' ? 'HISTORY_ROOT_UNAUTHORIZED' : 'HISTORY_LINEAGE_UNSUPPORTED'));
        assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
      }
    } finally { await f.close(); }
  });
});
