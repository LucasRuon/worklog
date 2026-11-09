import { randomUUID } from 'node:crypto';
import { hostname, platform } from 'node:os';
import { isAbsolute } from 'node:path';
import type { AppContext, EventInput, EventType, WorkEvent, Cursor, EventBatch, AppendResult } from './contracts.js';
import { assertRecord, exactKeys, uuid, utc, shortId, tools, DomainError } from './contracts.js';

const shapes: Record<EventType, { required: string[]; optional?: string[]; enums?: Record<string, string[]> }> = {
  'session.start': { required: ['reason'], enums: { reason: ['startup', 'resume', 'compact', 'subagent', 'unknown'] } },
  'session.end': { required: ['reason'], enums: { reason: ['clear', 'logout', 'prompt_input_exit', 'other', 'subagent'] } },
  'session.interrupt': { required: ['reason'], enums: { reason: ['user', 'error', 'unknown'] } },
  'turn.submit': { required: [], optional: ['turnId'] }, 'turn.start': { required: [], optional: ['turnId'] },
  'turn.end': { required: ['outcome'], optional: ['turnId'], enums: { outcome: ['completed', 'failed', 'interrupted'] } },
  'tool.start': { required: ['toolName', 'toolUseId'] },
  'tool.end': { required: ['toolName', 'toolUseId', 'outcome'], enums: { outcome: ['completed', 'failed', 'interrupted'] } },
  'human.interaction': { required: ['kind'], enums: { kind: ['prompt', 'explicit'] } },
  'focus.change': { required: ['confidence'], optional: ['projectId', 'sessionId'], enums: { confidence: ['explicit', 'observed', 'unresolved'] } },
  'machine.idle': { required: ['reason'], enums: { reason: ['idle', 'lock', 'sleep', 'pause'] } },
  'machine.resume': { required: [] },
  'file.change': { required: ['rootId', 'path', 'operation'], optional: ['sha256'], enums: { operation: ['create', 'edit', 'delete', 'rename'] } },
  'git.commit': { required: ['repositoryId', 'sha'] },
};

export function validateEvent(value: unknown, sequenced = false): asserts value is WorkEvent {
  assertRecord(value);
  exactKeys(value, ['schemaVersion', 'eventId', 'deviceId', 'installationId', 'sourceId', 'tool', 'type', 'occurredAt', 'payload', ...(sequenced ? ['originSeq', 'receivedAt'] : [])], ['nativeSessionId', 'nativeAgentId', 'parentSessionId', 'cwd']);
  if (value.schemaVersion !== 1 || !tools.includes(value.tool as never) || typeof value.type !== 'string' || !Object.hasOwn(shapes, value.type)) throw new DomainError('INVALID_EVENT');
  for (const key of ['eventId', 'deviceId', 'installationId', 'sourceId']) uuid(value[key]);
  utc(value.occurredAt);
  if (sequenced) { utc(value.receivedAt); if (!Number.isSafeInteger(value.originSeq) || Number(value.originSeq) < 1) throw new DomainError('INVALID_SEQUENCE'); }
  for (const key of ['nativeSessionId', 'nativeAgentId', 'parentSessionId']) if (value[key] !== undefined) shortId(value[key]);
  if (value.cwd !== undefined && (typeof value.cwd !== 'string' || !isAbsolute(value.cwd) || value.cwd.length > 4096 || /[\x00-\x1f]/.test(value.cwd))) throw new DomainError('INVALID_PATH');
  assertRecord(value.payload);
  const shape = shapes[value.type as EventType];
  exactKeys(value.payload, shape.required, shape.optional);
  for (const [key, options] of Object.entries(shape.enums ?? {})) if (!options.includes(String(value.payload[key]))) throw new DomainError('INVALID_PAYLOAD');
  for (const [key, item] of Object.entries(value.payload)) {
    if (shape.enums?.[key]) continue;
    if (['projectId', 'sessionId', 'rootId', 'repositoryId'].includes(key)) uuid(item);
    else if (key === 'path') {
      if (typeof item !== 'string' || item.length > 4096 || isAbsolute(item) || item.split(/[\\/]/).includes('..') || /[\x00-\x1f]/.test(item)) throw new DomainError('INVALID_PATH');
    } else if (key === 'sha' || key === 'sha256') {
      if (typeof item !== 'string' || !(key === 'sha' ? /^[a-f0-9]{40,64}$/ : /^[a-f0-9]{64}$/).test(item)) throw new DomainError('INVALID_HASH');
    } else shortId(item);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 16_384) throw new DomainError('EVENT_TOO_LARGE', 413);
}

export function registerInstallation(ctx: AppContext, input: { deviceId: string; installationId: string; name: string; os: string; timezone: string }) {
  uuid(input.deviceId); uuid(input.installationId);
  if ([input.name, input.os, input.timezone].some((part) => typeof part !== 'string' || part.length < 1 || part.length > 160)) throw new DomainError('INVALID_INSTALLATION');
  const previous = ctx.db.get<{ device_id: string }>('SELECT device_id FROM installations WHERE id = ?', input.installationId);
  if (previous && previous.device_id !== input.deviceId) throw new DomainError('INSTALLATION_CONFLICT', 409);
  ctx.db.run('INSERT OR IGNORE INTO devices VALUES (?, ?, ?, ?)', input.deviceId, input.name, input.os, input.timezone);
  ctx.db.run('INSERT OR IGNORE INTO installations(id, device_id) VALUES (?, ?)', input.installationId, input.deviceId);
}

export function initializeIdentity(ctx: AppContext) {
  ctx.db.transaction(() => {
    for (const key of ['deviceId', 'installationId'] as const) {
      ctx.db.run('INSERT OR IGNORE INTO settings VALUES (?, ?)', key, randomUUID());
      ctx.config[key] = ctx.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)!.value;
    }
    registerInstallation(ctx, { ...ctx.config, name: hostname(), os: platform() });
  });
}

function validateSource(ctx: AppContext, event: EventInput) {
  const source = ctx.db.get<{ installation_id: string; device_id: string; tool: string }>('SELECT installation_id, device_id, tool FROM sources WHERE id = ?', event.sourceId);
  if (!source || source.installation_id !== event.installationId || source.device_id !== event.deviceId || source.tool !== event.tool) throw new DomainError('SOURCE_MISMATCH');
}
function content(event: WorkEvent | EventInput) {
  const { originSeq: _, receivedAt: __, ...input } = event as WorkEvent;
  return JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === 'payload' ? Object.fromEntries(Object.entries(value as object).sort(([a], [b]) => a.localeCompare(b))) : value])));
}
function insert(ctx: AppContext, event: WorkEvent) {
  const existing = ctx.db.get<{ document: string }>('SELECT document FROM events WHERE event_id = ? OR (installation_id = ? AND origin_seq = ?)', event.eventId, event.installationId, event.originSeq);
  if (existing) {
    const previous = JSON.parse(existing.document) as WorkEvent;
    if (previous.eventId !== event.eventId || previous.originSeq !== event.originSeq || content(previous) !== content(event)) throw new DomainError('EVENT_IDENTITY_CONFLICT', 409);
    return false;
  }
  ctx.db.run('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', event.eventId, event.installationId, event.originSeq, event.sourceId, event.deviceId, event.type, event.occurredAt, event.receivedAt, JSON.stringify(event));
  return true;
}

export function appendEvent(ctx: AppContext, input: EventInput, withinCommit?: (inserted: boolean) => void): AppendResult {
  validateEvent(input); validateSource(ctx, input);
  if (input.installationId !== ctx.config.installationId) throw new DomainError('LOCAL_INSTALLATION_REQUIRED');
  return ctx.db.transaction(() => {
    const previous = ctx.db.get<{ document: string }>('SELECT document FROM events WHERE event_id = ?', input.eventId);
    const seq = ctx.db.get<{ last_seq: number }>('SELECT last_seq FROM installations WHERE id = ?', input.installationId)!.last_seq;
    if (previous) {
      if (content(JSON.parse(previous.document) as WorkEvent) !== content(input)) throw new DomainError('EVENT_IDENTITY_CONFLICT', 409);
      withinCommit?.(false);
      return { inserted: 0, duplicates: 1, cursor: { installationId: input.installationId, seq } };
    }
    const next = seq + 1;
    insert(ctx, { ...input, originSeq: next, receivedAt: new Date().toISOString() });
    ctx.db.run('UPDATE installations SET last_seq = ? WHERE id = ?', next, input.installationId);
    withinCommit?.(true);
    return { inserted: 1, duplicates: 0, cursor: { installationId: input.installationId, seq: next } };
  });
}

function validateCursor(cursor: Cursor) {
  uuid(cursor.installationId);
  if (!Number.isSafeInteger(cursor.seq) || cursor.seq < 0) throw new DomainError('INVALID_CURSOR');
}
export function readBatch(ctx: AppContext, cursor: Cursor, limit: number): EventBatch {
  validateCursor(cursor);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new DomainError('INVALID_LIMIT');
  if (!ctx.db.get('SELECT id FROM installations WHERE id = ?', cursor.installationId) || cursor.seq > ctx.db.get<{ seq: number }>('SELECT COALESCE(max(origin_seq), 0) AS seq FROM events WHERE installation_id = ?', cursor.installationId)!.seq) throw new DomainError('INVALID_CURSOR');
  const rows = ctx.db.all<{ document: string }>('SELECT document FROM events WHERE installation_id = ? AND origin_seq > ? ORDER BY origin_seq LIMIT ?', cursor.installationId, cursor.seq, limit + 1);
  const events = rows.slice(0, limit).map((row) => JSON.parse(row.document) as WorkEvent);
  return { schemaVersion: 1, installationId: cursor.installationId, events, nextCursor: { installationId: cursor.installationId, seq: events.at(-1)?.originSeq ?? cursor.seq }, hasMore: rows.length > limit };
}
export function importBatch(ctx: AppContext, batch: EventBatch, withinCommit?: () => void): AppendResult {
  assertRecord(batch); exactKeys(batch, ['schemaVersion', 'installationId', 'events', 'nextCursor', 'hasMore']);
  uuid(batch.installationId); assertRecord(batch.nextCursor); exactKeys(batch.nextCursor, ['installationId', 'seq']); validateCursor(batch.nextCursor);
  if (batch.schemaVersion !== 1 || !Array.isArray(batch.events) || batch.events.length > 500 || typeof batch.hasMore !== 'boolean' || batch.nextCursor.installationId !== batch.installationId || batch.installationId === ctx.config.installationId) throw new DomainError('INVALID_BATCH');
  batch.events.forEach((event, index) => {
    validateEvent(event, true); validateSource(ctx, event);
    const control = ctx.db.get<{ enabled: number; removed_at: string | null }>('SELECT enabled, removed_at FROM source_controls WHERE source_id = ?', event.sourceId);
    if (control && (!control.enabled || control.removed_at)) throw new DomainError('SOURCE_PAUSED', 409);
    if (event.installationId !== batch.installationId || (index > 0 && event.originSeq !== batch.events[index - 1]!.originSeq + 1)) throw new DomainError('INVALID_SEQUENCE');
  });
  return ctx.db.transaction(() => {
    const previous = ctx.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', batch.installationId)?.seq ?? 0;
    const last = batch.events.at(-1)?.originSeq ?? previous;
    if (last !== batch.nextCursor.seq || (batch.events[0]?.originSeq ?? previous + 1) > previous + 1 || (batch.events.length === 0 && batch.hasMore)) throw new DomainError('CURSOR_GAP');
    let inserted = 0;
    for (const event of batch.events) if (insert(ctx, event)) inserted++;
    withinCommit?.();
    const seq = Math.max(previous, last);
    ctx.db.run('INSERT INTO sync_cursors VALUES (?, ?) ON CONFLICT(installation_id) DO UPDATE SET seq = excluded.seq', batch.installationId, seq);
    return { inserted, duplicates: batch.events.length - inserted, cursor: { installationId: batch.installationId, seq } };
  });
}
