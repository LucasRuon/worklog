import { randomUUID } from 'node:crypto';
import { assertRecord, exactKeys, uuid, utc, DomainError, type Adjustment, type AdjustmentInput, type AppContext, type Note, type NoteClassification, type ReportFilter } from './contracts.js';
import { deriveTime } from './time.js';
import { selectedOrigin, selectedProjects, validateFilter } from './filters.js';
import { stableId } from './policy.js';

export function adjustmentRevision(ctx: AppContext) { return Number(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'adjustmentRevision'")!.value); }
function checkRevision(ctx: AppContext, revision: number) { if (!Number.isSafeInteger(revision) || revision < 0) throw new DomainError('INVALID_ADJUSTMENT'); if (revision !== adjustmentRevision(ctx)) throw new DomainError('ADJUSTMENT_CHANGED', 409); }
function reason(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.length > 2000 || value.includes('\0')) throw new DomainError('INVALID_ADJUSTMENT'); return value.trim(); }
function bump(ctx: AppContext) { ctx.db.run("UPDATE settings SET value = cast(cast(value AS INTEGER) + 1 AS TEXT) WHERE key = 'adjustmentRevision'"); }

export function applyAdjustment(ctx: AppContext, input: AdjustmentInput): string {
  assertRecord(input); exactKeys(input, ['projectId', 'start', 'end', 'nextMs', 'reason', 'revision']); uuid(input.projectId); utc(input.start); utc(input.end); reason(input.reason);
  const span = Date.parse(input.end) - Date.parse(input.start);
  if (!(span > 0) || Date.parse(input.end) > Date.now() || !Number.isSafeInteger(input.nextMs) || input.nextMs < 0 || input.nextMs > span) throw new DomainError('INVALID_ADJUSTMENT');
  const sourceEpoch = ctx.db.get<{ n: number }>('SELECT coalesce(max(rowid), 0) AS n FROM events')!.n;
  const previous = deriveTime(ctx, { projectIds: [], from: input.start, to: input.end, timezone: 'UTC', includeUnassigned: true });
  return ctx.db.transaction(() => {
    checkRevision(ctx, input.revision);
    if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', input.projectId)) throw new DomainError('UNKNOWN_PROJECT');
    if (sourceEpoch !== ctx.db.get<{ n: number }>('SELECT coalesce(max(rowid), 0) AS n FROM events')!.n) throw new DomainError('ADJUSTMENT_CHANGED', 409);
    if (ctx.db.get('SELECT a.id FROM time_adjustments a WHERE a.undo_of IS NULL AND NOT EXISTS (SELECT 1 FROM time_adjustments u WHERE u.undo_of = a.id) AND a.start_at < ? AND a.end_at > ?', input.end, input.start)) throw new DomainError('ADJUSTMENT_OVERLAP', 409);
    const item: Adjustment = { id: randomUUID(), projectId: input.projectId, start: input.start, end: input.end, previousMs: previous.humanEstimatedMs + previous.humanAdjustedMs + previous.unassignedHumanMs, nextMs: input.nextMs, reason: input.reason.trim(), createdAt: new Date().toISOString(), deviceId: ctx.config.deviceId, sourceId: stableId(ctx.config.installationId, 'focus'), undoOf: null, revision: input.revision + 1 };
    ctx.db.run('INSERT INTO time_adjustments VALUES (?, ?, ?, ?, ?, NULL, ?)', item.id, item.projectId, item.start, item.end, JSON.stringify(item), item.createdAt); bump(ctx); return item.id;
  });
}
export function undoAdjustment(ctx: AppContext, id: string, input: { revision: number; reason: string }): string {
  uuid(id); assertRecord(input); exactKeys(input, ['revision', 'reason']); reason(input.reason);
  return ctx.db.transaction(() => {
    checkRevision(ctx, input.revision);
    const row = ctx.db.get<{ document: string; undo_of: string | null }>('SELECT document, undo_of FROM time_adjustments WHERE id = ?', id);
    if (!row) throw new DomainError('ADJUSTMENT_NOT_FOUND', 404);
    if (row.undo_of || ctx.db.get('SELECT id FROM time_adjustments WHERE undo_of = ?', id)) throw new DomainError('ADJUSTMENT_ALREADY_UNDONE', 409);
    const original = JSON.parse(row.document) as Adjustment;
    const item: Adjustment = { ...original, id: randomUUID(), undoOf: id, previousMs: original.nextMs, nextMs: original.previousMs, reason: input.reason.trim(), createdAt: new Date().toISOString(), revision: input.revision + 1, deviceId: ctx.config.deviceId };
    ctx.db.run('INSERT INTO time_adjustments VALUES (?, ?, ?, ?, ?, ?, ?)', item.id, item.projectId, item.start, item.end, JSON.stringify(item), id, item.createdAt); bump(ctx); return item.id;
  });
}
export function listAdjustments(ctx: AppContext, filter: ReportFilter) {
  validateFilter(filter); const projects = selectedProjects(ctx, filter);
  return ctx.db.all<{ document: string; undone: number }>('SELECT a.document, EXISTS(SELECT 1 FROM time_adjustments u WHERE u.undo_of = a.id) AS undone FROM time_adjustments a WHERE a.start_at < ? AND a.end_at > ? ORDER BY a.created_at, a.id', filter.to, filter.from).map((row) => ({ ...JSON.parse(row.document) as Adjustment, undone: Boolean(row.undone) })).filter((a) => projects.has(a.projectId) && selectedOrigin(filter, a.deviceId, 'focus', a.sourceId));
}

function targetProject(ctx: AppContext, id: string): string {
  uuid(id);
  if (ctx.db.get('SELECT id FROM projects WHERE id = ?', id)) return id;
  const project = ctx.db.get<{ project_id: string | null }>('SELECT project_id FROM sessions WHERE id = ?', id)?.project_id ?? ctx.db.get<{ project_id: string }>('SELECT r.project_id FROM file_revisions v JOIN project_roots r ON r.id = v.root_id WHERE v.id = ?', id)?.project_id ?? ctx.db.get<{ project_id: string | null }>('SELECT r.primary_project_id AS project_id FROM git_commits c JOIN repositories r ON r.id = c.repository_id WHERE c.id = ?', id)?.project_id ?? ctx.db.get<{ project_id: string | null }>('SELECT r.primary_project_id AS project_id FROM pull_requests p JOIN repositories r ON r.id = p.repository_id WHERE p.id = ?', id)?.project_id;
  if (!project) throw new DomainError('NOTE_TARGET_UNAVAILABLE', 404); return project;
}
export function currentNote(ctx: AppContext, targetId: string): Note | null {
  targetProject(ctx, targetId); const row = ctx.db.get<{ document: string }>('SELECT document FROM note_versions WHERE target_id = ? ORDER BY revision DESC LIMIT 1', targetId); return row ? JSON.parse(row.document) as Note : null;
}
export function saveNote(ctx: AppContext, targetId: string, text: string, options: { revision?: number; classification?: NoteClassification; occurredAt?: string } = {}): string {
  const projectId = targetProject(ctx, targetId);
  if (typeof text !== 'string' || text.length > 8192 || text.includes('\0') || options.classification !== undefined && !['work', 'pending', 'verification', 'context'].includes(options.classification)) throw new DomainError('INVALID_NOTE');
  const occurredAt = options.occurredAt ?? new Date().toISOString(); utc(occurredAt);
  return ctx.db.transaction(() => {
    const previous = currentNote(ctx, targetId); const revision = previous?.revision ?? 0;
    if (!Number.isSafeInteger(options.revision ?? revision) || (options.revision ?? revision) !== revision) throw new DomainError('NOTE_CHANGED', 409);
    const item: Note = { id: randomUUID(), targetId, projectId, text, classification: options.classification ?? previous?.classification ?? 'context', occurredAt, createdAt: new Date().toISOString(), revision: revision + 1, deviceId: ctx.config.deviceId, sourceId: stableId(ctx.config.installationId, 'focus') };
    ctx.db.run('INSERT INTO note_versions VALUES (?, ?, ?, ?, ?, ?)', item.id, targetId, projectId, item.revision, occurredAt, JSON.stringify(item)); return item.id;
  });
}
export function listNotes(ctx: AppContext, filter: ReportFilter): Note[] {
  validateFilter(filter); const projects = selectedProjects(ctx, filter);
  return ctx.db.all<{ document: string }>('SELECT n.document FROM note_versions n WHERE n.revision = (SELECT max(x.revision) FROM note_versions x WHERE x.target_id = n.target_id) AND n.occurred_at >= ? AND n.occurred_at < ? ORDER BY n.occurred_at, n.target_id', filter.from, filter.to).map((row) => JSON.parse(row.document) as Note).filter((note) => note.text.length > 0 && projects.has(note.projectId) && selectedOrigin(filter, note.deviceId, 'focus', note.sourceId));
}
