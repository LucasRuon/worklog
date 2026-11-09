import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { DomainError, type AppContext, type GitCommit, type GitFile, type GitScan, type ProjectRoot, type ReportFilter } from '../core/contracts.js';
import { listProjects } from '../core/projects.js';
import { gitMetadataAllowed, gitPathAllowed, policyFor, stableId } from '../core/policy.js';
import { selectedProjects, validateFilter } from '../core/filters.js';

const execute = promisify(execFile);
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
async function git(path: string, args: string[]) {
  const result = await execute('git', ['--no-pager', '--no-optional-locks', '--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', path, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return result.stdout;
}
type Metadata = Omit<GitCommit, 'files' | 'origins'>;
interface Ref { name: string; sha: string }

export async function scanCommits(ctx: AppContext, input: ProjectRoot): Promise<{ inserted: number; cursor: string }> {
  // Revalidar contra o cadastro: nenhuma raiz fornecida pelo cliente autoriza leitura sozinha.
  const root = listProjects(ctx).flatMap((p) => p.roots).find((r) => r.id === input.id && r.deviceId === ctx.config.deviceId && r.enabled && r.repositoryId);
  if (!root?.id || !root.repositoryId) throw new DomainError('GIT_ROOT_UNAVAILABLE');
  try {
    const worktree = realpathSync((await git(root.path, ['rev-parse', '--show-toplevel'])).trim());
    if (worktree !== root.worktree) throw new DomainError('GIT_ROOT_CHANGED');
    let head = '';
    try { head = (await git(root.path, ['rev-parse', '--verify', 'HEAD'])).trim(); }
    catch { /* Repositório ainda sem commits. */ }
    const refs = (await git(root.path, ['for-each-ref', '--format=%(refname)%00%(objectname)%00'])).split('\n').filter(Boolean).map((line) => {
      const [name, sha] = line.split('\0'); return { name: name!, sha: sha! };
    });
    if (head) refs.push({ name: 'HEAD', sha: head });
    const hashes = (await git(root.path, ['rev-list', '--all', ...(head ? ['HEAD'] : [])])).split('\n').filter(Boolean);
    if (hashes.some((sha) => !shaPattern.test(sha))) throw new DomainError('GIT_OUTPUT_INVALID');
    const known = new Set(ctx.db.all<{ sha: string }>('SELECT c.sha FROM git_commits c JOIN git_observations o ON o.commit_id = c.id WHERE o.root_id = ?', root.id).map((r) => r.sha));
    const missing = hashes.filter((sha) => !known.has(sha));
    const records: { metadata: Metadata; files: GitFile[] }[] = [];
    // ponytail: lotes de 100 objetos, sem truncar silenciosamente históricos grandes; próximas rodadas continuam.
    for (const sha of missing.slice(0, 100)) {
      const fields = (await git(root.path, ['show', '--no-patch', '--encoding=UTF-8', '--format=format:%H%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B%x00', sha, '--'])).split('\0');
      if (fields.length !== 10 || fields[0] !== sha) throw new DomainError('GIT_OUTPUT_INVALID');
      const metadata: Metadata = { id: stableId(root.repositoryId, sha), repositoryId: root.repositoryId, sha, parents: fields[1] ? fields[1].split(' ') : [], authorName: fields[2]!, authorEmail: fields[3]!, authoredAt: new Date(fields[4]!).toISOString(), committerName: fields[5]!, committerEmail: fields[6]!, committedAt: new Date(fields[7]!).toISOString(), message: fields[8]! };
      const parts = (await git(root.path, ['diff-tree', '--root', '--first-parent', '-m', '--no-commit-id', '--no-ext-diff', '--no-textconv', '-r', '-M', '--name-status', '-z', sha, '--'])).split('\0');
      const files: GitFile[] = [];
      for (let index = 0; index < parts.length - 1;) {
        const status = parts[index++]!; const first = parts[index++]!;
        if (!/^[ACDMRTUXB][0-9]*$/.test(status) || first === undefined) throw new DomainError('GIT_OUTPUT_INVALID');
        const rename = status.startsWith('R') || status.startsWith('C');
        const path = rename ? parts[index++] : first;
        if (path === undefined) throw new DomainError('GIT_OUTPUT_INVALID');
        if (gitMetadataAllowed(root, path, policyFor(ctx)) && (!rename || gitMetadataAllowed(root, first, policyFor(ctx)))) files.push({ path, previousPath: rename ? first : null, status });
      }
      records.push({ metadata, files });
    }
    const at = new Date().toISOString(); const reachable = new Set(hashes); let inserted = 0;
    ctx.db.transaction(() => {
      for (const { metadata, files } of records) {
        inserted += Number(ctx.db.run('INSERT OR IGNORE INTO git_commits VALUES (?, ?, ?, ?, ?)', metadata.id, root.repositoryId!, metadata.sha, metadata.committedAt, JSON.stringify(metadata)).changes);
        ctx.db.run('INSERT INTO git_observations VALUES (?, ?, 1, ?) ON CONFLICT(root_id, commit_id) DO UPDATE SET reachable = 1, observed_at = excluded.observed_at', root.id!, metadata.id, at);
        files.forEach((file, index) => ctx.db.run('INSERT INTO git_files VALUES (?, ?, ?, ?, ?, ?)', root.id!, metadata.id, index, file.path, file.previousPath, file.status));
      }
      for (const row of ctx.db.all<{ id: string; sha: string }>('SELECT c.id, c.sha FROM git_commits c JOIN git_observations o ON c.id = o.commit_id WHERE o.root_id = ?', root.id!)) {
        ctx.db.run('UPDATE git_observations SET reachable = ?, observed_at = ? WHERE root_id = ? AND commit_id = ?', Number(reachable.has(row.sha)), at, root.id!, row.id);
      }
      const pending = missing.length > records.length;
      ctx.db.run('INSERT INTO git_scans(root_id, scanned_at, next_scan_ms, cursor, pending, error, refs) VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(root_id) DO UPDATE SET scanned_at = excluded.scanned_at, next_scan_ms = excluded.next_scan_ms, cursor = excluded.cursor, pending = excluded.pending, error = NULL, refs = excluded.refs', root.id!, at, Date.now() + (pending ? 1000 : 30_000), head, Number(pending), JSON.stringify(refs));
    });
    return { inserted, cursor: head };
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'GIT_SCAN_FAILED';
    ctx.db.run('INSERT INTO git_scans(root_id, next_scan_ms, error) VALUES (?, ?, ?) ON CONFLICT(root_id) DO UPDATE SET next_scan_ms = excluded.next_scan_ms, error = excluded.error', root.id, Date.now() + 30_000, code);
    throw new DomainError(code, 503);
  }
}

const running = new WeakMap<AppContext, Promise<void>>();
export function pollGit(ctx: AppContext, options: { force?: boolean; projectIds?: string[] } = {}): Promise<void> {
  const previous = running.get(ctx);
  if (previous) return options.force ? previous.then(() => pollGit(ctx, options)) : previous;
  const task = (async () => {
    for (const root of listProjects(ctx).flatMap((p) => p.roots)) {
      if (root.deviceId !== ctx.config.deviceId || !root.enabled || !root.repositoryId || (options.projectIds?.length && !options.projectIds.includes(root.projectId!))) continue;
      ctx.db.run('INSERT OR IGNORE INTO git_scans(root_id) VALUES (?)', root.id!);
      const lease = ctx.db.run('UPDATE git_scans SET next_scan_ms = ? WHERE root_id = ? AND (? OR next_scan_ms <= ?)', Date.now() + 120_000, root.id!, Number(Boolean(options.force)), Date.now());
      if (!lease.changes) continue;
      try { await scanCommits(ctx, root); } catch { /* Último histórico preservado; diagnóstico consultável. */ }
    }
  })().finally(() => { running.delete(ctx); });
  running.set(ctx, task); return task;
}
export async function waitForGit(ctx: AppContext) { await running.get(ctx); }

export function gitScans(ctx: AppContext, filter: ReportFilter): GitScan[] {
  const projects = selectedProjects(ctx, filter);
  return listProjects(ctx).filter((p) => projects.has(p.id)).flatMap((p) => p.roots.filter((r) => r.enabled && r.repositoryId && (!filter.deviceIds?.length || filter.deviceIds.includes(r.deviceId))).map((root) => {
    const scan = ctx.db.get<{ scanned_at: string | null; pending: number; error: string | null }>('SELECT * FROM git_scans WHERE root_id = ?', root.id!);
    const remoteError = root.deviceId === ctx.config.deviceId ? null : ctx.db.get<{ error: string | null }>('SELECT g.error FROM git_remote_sync g JOIN installations i ON g.installation_id = i.id WHERE i.device_id = ? AND g.error IS NOT NULL LIMIT 1', root.deviceId)?.error;
    return { rootId: root.id!, projectId: p.id, deviceId: root.deviceId, path: root.path, scannedAt: scan?.scanned_at ?? null, pending: Boolean(scan?.pending), error: remoteError ?? (scan ? scan.error : root.deviceId === ctx.config.deviceId ? null : 'GIT_REMOTE_UNAVAILABLE') };
  }));
}

export function listCommits(ctx: AppContext, filter: ReportFilter, limit?: number, after?: { at: string; id: string }): GitCommit[] {
  validateFilter(filter);
  if (filter.sourceIds?.length || filter.tools?.length && !filter.tools.includes('git')) return [];
  const projects = [...selectedProjects(ctx, filter)]; if (!projects.length) return [];
  const clauses = ['c.committed_at >= ?', 'c.committed_at < ?', 'r.enabled = 1', `r.project_id IN (${projects.map(() => '?').join(',')})`];
  const params: (string | number)[] = [filter.from, filter.to, ...projects];
  if (filter.deviceIds?.length) { clauses.push(`r.device_id IN (${filter.deviceIds.map(() => '?').join(',')})`); params.push(...filter.deviceIds); }
  if (after) { clauses.push('(c.committed_at < ? OR (c.committed_at = ? AND c.id < ?))'); params.push(after.at, after.at, after.id); }
  const rows = ctx.db.all<{ id: string; document: string }>(`SELECT DISTINCT c.id, c.document, c.committed_at FROM git_commits c JOIN git_observations o ON o.commit_id = c.id JOIN project_roots r ON r.id = o.root_id WHERE ${clauses.join(' AND ')} ORDER BY c.committed_at DESC, c.id DESC ${limit ? 'LIMIT ?' : ''}`, ...params, ...(limit ? [limit] : []));
  return rows.map((row) => {
    const observations = ctx.db.all<{ root_id: string; device_id: string; project_id: string; reachable: number; observed_at: string; refs: string | null }>('SELECT o.*, r.device_id, r.project_id, s.refs FROM git_observations o JOIN project_roots r ON r.id = o.root_id LEFT JOIN git_scans s ON s.root_id = r.id WHERE o.commit_id = ? AND r.enabled = 1', row.id).filter((o) => projects.includes(o.project_id) && (!filter.deviceIds?.length || filter.deviceIds.includes(o.device_id)));
    const metadata = JSON.parse(row.document) as Metadata;
    const files = observations.flatMap((o) => ctx.db.all<{ path: string; previous_path: string | null; status: string }>('SELECT path, previous_path, status FROM git_files WHERE root_id = ? AND commit_id = ? ORDER BY position', o.root_id, row.id).map((f) => ({ path: f.path, previousPath: f.previous_path, status: f.status })));
    return { ...metadata, files: [...new Map(files.filter((f) => gitPathAllowed(f.path, policyFor(ctx)) && (!f.previousPath || gitPathAllowed(f.previousPath, policyFor(ctx)))).map((f) => [JSON.stringify(f), f])).values()], origins: observations.map((o) => ({ rootId: o.root_id, deviceId: o.device_id, projectId: o.project_id, reachable: Boolean(o.reachable), observedAt: o.observed_at, refs: (JSON.parse(o.refs ?? '[]') as Ref[]).filter((ref) => ref.sha === metadata.sha).map((ref) => ref.name) })) };
  });
}
