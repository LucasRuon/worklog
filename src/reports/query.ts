import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertRecord, exactKeys, DomainError, type AppContext, type ReportData, type ReportFilter, type ReportOptions } from '../core/contracts.js';
import { validateFilter } from '../core/filters.js';
import { listProjects } from '../core/projects.js';
import { listSessions } from '../core/sessions.js';
import { deriveTime } from '../core/time.js';
import { gitScans, listCommits } from '../collectors/git.js';
import { listFileChanges, revisionDiffData } from '../collectors/revisions.js';
import { listPullRequests } from '../providers/github.js';
import { adjustmentRevision, listAdjustments, listNotes } from '../core/adjustments.js';

export const defaultReportOptions: ReportOptions = { sessions: true, notes: false, files: true, commits: true, prs: false, fullDiff: false };
export function validateReportOptions(value: unknown): asserts value is ReportOptions {
  assertRecord(value); exactKeys(value, ['sessions', 'notes', 'files', 'commits', 'prs', 'fullDiff']);
  if (Object.values(value).some((v) => typeof v !== 'boolean')) throw new DomainError('INVALID_REPORT_OPTIONS');
  if (value.fullDiff && !value.files) throw new DomainError('REPORT_DIFF_REQUIRES_FILES');
}
export function queryReport(ctx: AppContext, filter: ReportFilter, options: ReportOptions): ReportData {
  validateFilter(filter); validateReportOptions(options);
  if (!filter.projectIds.length || filter.includeUnassigned) throw new DomainError('REPORT_PROJECTS_REQUIRED');
  const selected = new Set(filter.projectIds); const projects = listProjects(ctx).filter((p) => selected.has(p.id));
  if (projects.length !== selected.size) throw new DomainError('UNKNOWN_PROJECT');
  const generatedAt = new Date().toISOString(); const now = Date.parse(generatedAt);
  const sessions = listSessions(ctx, filter, now); const commits = options.commits ? listCommits(ctx, filter, 10_001) : [];
  const adjustments = listAdjustments(ctx, filter);
  const notes = options.notes ? listNotes(ctx, filter) : []; const revisions = options.files ? listFileChanges(ctx, filter, 10001) : [];
  const prs = options.prs ? listPullRequests(ctx, filter, now).map((pr) => ({ ...pr, projectIds: projects.filter((p) => p.roots.some((root) => root.enabled && root.repositoryId === pr.repositoryId && (!filter.deviceIds?.length || filter.deviceIds.includes(root.deviceId)))).map((p) => p.id) })) : [];
  if ([sessions, commits, notes, revisions, prs].some((rows) => rows.length > 10000)) throw new DomainError('REPORT_TOO_LARGE', 413);
  const warnings: string[] = ['Dedicação humana é estimada por sinais; não somar dedicação, execução acumulada de agentes e união de relógio. Commits históricos não geram horas.'];
  if (sessions.some((session) => session.provenance !== 'observed')) warnings.push('A seleção contém histórico importado ou misto. Completude é limitada aos registros disponíveis; foco humano e revisões pré-commit não são reconstruídos.');
  if (filter.sourceIds?.length) warnings.push('Filtro por fonte/perfil: commits e revisões independentes não têm autoria comprovada dessa fonte e não são incluídos.');
  if (options.commits) {
    for (const scan of gitScans(ctx, filter)) {
      const name = projects.find((p) => p.id === scan.projectId)!.name;
      if (scan.error || !scan.scannedAt || scan.pending) warnings.push(`${name}: coleta Git ${scan.error ? 'indisponível; o histórico preservado pode estar desatualizado' : scan.pending ? 'em andamento; histórico parcial' : 'ainda não executada'}.`);
    }
    if (filter.tools?.length && !filter.tools.includes('git')) warnings.push('O filtro de ferramenta exclui Git; nenhum commit foi incluído.');
  }
  if (options.files) warnings.push('Arquivos incluem revisões observadas elegíveis e metadados de commits quando selecionados. Horários de gravação são observados; vínculos temporais não comprovam autoria.');
  const remotes = ctx.db.all<{ device_id: string; host: string; last_error: string | null }>('SELECT device_id, host, last_error FROM remote_hosts WHERE device_id IS NOT NULL');
  const deviceIds = new Set([...sessions.map((s) => s.deviceId), ...commits.flatMap((c) => c.origins.map((o) => o.deviceId)), ...notes.map((n) => n.deviceId), ...revisions.map((r) => r.deviceId), ...adjustments.map((a) => a.deviceId)]);
  const devices = ctx.db.all<{ id: string; name: string }>('SELECT id, name FROM devices').filter((d) => deviceIds.has(d.id)).map((d) => ({ id: d.id, name: d.id === ctx.config.deviceId ? 'Local' : remotes.find((r) => r.device_id === d.id)?.host ?? d.name }));
  for (const remote of remotes) if (deviceIds.has(remote.device_id) && remote.last_error) warnings.push(`${remote.host}: sincronização com erro; dados recebidos podem estar desatualizados.`);
  const report: ReportData = { filter: structuredClone(filter), options: { ...options }, generatedAt, summary: deriveTime(ctx, filter, now), sessions: options.sessions ? sessions : [], commits: commits.map((c) => {
    const canonical = ctx.db.get<{ canonical: string }>('SELECT canonical FROM repositories WHERE id = ?', c.repositoryId)?.canonical;
    const url = canonical && /^github\.com\/[^/]+\/[^/]+$/.test(canonical) ? `https://${canonical}/commit/${c.sha}` : null;
    return { ...c, url, files: options.files ? c.files : [] };
  }), projects: projects.map((p) => ({ id: p.id, name: p.name, client: p.client, summary: deriveTime(ctx, { ...filter, projectIds: [p.id] }, now), sessionCount: sessions.filter((s) => s.projectId === p.id).length })), devices, warnings, notes, revisions, prs, adjustments, adjustmentRevision: adjustmentRevision(ctx) };
  if (options.fullDiff) {
    if (revisions.length > 100) throw new DomainError('REPORT_DIFF_LIMIT', 413);
    const { createTwoFilesPatch } = createRequire(import.meta.url)('diff') as typeof import('diff'); const deadline = Date.now() + 1500;
    report.revisions = revisions.map((item) => {
      if (Date.now() > deadline) throw new DomainError('REPORT_DIFF_LIMIT', 413);
      const input = revisionDiffData(ctx, item.id); let reason = input.reason; let patch: string | null = null;
      if (!reason) {
        patch = createTwoFilesPatch(input.revision.previousPath ?? item.path, item.path, input.before ?? '', input.after ?? '', undefined, undefined, { context: 3, timeout: 200, maxEditLength: 10000 }) ?? null;
        if (patch === null || Buffer.byteLength(patch) > 512 * 1024 || patch.split('\n').length > 10000) { patch = null; reason = 'diff-limit'; }
      }
      return { ...item, diff: { patch, reason } };
    });
  }
  if (Buffer.byteLength(JSON.stringify(report)) > 16 * 1024 * 1024) throw new DomainError('REPORT_TOO_LARGE', 413);
  return report;
}

const snapshots = new WeakMap<AppContext, Map<string, { report: ReportData; expires: number; safety: string }>>();
function safety(ctx: AppContext) { return ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'reportSafetyRevision'")?.value ?? '0'; }
export function invalidateReports(ctx: AppContext) { ctx.db.run("INSERT INTO settings VALUES ('reportSafetyRevision', '1') ON CONFLICT(key) DO UPDATE SET value = cast(cast(value AS INTEGER) + 1 AS TEXT)"); }
export function saveReport(ctx: AppContext, report: ReportData) {
  let store = snapshots.get(ctx); if (!store) { store = new Map(); snapshots.set(ctx, store); }
  for (const [id, snapshot] of store) if (snapshot.expires <= Date.now()) store.delete(id);
  if (store.size >= 5) store.delete(store.keys().next().value!);
  const id = randomUUID(); store.set(id, { report: structuredClone(report), expires: Date.now() + 15 * 60_000, safety: safety(ctx) }); return id;
}
export function savedReport(ctx: AppContext, id: string) {
  const snapshot = snapshots.get(ctx)?.get(id);
  if (!snapshot || snapshot.expires <= Date.now() || snapshot.safety !== safety(ctx)) { snapshots.get(ctx)?.delete(id); throw new DomainError('REPORT_EXPIRED', 410); }
  return snapshot.report;
}
