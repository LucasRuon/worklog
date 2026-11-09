import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DomainError, utc, uuid, type AppContext, type FileRevision, type FileChange, type FileDetail, type ProjectRoot, type ReportFilter } from '../core/contracts.js';
import { listProjects, resolveProject } from '../core/projects.js';
import { join } from 'node:path';
import { captureDecision, gitPathAllowed, policyFor, stableId } from '../core/policy.js';
import { captureBudgetReached, collectionEnabled } from '../core/configuration.js';
import { appendEvent } from '../core/events.js';
import { registerSource } from './source-config.js';
import { selectedProjects, validateFilter } from '../core/filters.js';
import { evidenceLinks, inferEvidence } from './relations.js';

export function setFileAccess(ctx: AppContext, rootId: string, path: string, allowed: boolean, journal = true) {
  const previous = ctx.db.get<{ allowed: number }>('SELECT allowed FROM file_access WHERE root_id = ? AND path = ?', rootId, path);
  if (previous?.allowed === Number(allowed)) return;
  ctx.db.run('INSERT INTO file_access VALUES (?, ?, ?) ON CONFLICT(root_id, path) DO UPDATE SET allowed = excluded.allowed', rootId, path, Number(allowed));
  if (journal) ctx.db.run('INSERT INTO file_journal(kind, root_id, target) VALUES (?, ?, ?)', 'access', rootId, path);
}

// Chamado dentro de uma transação pelo coletor local ou importador remoto validado.
export function insertRevision(ctx: AppContext, revision: FileRevision, journal = true): string {
  const { content, ...metadata } = revision;
  const previous = ctx.db.get<{ document: string }>('SELECT document FROM file_revisions WHERE id = ?', revision.id);
  if (previous) {
    if (previous.document !== JSON.stringify(metadata)) throw new DomainError('REVISION_IDENTITY_CONFLICT', 409);
    return revision.id;
  }
  if (content !== undefined) ctx.db.run('INSERT OR IGNORE INTO file_contents VALUES (?, ?, ?)', revision.sha256!, content, revision.occurredAt);
  ctx.db.run('INSERT INTO file_revisions VALUES (?, ?, ?, ?, ?, ?, ?)', revision.id, revision.rootId, revision.fileId, revision.path, revision.occurredAt, revision.sha256, JSON.stringify(metadata));
  setFileAccess(ctx, revision.rootId, revision.path, true, journal);
  if (journal) ctx.db.run('INSERT INTO file_journal(kind, root_id, target) VALUES (?, ?, ?)', 'revision', revision.rootId, revision.id);
  return revision.id;
}

export function validateRevision(revision: FileRevision) {
  for (const value of [revision.id, revision.rootId, revision.fileId]) uuid(value);
  if (revision.previousRevisionId !== null) uuid(revision.previousRevisionId);
  utc(revision.occurredAt);
  if (typeof revision.path !== 'string' || !gitPathAllowed(revision.path) || /[\x00-\x1f]/.test(revision.path) || (revision.previousPath !== null && (typeof revision.previousPath !== 'string' || !gitPathAllowed(revision.previousPath) || /[\x00-\x1f]/.test(revision.previousPath))) || !['baseline', 'create', 'edit', 'delete', 'rename'].includes(revision.operation) || !['baseline', 'watch', 'reconciliation'].includes(revision.observation) || !Number.isSafeInteger(revision.size) || revision.size < 0 || (revision.sha256 !== null && !/^[a-f0-9]{64}$/.test(revision.sha256)) || (revision.unavailableReason !== null && !['binary', 'too-large', 'deleted', 'retention', 'invalid-utf8', 'policy', 'unavailable'].includes(revision.unavailableReason))) throw new DomainError('INVALID_REVISION');
  if (revision.content !== undefined && (typeof revision.content !== 'string' || Buffer.byteLength(revision.content) > 2 * 1024 * 1024 || revision.content.includes('\0') || revision.size !== Buffer.byteLength(revision.content) || revision.sha256 !== createHash('sha256').update(revision.content).digest('hex') || revision.unavailableReason !== null)) throw new DomainError('INVALID_REVISION_CONTENT');
  if ((revision.operation === 'rename') !== (revision.previousPath !== null) || (revision.operation === 'baseline' && (revision.previousRevisionId !== null || revision.observation !== 'baseline')) || (['edit', 'delete', 'rename'].includes(revision.operation) && revision.previousRevisionId === null) || (revision.operation === 'create' && revision.previousRevisionId !== null) || (revision.operation === 'delete' && (revision.size !== 0 || revision.sha256 !== null || revision.content !== undefined || revision.unavailableReason !== 'deleted'))) throw new DomainError('INVALID_REVISION');
}

export function storeRevision(ctx: AppContext, revision: FileRevision, withinCommit?: () => void): string {
  if (!collectionEnabled(ctx, 'files')) throw new DomainError('SOURCE_PAUSED', 409);
  validateRevision(revision);
  const root = listProjects(ctx).flatMap((p) => p.roots).find((r) => r.id === revision.rootId && r.enabled && r.deviceId === ctx.config.deviceId);
  const match = root ? resolveProject(ctx, root.deviceId, join(root.path, revision.path)) : null;
  const decision = root ? captureDecision(root, revision.path, policyFor(ctx)) : null;
  if (!root || match?.state !== 'matched' || match.rootId !== root.id || !decision?.metadata || (revision.content !== undefined && !decision.content) || (revision.previousPath && !captureDecision(root, revision.previousPath, policyFor(ctx)).metadata)) throw new DomainError('REVISION_POLICY_DENIED');
  if (revision.content !== undefined && !ctx.db.get('SELECT sha256 FROM file_contents WHERE sha256 = ?', revision.sha256!) && captureBudgetReached(ctx, Buffer.byteLength(revision.content))) {
    const { content: _, ...metadata } = revision; revision = { ...metadata, unavailableReason: 'unavailable' };
    ctx.db.run("INSERT INTO settings VALUES ('storageDiagnostic', 'STORAGE_BUDGET_EXCEEDED') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  }
  const save = () => { insertRevision(ctx, revision); withinCommit?.(); };
  if (revision.operation === 'baseline') ctx.db.transaction(save);
  else {
    const sourceId = stableId(ctx.config.installationId, 'files');
    if (!ctx.db.get('SELECT id FROM sources WHERE id = ?', sourceId)) registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'files', profile: 'observer', configPath: join(ctx.config.dataDir, 'file-observer'), version: '1', enabled: true });
    appendEvent(ctx, { schemaVersion: 1, eventId: revision.id, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, sourceId, tool: 'files', type: 'file.change', occurredAt: revision.occurredAt, cwd: root.path, payload: { rootId: root.id!, path: revision.path, operation: revision.operation, ...(revision.sha256 ? { sha256: revision.sha256 } : {}) } }, save);
  }
  inferEvidence(ctx, revision.id); return revision.id;
}

export function revisionVisible(ctx: AppContext, revision: Pick<FileRevision, 'rootId' | 'path' | 'previousPath'>, roots = listProjects(ctx).flatMap((p) => p.roots), forContent = false) {
  const root = roots.find((r) => r.id === revision.rootId && r.enabled);
  if (!root) return false;
  return [revision.path, ...(revision.previousPath ? [revision.previousPath] : [])].every((path) => {
    if (!gitPathAllowed(path, policyFor(ctx)) || ctx.db.get<{ allowed: number }>('SELECT allowed FROM file_access WHERE root_id = ? AND path = ?', root.id!, path)?.allowed === 0) return false;
    if (roots.some((other) => other.deviceId === root.deviceId && other.path !== root.path && join(root.path, path).startsWith(`${other.path}/`) && other.path.startsWith(`${root.path}/`))) return false;
    return root.deviceId !== ctx.config.deviceId || (!forContent && !existsSync(root.path)) || captureDecision(root, path, policyFor(ctx)).metadata;
  });
}
function change(ctx: AppContext, revision: FileRevision, root: ProjectRoot): FileChange {
  const { content: _, ...metadata } = revision;
  const unavailableReason = !metadata.unavailableReason && metadata.sha256 && !ctx.db.get('SELECT sha256 FROM file_contents WHERE sha256 = ?', metadata.sha256) ? 'retention' : metadata.unavailableReason;
  return { ...metadata, unavailableReason, projectId: root.projectId!, deviceId: root.deviceId };
}
export function storedRevision(ctx: AppContext, id: string): FileRevision | null {
  const row = ctx.db.get<{ document: string; sha256: string | null }>('SELECT document, sha256 FROM file_revisions WHERE id = ?', id);
  if (!row) return null;
  const metadata = JSON.parse(row.document) as FileRevision;
  const content = row.sha256 && !metadata.unavailableReason ? ctx.db.get<{ content: string }>('SELECT content FROM file_contents WHERE sha256 = ?', row.sha256)?.content : undefined;
  return { ...metadata, ...(content !== undefined ? { content } : {}) };
}
export function getFileHistory(ctx: AppContext, rootId: string, path: string, fileId?: string): FileChange[] {
  uuid(rootId);
  const root = listProjects(ctx).flatMap((p) => p.roots).find((r) => r.id === rootId && r.enabled);
  if (!root || !revisionVisible(ctx, { rootId, path, previousPath: null })) return [];
  const id = fileId ?? ctx.db.get<{ file_id: string }>('SELECT file_id FROM file_revisions WHERE root_id = ? AND path = ? ORDER BY rowid DESC LIMIT 1', rootId, path)?.file_id;
  if (!id) return [];
  return ctx.db.all<{ document: string }>('SELECT document FROM file_revisions WHERE root_id = ? AND file_id = ? ORDER BY rowid DESC LIMIT 101', rootId, id).map((r) => JSON.parse(r.document) as FileRevision).filter((r) => revisionVisible(ctx, r)).map((r) => change(ctx, r, root));
}
export function listFileChanges(ctx: AppContext, filter: ReportFilter, limit = 26, after?: { at: string; id: string }): FileChange[] {
  validateFilter(filter); if (filter.sourceIds?.length || filter.tools?.length && !filter.tools.includes('files')) return [];
  const projects = [...selectedProjects(ctx, filter)]; if (!projects.length) return [];
  const roots = listProjects(ctx).flatMap((p) => p.roots);
  const params: (string | number)[] = [filter.from, filter.to, ...projects];
  const clauses = ['v.occurred_at >= ?', 'v.occurred_at < ?', 'r.enabled = 1', `r.project_id IN (${projects.map(() => '?').join(',')})`];
  if (filter.deviceIds?.length) { clauses.push(`r.device_id IN (${filter.deviceIds.map(() => '?').join(',')})`); params.push(...filter.deviceIds); }
  const result: FileChange[] = []; let cursor = after;
  while (result.length < limit) {
    const rows = ctx.db.all<{ id: string; occurred_at: string; document: string }>(`SELECT v.id, v.occurred_at, v.document FROM file_revisions v JOIN project_roots r ON r.id = v.root_id WHERE ${clauses.join(' AND ')} ${cursor ? 'AND (v.occurred_at < ? OR (v.occurred_at = ? AND v.id < ?))' : ''} ORDER BY v.occurred_at DESC, v.id DESC LIMIT 100`, ...params, ...(cursor ? [cursor.at, cursor.at, cursor.id] : []));
    for (const row of rows) {
      const revision = JSON.parse(row.document) as FileRevision;
      if (revisionVisible(ctx, revision, roots)) result.push(change(ctx, revision, roots.find((r) => r.id === revision.rootId)!));
      if (result.length === limit) return result;
    }
    if (rows.length < 100) break;
    cursor = { at: rows.at(-1)!.occurred_at, id: rows.at(-1)!.id };
  }
  return result;
}

export function sessionFileChanges(ctx: AppContext, sessionId: string) {
  const session = ctx.db.get<{ project_id: string; device_id: string; started_at: string; last_event_at: string }>('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!session) return [];
  const nearby = ctx.db.all<{ id: string }>('SELECT v.id FROM file_revisions v JOIN project_roots r ON r.id = v.root_id WHERE r.project_id = ? AND r.device_id = ? AND v.occurred_at >= ? AND v.occurred_at <= ? ORDER BY v.occurred_at DESC LIMIT 200', session.project_id, session.device_id, session.started_at, new Date(Date.parse(session.last_event_at) + 120_000).toISOString());
  for (const revision of nearby) inferEvidence(ctx, revision.id);
  const roots = listProjects(ctx).flatMap((p) => p.roots);
  return ctx.db.all<{ document: string; confidence: FileChange['associationConfidence'] }>("SELECT v.document, l.confidence FROM file_revisions v JOIN evidence_links l ON l.source_id = v.id WHERE l.target_id = ? AND NOT EXISTS (SELECT 1 FROM evidence_links e WHERE e.source_id = l.source_id AND e.kind = 'session' AND e.confidence = 'explicit' AND e.target_id != ?) ORDER BY v.occurred_at DESC LIMIT 101", sessionId, sessionId).map((row) => ({ revision: JSON.parse(row.document) as FileRevision, confidence: row.confidence })).filter(({ revision }) => revisionVisible(ctx, revision, roots)).map(({ revision, confidence }) => ({ ...change(ctx, revision, roots.find((root) => root.id === revision.rootId)!), associationConfidence: confidence }));
}

export function revisionDiffData(ctx: AppContext, id: string) {
  uuid(id); const revision = storedRevision(ctx, id);
  if (!revision || !revisionVisible(ctx, revision)) throw new DomainError('REVISION_NOT_FOUND', 404);
  const root = listProjects(ctx).flatMap((p) => p.roots).find((r) => r.id === revision.rootId)!;
  const currentAllowed = revisionVisible(ctx, revision, undefined, true);
  const previous = revision.previousRevisionId ? storedRevision(ctx, revision.previousRevisionId) : null;
  const before = previous?.operation === 'delete' ? '' : previous?.content;
  const after = revision.operation === 'delete' ? '' : revision.content;
  let reason: string | null = !currentAllowed || (previous && !revisionVisible(ctx, previous, undefined, true)) ? 'policy' : revision.operation === 'baseline' ? 'baseline' : revision.previousRevisionId && !previous ? 'retention' : previous && before === undefined ? previous.unavailableReason ?? 'retention' : after === undefined ? revision.unavailableReason ?? 'retention' : null;
  return { revision, root, currentAllowed, before, after, reason };
}
export async function revisionDetail(ctx: AppContext, id: string): Promise<FileDetail> {
  const { revision, root, currentAllowed, before, after, reason: initialReason } = revisionDiffData(ctx, id);
  let reason = initialReason;
  let patch: string | null = null;
  if (!reason) {
    const { createTwoFilesPatch } = await import('diff');
    patch = createTwoFilesPatch(revision.previousPath ?? revision.path, revision.path, before ?? '', after ?? '', undefined, undefined, { context: 3, timeout: 200, maxEditLength: 10_000 }) ?? null;
    if (patch === null || Buffer.byteLength(patch) > 512 * 1024 || patch.split('\n').length > 10_000) { patch = null; reason = 'diff-limit'; }
  }
  inferEvidence(ctx, id);
  const history = getFileHistory(ctx, root.id!, revision.path, revision.fileId);
  return { revision: change(ctx, revision, root), content: currentAllowed && after !== undefined ? after : null, diff: { patch, reason }, history: history.slice(0, 100), historyHasMore: history.length > 100, links: evidenceLinks(ctx, id), sessionCandidates: ctx.db.all<{ id: string; native_session_id: string; tool: FileDetail['sessionCandidates'][number]['tool'] }>('SELECT x.id, native_session_id, s.tool FROM sessions x JOIN sources s ON x.source_id = s.id WHERE x.project_id = ? AND x.device_id = ? ORDER BY last_event_at DESC LIMIT 100', root.projectId!, root.deviceId).map((s) => ({ id: s.id, nativeSessionId: s.native_session_id, tool: s.tool })) };
}
