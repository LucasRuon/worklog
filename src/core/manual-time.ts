import { randomUUID } from 'node:crypto';
import { assertRecord, exactKeys, uuid, DomainError, type AppContext, type ReportFilter } from './contracts.js';
import { selectedOrigin, selectedProjects, validateFilter } from './filters.js';
import { dateInZone, nextDate, startOfDay } from './dates.js';
import { stableId } from './policy.js';

export interface ManualTime { id: string; projectId: string; date: string; dayStartAt: string; durationMs: number; note: string; deviceId: string; createdAt: string }
interface Row { id: string; project_id: string; local_date: string; day_start_at: string; duration_ms: number; note: string; device_id: string; source_id: string; created_at: string }
const toItem = (row: Row): ManualTime => ({ id: row.id, projectId: row.project_id, date: row.local_date, dayStartAt: row.day_start_at, durationMs: row.duration_ms, note: row.note, deviceId: row.device_id, createdAt: row.created_at });

/** Lançamentos ativos (não removidos) cujo dia local começa dentro do período. */
function activeRows(ctx: AppContext, filter: ReportFilter): Row[] {
  return ctx.db.all<Row>('SELECT m.* FROM manual_time m WHERE m.removes IS NULL AND NOT EXISTS (SELECT 1 FROM manual_time r WHERE r.removes = m.id) AND m.day_start_at >= ? AND m.day_start_at < ? ORDER BY m.local_date DESC, m.created_at DESC', filter.from, filter.to);
}
function selected(ctx: AppContext, filter: ReportFilter) {
  const projects = selectedProjects(ctx, filter);
  return activeRows(ctx, filter).filter((row) => projects.has(row.project_id) && selectedOrigin(filter, row.device_id, 'focus', row.source_id));
}
export function manualTimeMs(ctx: AppContext, filter: ReportFilter) { return selected(ctx, filter).reduce((total, row) => total + row.duration_ms, 0); }
export function listManualTime(ctx: AppContext, filter: ReportFilter) { validateFilter(filter); return selected(ctx, filter).map(toItem); }

export function addManualTime(ctx: AppContext, input: unknown, now = Date.now()): string {
  assertRecord(input); exactKeys(input, ['projectId', 'date', 'minutes'], ['note']); uuid(input.projectId);
  const date = input.date; const minutes = input.minutes; const note = input.note ?? '';
  if (typeof date !== 'string' || typeof minutes !== 'number' || !Number.isFinite(minutes) || typeof note !== 'string' || note.length > 2000 || note.includes('\0')) throw new DomainError('INVALID_MANUAL_TIME');
  nextDate(date);
  const durationMs = Math.round(minutes * 60_000);
  if (durationMs <= 0 || durationMs > 86_400_000 || date > dateInZone(new Date(now), ctx.config.timezone)) throw new DomainError('INVALID_MANUAL_TIME');
  if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', input.projectId)) throw new DomainError('UNKNOWN_PROJECT');
  const id = randomUUID();
  ctx.db.run('INSERT INTO manual_time VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)', id, input.projectId, date, startOfDay(date, ctx.config.timezone), durationMs, note.trim(), ctx.config.deviceId, stableId(ctx.config.installationId, 'focus'), new Date(now).toISOString());
  return id;
}

export function removeManualTime(ctx: AppContext, id: string, now = Date.now()) {
  uuid(id);
  return ctx.db.transaction(() => {
    const row = ctx.db.get<Row>('SELECT * FROM manual_time WHERE id = ? AND removes IS NULL', id);
    if (!row || ctx.db.get('SELECT id FROM manual_time WHERE removes = ?', id)) throw new DomainError('MANUAL_TIME_NOT_FOUND', 404);
    ctx.db.run('INSERT INTO manual_time VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), row.project_id, row.local_date, row.day_start_at, row.duration_ms, row.note, ctx.config.deviceId, row.source_id, new Date(now).toISOString(), id);
  });
}
