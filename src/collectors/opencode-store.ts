import { DomainError } from '../core/contracts.js';
import type { ReadonlyDatabase } from '../core/sqlite.js';

export interface NativeSession { id: string; cwd: string; parentSessionId: string | null; version: string; created: number }
export interface NativeRecord {
  id: string; updated: number; sessionId: string; cwd: string; parentSessionId: string | null;
  kind: 'message' | 'tool'; role?: string; created?: number; completed?: number | null; failed?: number;
  toolName?: string; status?: string; start?: number | null; end?: number | null;
}
export interface ScanCursor { watermark: number; after: { time: number; id: string } | null }
export const nativePageSize = 100;

export function validateNativeSchema(db: ReadonlyDatabase) {
  const tables: Record<string, string[]> = {
    session: ['id', 'directory', 'parent_id', 'version', 'time_created', 'time_updated'],
    message: ['id', 'session_id', 'time_created', 'time_updated', 'data'],
    part: ['id', 'session_id', 'message_id', 'time_created', 'time_updated', 'data'],
  };
  for (const [table, columns] of Object.entries(tables)) {
    const type = db.get<{ type: string }>('SELECT type FROM sqlite_master WHERE name = ?', table)?.type;
    const found = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name);
    if (type !== 'table' || columns.some((column) => !found.includes(column))) throw new DomainError('OPENCODE_SCHEMA_UNSUPPORTED');
  }
}
export function nativeSession(db: ReadonlyDatabase, id: string) {
  return db.get<NativeSession>('SELECT id, directory AS cwd, parent_id AS parentSessionId, version, time_created AS created FROM session WHERE id = ?', id);
}
export function latestSession(db: ReadonlyDatabase, paths: string[]) {
  const conditions = paths.map(() => '(directory = ? OR substr(directory, 1, length(?) + 1) = ? || \'/\')');
  return db.get<{ id: string }>(`SELECT id FROM session WHERE ${conditions.join(' OR ')} ORDER BY time_updated DESC, id DESC LIMIT 1`, ...paths.flatMap((path) => [path, path, path]))?.id;
}
export function latestUserTime(db: ReadonlyDatabase, sessionId: string) {
  return db.get<{ created: number }>("SELECT time_created AS created FROM message WHERE session_id = ? AND json_extract(data, '$.role') = 'user' ORDER BY time_created DESC, id DESC LIMIT 1", sessionId)?.created;
}

export function readNativePage(db: ReadonlyDatabase, session: NativeSession, from: number, cursor: ScanCursor, kind: 'message' | 'tool') {
  const alias = kind === 'message' ? 'm' : 'p'; const table = kind === 'message' ? 'message' : 'part';
  const where = [`${alias}.session_id = ?`, `${alias}.time_created >= ?`, `${alias}.time_updated >= ?`];
  const values: (string | number)[] = [session.id, from, Math.max(from, cursor.watermark - 1000)];
  if (cursor.after) { where.push(`(${alias}.time_updated > ? OR (${alias}.time_updated = ? AND ${alias}.id > ?))`); values.push(cursor.after.time, cursor.after.time, cursor.after.id); }
  if (kind === 'tool') where.push("json_extract(p.data, '$.type') = 'tool'");
  const projection = kind === 'message'
    ? "json_extract(m.data, '$.role') AS role, json_extract(m.data, '$.time.created') AS created, json_extract(m.data, '$.time.completed') AS completed, CASE WHEN json_type(m.data, '$.error') IS NOT NULL AND json_type(m.data, '$.error') != 'null' THEN 1 ELSE 0 END AS failed"
    : "json_extract(p.data, '$.tool') AS toolName, json_extract(p.data, '$.state.status') AS status, json_extract(p.data, '$.state.time.start') AS start, json_extract(p.data, '$.state.time.end') AS end";
  const rows = db.all<Omit<NativeRecord, 'kind' | 'sessionId' | 'cwd' | 'parentSessionId'>>(`SELECT ${alias}.id, ${alias}.time_updated AS updated, ${projection} FROM ${table} ${alias} WHERE ${where.join(' AND ')} ORDER BY ${alias}.time_updated, ${alias}.id LIMIT ?`, ...values, nativePageSize + 1);
  const selected = rows.slice(0, nativePageSize);
  const records: NativeRecord[] = selected.map((row) => ({ ...row, kind, sessionId: session.id, cwd: session.cwd, parentSessionId: session.parentSessionId }));
  const last = selected.at(-1);
  return { records, cursor: { watermark: Math.max(cursor.watermark, ...selected.map((row) => row.updated)), after: rows.length > nativePageSize && last ? { time: last.updated, id: last.id } : null } satisfies ScanCursor };
}
