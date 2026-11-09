import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assertRecord, exactKeys, uuid, utc, DomainError, type AppContext, type ReportFilter, type Tool, type WorkEvent } from '../core/contracts.js';
import { validateFilter, selectedProjects } from '../core/filters.js';
import { dateInZone, nextDate, startOfDay } from '../core/dates.js';
import { listProjects, registerProjectRoot } from '../core/projects.js';
import { listSessions, projectSessions, rebuildSessions } from '../core/sessions.js';
import { deriveTime } from '../core/time.js';
import { controlSource, registerSource } from '../collectors/source-config.js';
import { sourceStatuses } from '../collectors/source-status.js';
import { removeSourceInstrumentation } from '../cli/source-management.js';
import { stableId } from '../core/policy.js';
import { signalHuman } from '../collectors/focus.js';
import { drainQueue } from '../collectors/claude.js';
import { pollOpenCode } from '../collectors/opencode.js';
import { workspaces } from '../core/automation.js';
import { serviceStatus } from '../cli/service.js';
import { gitScans, listCommits, pollGit } from '../collectors/git.js';
import { queryReport, saveReport, savedReport, validateReportOptions } from '../reports/query.js';
import { renderCsv } from '../reports/csv.js';
import { fileScans, pollFiles } from '../collectors/files.js';
import { getFileHistory, listFileChanges, revisionDetail, sessionFileChanges } from '../collectors/revisions.js';
import { linkEvidence } from '../collectors/relations.js';
import { listPullRequests, pullRequestSyncState, pullRequestsForCommit, syncPullRequests } from '../providers/github.js';
import { buildWorkSummary } from '../core/summaries.js';
import { adjustmentRevision, applyAdjustment, currentNote, listAdjustments, listNotes, saveNote, undoAdjustment } from '../core/adjustments.js';
import { configure, operatingConfig, setRootEnabled } from '../core/configuration.js';
import { runRetention, storageUsage } from '../core/maintenance.js';

function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
function setting(ctx: AppContext, key: string) { return ctx.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value; }
export function synchronize(ctx: AppContext, options: { forceObservers?: boolean } = {}) {
  const observers = pollOpenCode(ctx, { force: options.forceObservers });
  let queue = { inserted: 0, duplicates: 0, rejected: 0, pending: 0 };
  try {
    queue = drainQueue(ctx);
    ctx.db.run("INSERT INTO settings VALUES ('collectorStatus', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", queue.rejected ? 'rejected-events' : observers.some((observer) => observer.status === 'error') ? 'observer-error' : 'ok');
  } catch { ctx.db.run("INSERT INTO settings VALUES ('collectorStatus', 'error') ON CONFLICT(key) DO UPDATE SET value = 'error'"); }
  const rows = ctx.db.all<{ document: string }>('SELECT e.document FROM events e LEFT JOIN event_projects p ON p.event_id = e.event_id WHERE p.event_id IS NULL ORDER BY e.rowid LIMIT 1000');
  projectSessions(ctx, rows.map((row) => JSON.parse(row.document) as WorkEvent));
  return { ...queue, observers };
}

export function filterFromUrl(ctx: AppContext, url: URL): ReportFilter {
  const query = url.searchParams; const timezone = query.get('timezone') ?? ctx.config.timezone;
  let today: string;
  try { today = dateInZone(new Date(), timezone); } catch { throw new DomainError('INVALID_TIMEZONE'); }
  const filter: ReportFilter = {
    projectIds: query.get('projectIds')?.split(',').filter(Boolean) ?? [], from: query.get('from') ?? startOfDay(today, timezone), to: query.get('to') ?? startOfDay(nextDate(today), timezone), timezone,
    deviceIds: query.get('deviceIds')?.split(',').filter(Boolean), tools: query.get('tools')?.split(',').filter(Boolean) as Tool[] | undefined,
    sourceIds: query.get('sourceIds')?.split(',').filter(Boolean),
    includeUnassigned: query.get('includeUnassigned') === '1',
    onlyUnassigned: query.get('onlyUnassigned') === '1',
  };
  validateFilter(filter); return filter;
}
function pageOptions(url: URL, filter: unknown) {
  const raw = url.searchParams.get('limit') ?? '25';
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) throw new DomainError('INVALID_LIMIT');
  const scope = createHash('sha256').update(JSON.stringify({ path: url.pathname, filter })).digest('hex');
  let after: { at: string; id: string } | null = null;
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    try {
      if (cursor.length > 2048) throw new Error();
      const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      assertRecord(decoded); exactKeys(decoded, ['scope', 'at', 'id']);
      if (decoded.scope !== scope || typeof decoded.at !== 'string' || typeof decoded.id !== 'string') throw new Error();
      uuid(decoded.id); after = { at: decoded.at, id: decoded.id };
    } catch { throw new DomainError('INVALID_CURSOR'); }
  }
  return { limit: Number(raw), after, encode: (at: string, id: string) => Buffer.from(JSON.stringify({ scope, at, id })).toString('base64url') };
}
function eventsQuery(ctx: AppContext, filter: ReportFilter) {
  const projects = [...selectedProjects(ctx, filter)];
  const clauses = ['e.occurred_at >= ?', 'e.occurred_at < ?']; const parameters: (string | number)[] = [filter.from, filter.to];
  const projectClause = projects.length ? `p.project_id IN (${projects.map(() => '?').join(',')})` : '0';
  clauses.push(filter.includeUnassigned ? `(${projectClause} OR p.project_id IS NULL)` : projectClause); parameters.push(...projects);
  if (filter.deviceIds?.length) { clauses.push(`e.device_id IN (${filter.deviceIds.map(() => '?').join(',')})`); parameters.push(...filter.deviceIds); }
  if (filter.tools?.length) { clauses.push(`s.tool IN (${filter.tools.map(() => '?').join(',')})`); parameters.push(...filter.tools); }
  if (filter.sourceIds?.length) { clauses.push(`s.id IN (${filter.sourceIds.map(() => '?').join(',')})`); parameters.push(...filter.sourceIds); }
  const tables = 'events e LEFT JOIN event_projects p ON p.event_id = e.event_id JOIN sources s ON s.id = e.source_id';
  return { clauses, parameters, tables };
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new DomainError('JSON_REQUIRED', 415);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0; let finished = false;
    req.on('data', (chunk: Buffer) => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > 32 * 1024) { finished = true; chunks.length = 0; reject(new DomainError('BODY_TOO_LARGE', 413)); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      try { const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); assertRecord(body); resolve(body); }
      catch { reject(new DomainError('INVALID_JSON')); }
    });
    req.on('error', () => { if (!finished) { finished = true; reject(new DomainError('REQUEST_FAILED')); } });
  });
}

export async function handleRoutes(ctx: AppContext, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', ctx.config.origin); const path = url.pathname; const method = req.method;
  try {
    synchronize(ctx);
    if (path === '/api/configuration' && method === 'GET') { json(res, 200, { config: operatingConfig(ctx), storage: storageUsage(ctx), lastRetentionAt: setting(ctx, 'lastRetentionAt') ?? null, diagnostic: setting(ctx, 'storageDiagnostic') ?? null }); return; }
    if (path === '/api/configuration' && method === 'PATCH') { const body = await readBody(req); json(res, 200, { config: configure(ctx, body as never) }); return; }
    if (path === '/api/retention' && method === 'POST') { const body = await readBody(req); exactKeys(body, []); json(res, 200, runRetention(ctx, new Date().toISOString())); return; }
    const rootAction = path.match(/^\/api\/projects\/roots\/([^/]+)$/);
    if (rootAction && method === 'PATCH') { const body = await readBody(req); exactKeys(body, ['enabled']); setRootEnabled(ctx, rootAction[1]!, body.enabled as boolean); json(res, 200, { updated: true }); return; }
    if (path === '/api/notes' && method === 'GET') {
      const targetId = url.searchParams.get('targetId');
      json(res, 200, targetId ? { item: currentNote(ctx, targetId) } : { items: listNotes(ctx, filterFromUrl(ctx, url)) }); return;
    }
    if (path === '/api/notes' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['targetId', 'text', 'revision'], ['classification', 'occurredAt']); uuid(body.targetId);
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new DomainError('INVALID_NOTE');
      saveNote(ctx, body.targetId, body.text as string, { revision: body.revision as number, ...(body.classification !== undefined ? { classification: body.classification as never } : {}), ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt as string } : {}) });
      json(res, 201, { item: currentNote(ctx, body.targetId) }); return;
    }
    if (path === '/api/adjustments' && method === 'GET') { json(res, 200, { items: listAdjustments(ctx, filterFromUrl(ctx, url)), revision: adjustmentRevision(ctx) }); return; }
    if (path === '/api/adjustments' && method === 'POST') {
      const body = await readBody(req); const id = applyAdjustment(ctx, body as never); json(res, 201, { id, revision: adjustmentRevision(ctx) }); return;
    }
    const undo = path.match(/^\/api\/adjustments\/([^/]+)\/undo$/);
    if (undo && method === 'POST') { const body = await readBody(req); const id = undoAdjustment(ctx, undo[1]!, body as never); json(res, 201, { id, revision: adjustmentRevision(ctx) }); return; }
    if (path === '/api/work-summary' && method === 'GET') { json(res, 200, buildWorkSummary(ctx, filterFromUrl(ctx, url))); return; }
    if (path === '/api/prs/sync' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['repositoryId']); uuid(body.repositoryId);
      const result = await syncPullRequests(ctx, body.repositoryId, { force: true });
      json(res, 200, { ...result, sync: pullRequestSyncState(ctx, body.repositoryId) }); return;
    }
    if (path === '/api/prs' && method === 'GET') {
      const filter = filterFromUrl(ctx, url); const page = pageOptions(url, filter);
      if (page.after) utc(page.after.at);
      let rows = listPullRequests(ctx, filter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      if (page.after) rows = rows.filter((row) => row.updatedAt < page.after!.at || row.updatedAt === page.after!.at && row.id > page.after!.id);
      const items = rows.slice(0, page.limit); const last = items.at(-1); const projects = selectedProjects(ctx, filter);
      const repositories = ctx.db.all<{ id: string; canonical: string; project_id: string }>('SELECT DISTINCT r.id, r.canonical, p.project_id FROM repositories r JOIN project_roots p ON p.repository_id = r.id WHERE p.enabled = 1').filter((r) => projects.has(r.project_id) && r.canonical.startsWith('github.com/'));
      json(res, 200, { items, nextCursor: rows.length > page.limit && last ? page.encode(last.updatedAt, last.id) : null, repositories: [...new Map(repositories.map((r) => [r.id, { id: r.id, canonical: r.canonical, sync: pullRequestSyncState(ctx, r.id) }])).values()] }); return;
    }
    if (path === '/api/files' && method === 'GET') {
      const filter = filterFromUrl(ctx, url); const page = pageOptions(url, filter);
      if (page.after) utc(page.after.at);
      await pollFiles(ctx);
      const rows = listFileChanges(ctx, filter, page.limit + 1, page.after ?? undefined); const items = rows.slice(0, page.limit); const last = items.at(-1);
      json(res, 200, { items, nextCursor: rows.length > page.limit && last ? page.encode(last.occurredAt, last.id) : null, scans: fileScans(ctx, filter) }); return;
    }
    if (path === '/api/files/history' && method === 'GET') {
      const rootId = url.searchParams.get('rootId'); uuid(rootId); const filePath = url.searchParams.get('path');
      if (typeof filePath !== 'string' || filePath.length > 4096) throw new DomainError('INVALID_PATH');
      const rows = getFileHistory(ctx, rootId, filePath); json(res, 200, { items: rows.slice(0, 100), hasMore: rows.length > 100 }); return;
    }
    if (path.startsWith('/api/files/') && method === 'GET') {
      const id = path.slice('/api/files/'.length); json(res, 200, await revisionDetail(ctx, id)); return;
    }
    if (path === '/api/evidence-links' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['revisionId', 'sessionId']); uuid(body.revisionId); uuid(body.sessionId);
      await revisionDetail(ctx, body.revisionId);
      if (!ctx.db.get('SELECT id FROM sessions WHERE id = ?', body.sessionId)) throw new DomainError('SESSION_NOT_FOUND', 404);
      linkEvidence(ctx, { sourceId: body.revisionId, targetId: body.sessionId, confidence: 'explicit', reason: 'Associação explícita feita pelo usuário; prevalece sobre hipóteses temporais.' });
      json(res, 200, { linked: true }); return;
    }
    if (path.startsWith('/api/commits/') && method === 'GET') {
      const id = path.slice('/api/commits/'.length); uuid(id);
      const commit = ctx.db.get<{ committed_at: string }>('SELECT committed_at FROM git_commits WHERE id = ?', id);
      if (!commit) throw new DomainError('COMMIT_NOT_FOUND', 404);
      const item = listCommits(ctx, { projectIds: [], from: commit.committed_at, to: new Date(Date.parse(commit.committed_at) + 1).toISOString(), timezone: ctx.config.timezone }).find((c) => c.id === id);
      if (!item) throw new DomainError('COMMIT_NOT_FOUND', 404);
      json(res, 200, { ...item, pullRequests: pullRequestsForCommit(ctx, item.repositoryId, item.sha) }); return;
    }
    if (path === '/api/reports' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['options']); validateReportOptions(body.options);
      const filter = filterFromUrl(ctx, url);
      if (!filter.projectIds.length || filter.includeUnassigned) throw new DomainError('REPORT_PROJECTS_REQUIRED');
      if (body.options.commits) await pollGit(ctx);
      const report = queryReport(ctx, filter, body.options); const id = saveReport(ctx, report);
      json(res, 201, { id, report }); return;
    }
    const download = path.match(/^\/api\/reports\/([^/]+)\.(csv|pdf)$/);
    if (download && method === 'GET') {
      uuid(download[1]); const report = savedReport(ctx, download[1]);
      const bytes = download[2] === 'csv' ? renderCsv(report) : await (await import('../reports/pdf.js')).renderPdf(report);
      res.writeHead(200, { 'Content-Type': download[2] === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf', 'Content-Disposition': `attachment; filename="worklog-${report.filter.from.slice(0, 10)}.${download[2]}"`, 'Content-Length': bytes.byteLength });
      res.end(bytes); return;
    }
    if (path === '/api/commits/scan' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['projectIds']);
      if (!Array.isArray(body.projectIds) || body.projectIds.length > 100) throw new DomainError('INVALID_FILTER');
      body.projectIds.forEach(uuid);
      await pollGit(ctx, { force: true, projectIds: body.projectIds as string[] });
      json(res, 200, { scans: gitScans(ctx, { ...filterFromUrl(ctx, url), projectIds: body.projectIds as string[] }) }); return;
    }
    if (path === '/api/commits' && method === 'GET') {
      const filter = filterFromUrl(ctx, url); const page = pageOptions(url, filter);
      if (page.after) utc(page.after.at);
      await pollGit(ctx);
      const rows = listCommits(ctx, filter, page.limit + 1, page.after ?? undefined);
      const items = rows.slice(0, page.limit); const last = items.at(-1);
      json(res, 200, { items, nextCursor: rows.length > page.limit && last ? page.encode(last.committedAt, last.id) : null, scans: gitScans(ctx, filter) }); return;
    }
    if (path === '/api/projects' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['projectName', 'path'], ['projectId', 'client']);
      const projectId = registerProjectRoot(ctx, { ...body, deviceId: ctx.config.deviceId } as never);
      rebuildSessions(ctx); json(res, 201, { projectId }); return;
    }
    if (path === '/api/projects' && method === 'GET') {
      const page = pageOptions(url, {}); let projects = listProjects(ctx);
      if (page.after) {
        const index = projects.findIndex((project) => project.id === page.after!.id && project.name === page.after!.at);
        if (index < 0) throw new DomainError('STALE_CURSOR'); projects = projects.slice(index + 1);
      }
      const items = projects.slice(0, page.limit); const last = items.at(-1);
      json(res, 200, { items, nextCursor: projects.length > page.limit && last ? page.encode(last.name, last.id) : null }); return;
    }
    if (path === '/api/sources' && method === 'GET') { json(res, 200, { items: sourceStatuses(ctx), collectorStatus: setting(ctx, 'collectorStatus') ?? 'ok' }); return; }
    if (path === '/api/sources' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, ['tool', 'profile', 'configPath', 'version']);
      if (!['claude', 'codex', 'opencode'].includes(String(body.tool)) || typeof body.configPath !== 'string') throw new DomainError('INVALID_SOURCE');
      const id = stableId(ctx.config.installationId, body.tool as string, body.configPath);
      registerSource(ctx, { ...body, id, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, enabled: true } as never);
      json(res, 201, { id }); return;
    }
    const sourceAction = path.match(/^\/api\/sources\/([^/]+)(\/remove)?$/);
    if (sourceAction && ((method === 'PATCH' && !sourceAction[2]) || (method === 'POST' && sourceAction[2]))) {
      const id = sourceAction[1]!; uuid(id); const body = await readBody(req);
      exactKeys(body, sourceAction[2] ? ['revision'] : ['enabled', 'revision']);
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new DomainError('INVALID_SOURCE_CONTROL');
      if (sourceAction[2]) await removeSourceInstrumentation(ctx, id, body.revision as number);
      else controlSource(ctx, id, body.enabled as boolean, body.revision as number);
      json(res, 200, { item: sourceStatuses(ctx).find((source) => source.id === id) }); return;
    }
    if (path === '/api/settings' && method === 'PATCH') {
      const body = await readBody(req); exactKeys(body, ['humanWindowMs']);
      if (!Number.isSafeInteger(body.humanWindowMs) || Number(body.humanWindowMs) < 60_000 || Number(body.humanWindowMs) > 3_600_000) throw new DomainError('INVALID_WINDOW');
      configure(ctx, { revision: operatingConfig(ctx).revision, humanWindowMs: Number(body.humanWindowMs) });
      json(res, 200, { humanWindowMs: Number(body.humanWindowMs) }); return;
    }
    if (path === '/api/settings' && method === 'GET') {
      const remotes = ctx.db.all<{ host: string; device_id: string | null; last_sync_at: string | null; last_error: string | null; clock_skew_ms: number; enabled: number }>('SELECT host, device_id, last_sync_at, last_error, clock_skew_ms, enabled FROM remote_hosts');
      const devices = ctx.db.all<{ id: string; name: string }>('SELECT id, name FROM devices').map((device) => ({ id: device.id, name: device.id === ctx.config.deviceId ? 'Local' : remotes.find((remote) => remote.device_id === device.id)?.host ?? device.name }));
      json(res, 200, { deviceId: ctx.config.deviceId, timezone: ctx.config.timezone, humanWindowMs: Number(setting(ctx, 'humanWindowMs')), idleMs: operatingConfig(ctx).idleMs, focusObservation: setting(ctx, 'focusObservation') ?? 'not-started', devices, automation: { workspaces: workspaces(ctx), localService: await serviceStatus(ctx.config.dataDir), remotes } }); return;
    }
    if (path === '/api/focus' && method === 'POST') {
      const body = await readBody(req); exactKeys(body, [], ['projectId', 'pause']);
      if (body.projectId !== undefined) uuid(body.projectId);
      if (body.pause !== undefined && typeof body.pause !== 'boolean') throw new DomainError('INVALID_FOCUS');
      signalHuman(ctx, typeof body.projectId === 'string' ? body.projectId : null, body.pause === true);
      synchronize(ctx); res.writeHead(204); res.end(); return;
    }
    if (path.startsWith('/api/sessions/') && method === 'GET') {
      const id = path.slice('/api/sessions/'.length); uuid(id);
      const row = ctx.db.get<{ started_at: string; last_event_at: string }>('SELECT started_at, last_event_at FROM sessions WHERE id = ?', id);
      if (!row) throw new DomainError('SESSION_NOT_FOUND', 404);
      const filter: ReportFilter = { projectIds: [], from: row.started_at, to: new Date(Date.parse(row.last_event_at) + 1).toISOString(), timezone: ctx.config.timezone, includeUnassigned: true };
      const session = listSessions(ctx, filter).find((session) => session.id === id);
      const executions = ctx.db.all<{ start_at: string; end_at: string; complete: number }>('SELECT start_at, end_at, complete FROM session_executions WHERE session_id = ? AND kind = ? ORDER BY start_at LIMIT 101', id, 'turn');
      const files = sessionFileChanges(ctx, id);
      json(res, 200, { session, executions: executions.slice(0, 100).map((execution) => ({ start: execution.start_at, end: execution.end_at, complete: Boolean(execution.complete) })), hasMore: executions.length > 100, files: files.slice(0, 100), filesHasMore: files.length > 100 }); return;
    }
    if (method === 'GET' && ['/api/summary', '/api/activity', '/api/sessions'].includes(path)) {
      const filter = filterFromUrl(ctx, url);
      if (path === '/api/activity') {
        const page = pageOptions(url, filter); const query = eventsQuery(ctx, filter);
        if (page.after) { utc(page.after.at); query.clauses.push('(e.occurred_at < ? OR (e.occurred_at = ? AND e.event_id < ?))'); query.parameters.push(page.after.at, page.after.at, page.after.id); }
        const rows = ctx.db.all<{ document: string; project_id: string | null; profile: string }>(`SELECT e.document, p.project_id, s.profile FROM ${query.tables} WHERE ${query.clauses.join(' AND ')} ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT ?`, ...query.parameters, page.limit + 1);
        const items = rows.slice(0, page.limit).map((row) => ({ ...JSON.parse(row.document) as WorkEvent, projectId: row.project_id, profile: row.profile }));
        const last = items.at(-1); json(res, 200, { items, nextCursor: rows.length > page.limit && last ? page.encode(last.occurredAt, last.eventId) : null }); return;
      }
      const sessions = listSessions(ctx, filter);
      if (path === '/api/sessions') {
        const page = pageOptions(url, filter);
        const remaining = page.after ? sessions.filter((session) => session.lastEventAt < page.after!.at || (session.lastEventAt === page.after!.at && session.id > page.after!.id)) : sessions;
        if (page.after) utc(page.after.at);
        const items = remaining.slice(0, page.limit); const last = items.at(-1);
        json(res, 200, { items, nextCursor: remaining.length > page.limit && last ? page.encode(last.lastEventAt, last.id) : null }); return;
      }
      const query = eventsQuery(ctx, filter);
      const selected = selectedProjects(ctx, filter);
      const projects = listProjects(ctx).filter((project) => selected.has(project.id));
      json(res, 200, { summary: deriveTime(ctx, filter), sessionCount: sessions.length, activityCount: ctx.db.get<{ n: number }>(`SELECT count(*) AS n FROM ${query.tables} WHERE ${query.clauses.join(' AND ')}`, ...query.parameters)!.n,
        byProject: projects.slice(0, 20).map((project) => ({ id: project.id, name: project.name, client: project.client, summary: deriveTime(ctx, { ...filter, projectIds: [project.id], includeUnassigned: false }), sessionCount: sessions.filter((session) => session.projectId === project.id).length })), totalProjects: projects.length,
      }); return;
    }
    json(res, 404, { error: 'Rota não implementada nesta etapa.' });
  } catch (error) {
    if (error instanceof DomainError) { json(res, error.status, { error: error.code }); return; }
    throw error;
  }
}
