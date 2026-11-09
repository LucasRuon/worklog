import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertRecord, DomainError, uuid, type AppContext, type PullRequestSnapshot, type ReportFilter } from '../core/contracts.js';
import { selectedProjects, validateFilter } from '../core/filters.js';
import { stableId } from '../core/policy.js';

interface Response { status: number; headers: Record<string, string | undefined>; body: unknown }
export type GithubRequest = (input: { path: string; method: 'GET'; headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
const execute = promisify(execFile);
export const githubIntervalMs = 300_000;

export const githubRead: GithubRequest = async ({ path, headers, signal }) => {
  const args = ['api', '--method', 'GET', '--hostname', 'github.com', '--include', path];
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
  let stdout: string;
  try { ({ stdout } = await execute('gh', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024, signal, env: { ...process.env, GH_PROMPT_DISABLED: '1' } })); }
  catch (error) { stdout = (error as { stdout?: string }).stdout ?? ''; if (!stdout.startsWith('HTTP/')) throw new DomainError('GITHUB_UNAVAILABLE', 503); }
  const split = stdout.search(/\r?\n\r?\n/); const prefix = stdout.slice(0, split); const status = Number(prefix.match(/^HTTP\/[\d.]+\s+(\d{3})/)?.[1]);
  if (split < 0 || !status) throw new DomainError('GITHUB_RESPONSE_INVALID', 503);
  const responseHeaders: Record<string, string> = {};
  for (const line of prefix.split(/\r?\n/).slice(1)) { const at = line.indexOf(':'); if (at > 0) responseHeaders[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim(); }
  let body: unknown = null;
  try { body = JSON.parse(stdout.slice(split).trim()); } catch { /* No raw provider text in diagnostics. */ }
  return { status, headers: responseHeaders, body };
};

function text(value: unknown, max = 4096): string { if (typeof value !== 'string' || !value.length || value.length > max || value.includes('\0')) throw new DomainError('GITHUB_RESPONSE_INVALID'); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new DomainError('GITHUB_RESPONSE_INVALID'); return Number(value); }
function date(value: unknown): string { if (typeof value !== 'string' || !value.endsWith('Z') || !Number.isFinite(Date.parse(value))) throw new DomainError('GITHUB_RESPONSE_INVALID'); return new Date(value).toISOString(); }
function nullableDate(value: unknown) { return value === null || value === undefined ? null : date(value); }
function sha(value: unknown) { const result = text(value, 64); if (!/^[a-f0-9]{40,64}$/.test(result)) throw new DomainError('GITHUB_RESPONSE_INVALID'); return result; }
function knownState(value: unknown, allowed: string[]) { const result = text(value, 64); if (!allowed.includes(result)) throw new DomainError('GITHUB_RESPONSE_INVALID'); return result; }
function repo(ctx: AppContext, repositoryId: string) {
  uuid(repositoryId);
  const row = ctx.db.get<{ canonical: string }>('SELECT canonical FROM repositories WHERE id = ?', repositoryId);
  if (!row || !/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.canonical) || !ctx.db.get('SELECT id FROM project_roots WHERE repository_id = ? AND enabled = 1', repositoryId)) throw new DomainError('GITHUB_REPOSITORY_UNSUPPORTED', 400);
  return row.canonical.slice('github.com/'.length);
}
function normalizePull(value: unknown, repositoryId: string, canonical: string): PullRequestSnapshot {
  assertRecord(value); assertRecord(value.user); assertRecord(value.head); assertRecord(value.base);
  if (!['open', 'closed'].includes(String(value.state)) || typeof value.draft !== 'boolean') throw new DomainError('GITHUB_RESPONSE_INVALID');
  const number = integer(value.number); const mergedAt = nullableDate(value.merged_at);
  return { id: stableId('github', repositoryId, String(number)), provider: 'github', repositoryId, number, url: `https://github.com/${canonical}/pull/${number}`, title: text(value.title), state: mergedAt ? 'merged' : value.state as 'open' | 'closed', draft: value.draft, author: text(value.user.login, 160), baseBranch: text(value.base.ref), headBranch: text(value.head.ref), headSha: sha(value.head.sha), createdAt: date(value.created_at), updatedAt: date(value.updated_at), closedAt: nullableDate(value.closed_at), mergedAt, stale: false, commits: [], commitsState: 'unavailable', reviews: { state: 'unavailable', items: [] }, checks: { state: 'unavailable', items: [] } };
}

export function pullRequestSyncState(ctx: AppContext, repositoryId: string) {
  const row = ctx.db.get<{ last_sync_at: string | null; next_sync_ms: number; error: string | null; enabled: number }>('SELECT * FROM pr_sync WHERE repository_id = ?', repositoryId);
  return row ? { repositoryId, lastSyncedAt: row.last_sync_at, nextSyncAt: row.next_sync_ms, error: row.error, enabled: Boolean(row.enabled) } : null;
}
interface SyncOptions { request?: GithubRequest; now?: number; force?: boolean; signal?: AbortSignal }
const running = new WeakMap<AppContext, Map<string, Promise<{ updated: number; stale: boolean }>>>();
const controllers = new WeakMap<AppContext, Map<string, AbortController>>();
const polling = new WeakMap<AppContext, Promise<void>>();
const stopping = new WeakSet<AppContext>();
export function syncPullRequests(ctx: AppContext, repositoryId: string, options: SyncOptions = {}): Promise<{ updated: number; stale: boolean }> {
  if (stopping.has(ctx)) return Promise.resolve({ updated: 0, stale: true });
  const canonical = repo(ctx, repositoryId); const now = options.now ?? Date.now();
  let jobs = running.get(ctx); if (!jobs) { jobs = new Map(); running.set(ctx, jobs); }
  const existing = jobs.get(repositoryId); if (existing) return existing;
  let aborts = controllers.get(ctx); if (!aborts) { aborts = new Map(); controllers.set(ctx, aborts); }
  const controller = new AbortController(); aborts.set(repositoryId, controller);
  const task = sync(ctx, repositoryId, canonical, now, { ...options, signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal }).finally(() => { jobs!.delete(repositoryId); aborts!.delete(repositoryId); }); jobs.set(repositoryId, task); return task;
}
async function sync(ctx: AppContext, repositoryId: string, canonical: string, now: number, options: SyncOptions) {
  const previous = ctx.db.get<{ next_sync_ms: number; retry_after_ms: number; error: string | null }>('SELECT * FROM pr_sync WHERE repository_id = ?', repositoryId);
  if (previous && (previous.retry_after_ms > now || !options.force && previous.next_sync_ms > now)) return { updated: 0, stale: Boolean(previous.error) };
  ctx.db.run('INSERT OR IGNORE INTO pr_sync(repository_id) VALUES (?)', repositoryId);
  const lease = ctx.db.run('UPDATE pr_sync SET next_sync_ms = ? WHERE repository_id = ? AND retry_after_ms <= ? AND (? OR next_sync_ms <= ?)', now + githubIntervalMs, repositoryId, now, Number(Boolean(options.force)), now);
  if (!lease.changes) return { updated: 0, stale: Boolean(previous?.error) };
  let retryAt = now + githubIntervalMs;
  let blockedUntil = 0;
  const request = options.request ?? githubRead;
  const read = async (path: string, headers: Record<string, string> = {}) => {
    if (options.signal?.aborted) throw new DomainError('GITHUB_CANCELLED');
    if (blockedUntil > now) throw new DomainError('GITHUB_RATE_LIMIT');
    const response = await request({ path, method: 'GET', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...headers }, signal: options.signal });
    const retry = response.headers['retry-after']; const reset = response.headers['x-ratelimit-reset'];
    if (response.headers['x-ratelimit-remaining'] === '0') {
      blockedUntil = Math.max(now + githubIntervalMs, reset ? Number(reset) * 1000 || 0 : 0); retryAt = Math.max(retryAt, blockedUntil);
    }
    if (response.status === 429 || response.status === 403 && (response.headers['x-ratelimit-remaining'] === '0' || !!retry)) {
      retryAt = Math.max(retryAt, retry ? Number.isFinite(Number(retry)) ? now + Number(retry) * 1000 : Date.parse(retry) || 0 : 0, reset ? Number(reset) * 1000 || 0 : 0);
      throw new DomainError('GITHUB_RATE_LIMIT');
    }
    return response;
  };
  async function resource<T>(path: string, normalize: (value: unknown) => T, key?: string): Promise<{ available: boolean; items: T[] }> {
    const items: T[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await read(`${path}?per_page=100&page=${page}`);
      if ([401, 403, 404].includes(response.status)) return { available: false, items: [] };
      if (response.status !== 200) throw new DomainError('GITHUB_ENRICHMENT_UNAVAILABLE');
      let values = response.body;
      if (key) { assertRecord(values); values = values[key]; }
      if (!Array.isArray(values) || values.length > 100) throw new DomainError('GITHUB_RESPONSE_INVALID');
       try { items.push(...values.map(normalize)); }
       catch (error) { if (error instanceof DomainError && error.code === 'GITHUB_RESPONSE_INVALID') return { available: false, items: [] }; throw error; }
      if (!response.headers.link?.includes('rel="next"')) return { available: true, items };
    }
    throw new DomainError('GITHUB_PAGINATION_LIMIT');
  }
  try {
    const pulls: PullRequestSnapshot[] = [];
    for (let page = 1; page <= 100; page++) {
      const path = `repos/${canonical}/pulls?state=all&per_page=100&page=${page}`;
      const cache = ctx.db.get<{ etag: string | null; document: string; has_more: number }>('SELECT * FROM github_page_cache WHERE repository_id = ? AND path = ?', repositoryId, path);
      const response = await read(path, cache?.etag ? { 'If-None-Match': cache.etag } : {});
      let records: PullRequestSnapshot[]; let more: boolean;
      if (response.status === 304 && cache) { records = JSON.parse(cache.document) as PullRequestSnapshot[]; more = Boolean(cache.has_more); }
      else {
        if (response.status !== 200) throw new DomainError(response.status === 401 ? 'GITHUB_UNAUTHORIZED' : response.status === 403 ? 'GITHUB_FORBIDDEN' : 'GITHUB_UNAVAILABLE');
        if (!Array.isArray(response.body) || response.body.length > 100) throw new DomainError('GITHUB_RESPONSE_INVALID');
        records = response.body.map((value) => normalizePull(value, repositoryId, canonical)); more = Boolean(response.headers.link?.includes('rel="next"'));
        const etag = response.headers.etag && /^[^\r\n]{1,512}$/.test(response.headers.etag) ? response.headers.etag : null;
        ctx.db.run('INSERT INTO github_page_cache VALUES (?, ?, ?, ?, ?) ON CONFLICT(repository_id, path) DO UPDATE SET etag = excluded.etag, document = excluded.document, has_more = excluded.has_more', repositoryId, path, etag, JSON.stringify(records), Number(more));
      }
      pulls.push(...records);
      if (!more) break;
      if (page === 100) throw new DomainError('GITHUB_PAGINATION_LIMIT');
    }
    for (const pull of pulls) {
      const reviews = await resource(`repos/${canonical}/pulls/${pull.number}/reviews`, (value) => { assertRecord(value); assertRecord(value.user); return { id: integer(value.id), author: text(value.user.login, 160), state: knownState(value.state, ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']), submittedAt: nullableDate(value.submitted_at) }; });
      pull.reviews = { state: reviews.available ? 'available' : 'unavailable', items: reviews.items };
      const checks = await resource(`repos/${canonical}/commits/${pull.headSha}/check-runs`, (value) => { assertRecord(value); return { id: integer(value.id), name: text(value.name, 512), status: knownState(value.status, ['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending']), conclusion: value.conclusion == null ? null : knownState(value.conclusion, ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale']) }; }, 'check_runs');
      pull.checks = { state: !checks.available ? 'unavailable' : checks.items.length ? 'available' : 'none', items: checks.items };
      const commits = await resource(`repos/${canonical}/pulls/${pull.number}/commits`, (value) => { assertRecord(value); return sha(value.sha); });
      pull.commits = commits.items; pull.commitsState = commits.available ? 'available' : 'unavailable';
    }
    let updated = 0;
    ctx.db.transaction(() => {
      for (const pull of new Map(pulls.map((pull) => [pull.number, pull])).values()) {
        const document = JSON.stringify(pull);
        if (ctx.db.get<{ document: string }>('SELECT document FROM pull_requests WHERE id = ?', pull.id)?.document !== document) updated++;
        ctx.db.run('INSERT INTO pull_requests VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, document = excluded.document', pull.id, repositoryId, pull.number, pull.updatedAt, document);
        ctx.db.run('DELETE FROM pull_request_commits WHERE pull_request_id = ?', pull.id);
        pull.commits.forEach((hash) => ctx.db.run('INSERT OR IGNORE INTO pull_request_commits VALUES (?, ?)', pull.id, hash));
      }
      ctx.db.run('UPDATE pr_sync SET enabled = 1, last_sync_at = ?, next_sync_ms = ?, retry_after_ms = ?, error = NULL WHERE repository_id = ?', new Date(now).toISOString(), Math.max(now + githubIntervalMs, blockedUntil), blockedUntil, repositoryId);
    });
    return { updated, stale: false };
  } catch (error) {
    const code = options.signal?.aborted ? 'GITHUB_CANCELLED' : error instanceof DomainError && error.code.startsWith('GITHUB_') ? error.code : 'GITHUB_UNAVAILABLE';
    ctx.db.run('UPDATE pr_sync SET next_sync_ms = ?, retry_after_ms = ?, error = ? WHERE repository_id = ?', retryAt, retryAt, code, repositoryId);
    return { updated: 0, stale: true };
  }
}

export function listPullRequests(ctx: AppContext, filter: ReportFilter, now = Date.now()): PullRequestSnapshot[] {
  validateFilter(filter);
  if (filter.sourceIds?.length || filter.tools?.length && !filter.tools.includes('git')) return [];
  const projects = [...selectedProjects(ctx, filter)]; if (!projects.length) return [];
  const clauses = [`r.project_id IN (${projects.map(() => '?').join(',')})`, 'r.enabled = 1', 'p.updated_at >= ?', 'p.updated_at < ?']; const params: (string | number)[] = [...projects, filter.from, filter.to];
  if (filter.deviceIds?.length) { clauses.push(`r.device_id IN (${filter.deviceIds.map(() => '?').join(',')})`); params.push(...filter.deviceIds); }
  return ctx.db.all<{ document: string; error: string | null; last_sync_at: string | null }>(`SELECT DISTINCT p.document, s.error, s.last_sync_at FROM pull_requests p JOIN project_roots r ON r.repository_id = p.repository_id LEFT JOIN pr_sync s ON s.repository_id = p.repository_id WHERE ${clauses.join(' AND ')} ORDER BY p.updated_at DESC, p.number DESC`, ...params).map((row) => ({ ...JSON.parse(row.document) as PullRequestSnapshot, stale: !!row.error || !row.last_sync_at || now - Date.parse(row.last_sync_at) > githubIntervalMs }));
}
export function pullRequestsForCommit(ctx: AppContext, repositoryId: string, hash: string) {
  return listPullRequests(ctx, { projectIds: [], from: '1970-01-01T00:00:00.000Z', to: '9999-01-01T00:00:00.000Z', timezone: 'UTC' }).filter((pr) => pr.repositoryId === repositoryId && pr.commits.includes(hash));
}
export function pollPullRequests(ctx: AppContext): Promise<void> {
  if (stopping.has(ctx)) return Promise.resolve();
  const previous = polling.get(ctx); if (previous) return previous;
  const task = (async () => {
    for (const row of ctx.db.all<{ repository_id: string }>('SELECT repository_id FROM pr_sync WHERE enabled = 1 AND next_sync_ms <= ?', Date.now())) {
      if (stopping.has(ctx)) break;
      await syncPullRequests(ctx, row.repository_id);
    }
  })().finally(() => polling.delete(ctx));
  polling.set(ctx, task); return task;
}
export async function waitForPullRequests(ctx: AppContext) {
  stopping.add(ctx); controllers.get(ctx)?.forEach((controller) => controller.abort());
  await polling.get(ctx); await Promise.all(running.get(ctx)?.values() ?? []);
}
