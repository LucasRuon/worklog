import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { assertRecord, exactKeys, DomainError, shortId, uuid, type AppContext, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { resolveProject } from '../core/projects.js';
import { normalizeCodex } from './codex.js';

type NativeRow = { type: string; payload: Record<string, unknown>; timestamp: string; ordinal?: number };
export type CodexHistoryRecord = { value: EventInput; codexBatchIds: string[] } | { warning: string };
const envelopes = new Set(['session_meta', 'turn_context', 'event_msg', 'response_item', 'compacted', 'dynamic_tools_updated', 'inter_agent_communication', 'inter_agent_communication_metadata', 'token_usage_record', 'world_state', 'retained_context', 'security_risk_score', 'realtime_item']);
const lifecycle = new Set(['task_started', 'turn_started', 'task_complete', 'turn_complete', 'turn_aborted']);
const ignoredEvents = new Set(['token_count', 'agent_message', 'user_message', 'agent_reasoning', 'agent_reasoning_raw_content', 'thread_settings_applied', 'context_compacted', 'item_completed', 'entered_review_mode', 'exited_review_mode', 'patch_apply_end', 'mcp_tool_call_end', 'web_search_end', 'image_generation_end', 'sub_agent_activity']);

function nativeId(value: unknown): asserts value is string {
  try { shortId(value); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
}
function explicitTime(value: unknown, unit = 1000): string | undefined {
  if (value === undefined || value === null || value === 0) return;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) * unit > Date.now() + 60000) throw new DomainError('HISTORY_RECORD_INVALID');
  const date = new Date(Number(value) * unit);
  if (!Number.isFinite(date.getTime())) throw new DomainError('HISTORY_RECORD_INVALID');
  return date.toISOString();
}
function readRows(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new DomainError('HISTORY_INPUT_TOO_LARGE');
    const bytes = Buffer.alloc(info.size); let offset = 0;
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) throw new DomainError('HISTORY_INPUT_CHANGED'); offset += count; }
    const after = fstatSync(fd);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new DomainError('HISTORY_INPUT_CHANGED');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
    const lines = text.split('\n'); const tail = lines.pop()!; const truncated = Boolean(tail);
    if (Buffer.byteLength(tail) > 1024 * 1024) throw new DomainError('HISTORY_RECORD_TOO_LARGE');
    if (lines.length > 10000) throw new DomainError('HISTORY_NATIVE_SCAN_LIMIT');
    let ordinal: number | undefined;
    const rows = lines.map((line) => {
      if (Buffer.byteLength(line) > 1024 * 1024) throw new DomainError('HISTORY_RECORD_TOO_LARGE');
      let value: unknown;
      try { value = JSON.parse(line); assertRecord(value); assertRecord(value.payload); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
      try { exactKeys(value, ['timestamp', 'type', 'payload'], ['ordinal', 'metadata']); } catch { throw new DomainError('HISTORY_FORMAT_UNSUPPORTED'); }
      if (typeof value.type !== 'string' || !envelopes.has(value.type)) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
      if (typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))) throw new DomainError('HISTORY_RECORD_INVALID');
      if (value.ordinal !== undefined) {
        if (!Number.isSafeInteger(value.ordinal) || Number(value.ordinal) < 0 || (ordinal !== undefined && value.ordinal !== ordinal + 1)) throw new DomainError('HISTORY_SEQUENCE_INVALID');
        ordinal = Number(value.ordinal);
      } else if (ordinal !== undefined) throw new DomainError('HISTORY_SEQUENCE_INVALID');
      return value as NativeRow;
    });
    return { rows, truncated };
  } finally { closeSync(fd); }
}

/** Bounded opt-in projection. Transcript contents never leave this in-memory reader. */
export function* codexRolloutRecords(ctx: AppContext, source: SourceRegistration, path: string, expanded = false, dynamic = false, mcp = false): Generator<CodexHistoryRecord> {
  if (source.tool !== 'codex') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  if (source.version !== '0.167.0') throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const { rows, truncated } = readRows(path); const first = rows[0];
  if (!first || first.type !== 'session_meta') throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
  const meta = first.payload;
  try { uuid(meta.id); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
  if (meta.cli_version !== source.version) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  if (mcp && meta.history_base != null) throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED');
  const child = expanded && meta.session_id !== undefined && meta.session_id !== meta.id;
  let ownRows = rows.slice(1);
  if (child) {
    try {
      uuid(meta.session_id); assertRecord(meta.source); assertRecord(meta.source.subagent); assertRecord(meta.source.subagent.thread_spawn);
      const spawn = meta.source.subagent.thread_spawn;
      if (meta.parent_thread_id !== meta.session_id || spawn.parent_thread_id !== meta.session_id || spawn.depth !== 1 || meta.history_mode !== 'paginated' || !Number.isSafeInteger(meta.subagent_history_start_ordinal) || Number(meta.subagent_history_start_ordinal) < 1 || rows.some((row) => row.ordinal === undefined) || meta.attached_thread === true || ['forked_from_id', 'forked_from_ordinal_exclusive'].some((key) => meta[key] != null) || (meta.thread_source != null && meta.thread_source !== 'subagent')) throw new Error();
    } catch { throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED'); }
    // The first metadata describes this child; the ordinal prefix belongs to ancestors.
    ownRows = ownRows.filter((row) => row.ordinal! >= Number(meta.subagent_history_start_ordinal));
  } else {
    if ((meta.session_id ?? meta.id) !== meta.id || ['forked_from_id', 'forked_from_ordinal_exclusive', 'parent_thread_id', 'history_base', 'subagent_history_start_ordinal'].some((key) => meta[key] !== undefined && meta[key] !== null) || meta.attached_thread === true) throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED');
    if (meta.source !== undefined && (typeof meta.source !== 'string' || !['cli', 'vscode', 'exec', 'mcp', 'unknown'].includes(meta.source))) throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED');
    if (meta.thread_source !== undefined && meta.thread_source !== null && meta.thread_source !== 'user') throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED');
  }
  if (meta.history_mode !== undefined && !['legacy', 'paginated'].includes(String(meta.history_mode))) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
  const authorize = (cwd: unknown) => {
    if (typeof cwd !== 'string' || resolveProject(ctx, source.deviceId, cwd).state !== 'matched') throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
    return realpathSync(cwd);
  };
  const cwd = authorize(meta.cwd); const contexts = new Map<string, string>();
  // A turn_context can follow task_started. Resolve contexts before emitting either edge.
  for (const record of ownRows) {
    if (record.type === 'session_meta') throw new DomainError('HISTORY_SEQUENCE_INVALID');
    if (['event_msg', 'turn_context'].includes(record.type) && record.payload.thread_id !== undefined && record.payload.thread_id !== meta.id) throw new DomainError('HISTORY_SOURCE_MISMATCH');
    if (record.type === 'event_msg' && record.payload.type === 'thread_settings_applied') {
      try { assertRecord(record.payload.thread_settings); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
      if (authorize(record.payload.thread_settings.cwd) !== cwd) throw new DomainError('HISTORY_CONTEXT_CONFLICT');
    }
    if (record.type === 'turn_context') {
      nativeId(record.payload.turn_id); const directory = authorize(record.payload.cwd);
      const previous = contexts.get(record.payload.turn_id);
      if (previous && previous !== directory) throw new DomainError('HISTORY_CONTEXT_CONFLICT');
      contexts.set(record.payload.turn_id, directory);
    }
  }
  // Only an executed MCP item proves that this FunctionCall reached an MCP handler.
  // The registry selects its canonical ToolName by exact namespace/name, not raw server/tool.
  const mcpNames = new Map<string, { callable: string; hook: string }>();
  if (mcp) {
    const calls = new Set(ownRows.filter((r) => r.type === 'event_msg' && r.payload.type === 'item_completed' && (r.payload.item as Record<string, unknown> | null)?.type === 'McpToolCall').map((r) => (r.payload.item as Record<string, unknown>).id));
    for (const record of ownRows) {
      const call = record.payload;
      if (record.type !== 'response_item' || call.type !== 'function_call' || !calls.has(call.call_id)) continue;
      nativeId(call.call_id);
      if (call.namespace == null || call.namespace === '') continue;
      nativeId(call.namespace); nativeId(call.name);
      const joined = `${call.namespace.replace(/_+$/, '')}__${call.name.replace(/^_+/, '')}`;
      const hook = joined.startsWith('mcp__') ? joined : `mcp__${joined}`; nativeId(hook);
      const callable = JSON.stringify([call.namespace, call.name]);
      const previous = mcpNames.get(call.call_id);
      if (previous && previous.callable !== callable) throw new DomainError('HISTORY_EVENT_CONFLICT');
      mcpNames.set(call.call_id, { callable, hook });
    }
  }
  yield { warning: 'HISTORY_LIFECYCLE_ONLY' };
  if (child && !ownRows.length) yield { warning: 'HISTORY_OWN_HISTORY_UNAVAILABLE' };
  for (const record of ownRows) {
    if (record.type !== 'event_msg') continue;
    const payload = record.payload;
    if (typeof payload.type !== 'string') throw new DomainError('HISTORY_RECORD_INVALID');
    const common = { session_id: child ? meta.session_id : meta.id, ...(child ? { agent_id: meta.id } : {}), cwd: contexts.get(String(payload.turn_id)) ?? cwd, turn_id: payload.turn_id };
    if (expanded && payload.type === 'item_completed') {
      if (meta.history_mode !== 'paginated' || rows.some((row) => row.ordinal === undefined)) { yield { warning: 'HISTORY_TOOL_HISTORY_UNSUPPORTED' }; continue; }
      try { assertRecord(payload.item); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
      const item = payload.item;
      const dynamicItem = dynamic && item.type === 'DynamicToolCall';
      const mcpItem = mcp && item.type === 'McpToolCall';
      if (!dynamicItem && !mcpItem && !['CommandExecution', 'FileChange'].includes(String(item.type))) { yield { warning: 'HISTORY_TOOL_TYPE_UNSUPPORTED' }; continue; }
      if (item.type === 'CommandExecution' && item.source !== 'unified_exec_startup') { yield { warning: 'HISTORY_TOOL_SOURCE_UNSUPPORTED' }; continue; }
      if (item.status !== 'completed' || (dynamicItem && item.success !== true)) { yield { warning: 'HISTORY_TOOL_STATUS_UNSUPPORTED' }; continue; }
      let toolName = item.type === 'CommandExecution' ? 'Bash' : 'apply_patch';
      if (mcpItem) {
        nativeId(item.id);
        const identity = mcpNames.get(item.id);
        if (!identity) { yield { warning: 'HISTORY_MCP_IDENTITY_UNAVAILABLE' }; continue; }
        toolName = identity.hook;
      }
      if (dynamicItem) {
        nativeId(item.tool);
        if (item.namespace != null && item.namespace !== '') nativeId(item.namespace);
        // Codex 0.167.0 flat_tool_name concatenates without adding a separator.
        const namespace = item.namespace == null || item.namespace === '' || item.namespace === 'functions' ? '' : String(item.namespace);
        toolName = item.tool === 'spawn_agent' && namespace === 'multi_agent_v1' ? item.tool : namespace + item.tool;
        nativeId(toolName);
      }
      nativeId(payload.turn_id); nativeId(item.id);
      const startedAt = explicitTime(payload.started_at_ms, 1), completedAt = explicitTime(payload.completed_at_ms, 1);
      if (startedAt && completedAt && startedAt > completedAt) throw new DomainError('HISTORY_RECORD_INVALID');
      if (!startedAt || !completedAt) yield { warning: 'HISTORY_TIMESTAMPS_UNAVAILABLE' };
      for (const [hook_event_name, occurredAt] of [['PreToolUse', startedAt], ['PostToolUse', completedAt]] as const) {
        if (!occurredAt) continue;
        const batch = normalizeCodex(source, { ...common, hook_event_name, tool_name: toolName, tool_use_id: item.id }, { originId: 'native-rollout', occurredAt });
        if (!batch.length) throw new DomainError('HISTORY_RECORD_INVALID');
        for (const value of batch) yield { value, codexBatchIds: batch.map((event) => event.eventId) };
      }
      continue;
    }
    if (!lifecycle.has(payload.type)) {
      if (!ignoredEvents.has(payload.type)) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
      continue;
    }
    nativeId(payload.turn_id);
    if (payload.thread_id !== undefined && payload.thread_id !== meta.id) throw new DomainError('HISTORY_SOURCE_MISMATCH');
    const starting = payload.type === 'task_started' || payload.type === 'turn_started';
    const startedAt = explicitTime(payload.started_at); const completedAt = explicitTime(payload.completed_at);
    const occurredAt = starting ? startedAt : completedAt;
    if (!occurredAt) { yield { warning: 'HISTORY_TIMESTAMPS_UNAVAILABLE' }; continue; }
    if (startedAt && completedAt && startedAt > completedAt) throw new DomainError('HISTORY_RECORD_INVALID');
    const aborted = payload.type === 'turn_aborted';
    if (aborted && payload.reason !== 'interrupted') { yield { warning: 'HISTORY_ABORT_REASON_UNSUPPORTED' }; continue; }
    if (child && aborted) { yield { warning: 'HISTORY_CHILD_INTERRUPT_UNAVAILABLE' }; continue; }
    const batch = normalizeCodex(source, { ...common, hook_event_name: starting ? 'UserPromptSubmit' : aborted ? 'Interrupt' : child ? 'SubagentStop' : 'Stop' }, { originId: 'native-rollout', occurredAt });
    if (!batch.length) throw new DomainError('HISTORY_RECORD_INVALID');
    for (let event of batch) {
      if (event.type === 'turn.submit') continue;
      if (event.type === 'turn.end' && !aborted && payload.error != null) event = { ...event, payload: { ...event.payload, outcome: 'failed' } };
      yield { value: event, codexBatchIds: batch.map((item) => item.eventId) };
    }
  }
  if (truncated) throw new DomainError('HISTORY_TRUNCATED');
}
