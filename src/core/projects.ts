import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, posix } from 'node:path';
import { inside } from './context.js';
import { publishCaptureManifest } from '../collectors/source-config.js';
import { assertRecord, exactKeys, uuid, DomainError, type AppContext, type ProjectRoot, type ProjectMatch, type Project } from './contracts.js';
import { assignClientByNameInTransaction } from './clients.js';
import { linkedRoot } from './worktrees.js';

export function normalizeRemote(remote: string): string {
  if (typeof remote !== 'string' || remote.length > 4096 || /[\x00-\x20]/.test(remote)) throw new DomainError('INVALID_REMOTE');
  const scp = !remote.includes('://') && remote.match(/^(?:[^@/:]+@)?([^/:]+):(.+)$/);
  let host: string; let path: string;
  if (scp) { host = scp[1]!.toLowerCase(); path = scp[2]!; }
  else {
    let url: URL;
    try { url = new URL(remote); } catch { throw new DomainError('INVALID_REMOTE'); }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) throw new DomainError('INVALID_REMOTE');
    host = url.hostname.toLowerCase() + (url.port && !(url.protocol === 'ssh:' && url.port === '22') ? `:${url.port}` : '');
    path = url.pathname;
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!host || !/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new DomainError('INVALID_REMOTE');
  return `${host}/${path}`;
}

export function gitRead(path: string, args: string[]): string {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 1024 * 1024 }).trim();
}
interface RootRow { id: string; project_id: string; repository_id: string | null; device_id: string; path: string; worktree: string; enabled: number }

export function canonicalPath(path: string): string {
  try { return realpathSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    const parent = dirname(path);
    return resolve(canonicalPath(parent), relative(parent, path));
  }
}

export function registerProjectRoot(ctx: AppContext, root: ProjectRoot, options: { captured?: boolean } = {}): string {
  assertRecord(root); exactKeys(root, ['projectName', 'deviceId', 'path'], ['id', 'projectId', 'client', 'repositoryId', 'remote', 'worktree', 'enabled']);
  uuid(root.deviceId);
  for (const id of [root.id, root.projectId, root.repositoryId]) if (id !== undefined) uuid(id);
  if (typeof root.path !== 'string' || !isAbsolute(root.path) || root.path.length > 4096 || /[\x00-\x1f]/.test(root.path) || typeof root.projectName !== 'string' || root.projectName.trim().length < 1 || root.projectName.length > 160 || (root.client !== undefined && (typeof root.client !== 'string' || root.client.length > 160)) || (root.enabled !== undefined && typeof root.enabled !== 'boolean')) throw new DomainError('INVALID_ROOT');
  const local = root.deviceId === ctx.config.deviceId;
  let path: string;
  try { path = local ? options.captured ? canonicalPath(root.path) : realpathSync(root.path) : posix.resolve(root.path); }
  catch { throw new DomainError('ROOT_UNAVAILABLE'); }
  if (local && ((existsSync(path) && !statSync(path).isDirectory()) || (!existsSync(path) && !options.captured) || inside(path, ctx.config.dataDir) || inside(ctx.config.dataDir, path))) throw new DomainError('DATA_ROOT_OVERLAP');
  let canonical = root.remote === undefined ? null : normalizeRemote(root.remote);
  let worktree = path;
  if (local) {
    try {
      worktree = realpathSync(gitRead(path, ['rev-parse', '--show-toplevel']));
      if (!canonical) {
        try { canonical = normalizeRemote(gitRead(path, ['remote', 'get-url', 'origin'])); }
        catch { canonical = `local:${root.deviceId}:${realpathSync(resolve(path, gitRead(path, ['rev-parse', '--git-common-dir'])))}`; }
      }
    } catch { /* Uma pasta explicitamente cadastrada não precisa ter Git. */ }
  }
  const projectId = ctx.db.transaction(() => {
    const previous = ctx.db.get<RootRow>('SELECT * FROM project_roots WHERE device_id = ? AND path = ?', root.deviceId, path);
    let repositoryId = root.repositoryId ?? null;
    if (repositoryId && !ctx.db.get('SELECT id FROM repositories WHERE id = ?', repositoryId)) throw new DomainError('UNKNOWN_REPOSITORY');
    if (!repositoryId && canonical) {
      ctx.db.run('INSERT OR IGNORE INTO repositories(id, canonical) VALUES (?, ?)', randomUUID(), canonical);
      repositoryId = ctx.db.get<{ id: string }>('SELECT id FROM repositories WHERE canonical = ?', canonical)!.id;
    }
    const associated = repositoryId ? ctx.db.get<{ primary_project_id: string | null }>('SELECT primary_project_id FROM repositories WHERE id = ?', repositoryId)?.primary_project_id : undefined;
    const projectId = root.projectId ?? previous?.project_id ?? associated ?? randomUUID();
    ctx.db.run('INSERT OR IGNORE INTO projects VALUES (?, ?, ?)', projectId, root.projectName.trim(), null);
    if (root.client?.trim()) assignClientByNameInTransaction(ctx, projectId, root.client);
    if (repositoryId) ctx.db.run('UPDATE repositories SET primary_project_id = COALESCE(primary_project_id, ?) WHERE id = ?', projectId, repositoryId);
    ctx.db.run('INSERT INTO project_roots VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id, path) DO UPDATE SET project_id = excluded.project_id, repository_id = excluded.repository_id, enabled = excluded.enabled', previous?.id ?? root.id ?? randomUUID(), projectId, repositoryId, root.deviceId, path, worktree, Number(root.enabled ?? true));
    ctx.db.run('UPDATE project_roots SET enabled = 0 WHERE id IN (SELECT root_id FROM root_controls WHERE enabled = 0)');
    return projectId;
  });
  publishCaptureManifest(ctx);
  return projectId;
}

export function resolveProject(ctx: AppContext, deviceId: string, cwd: string, historical = false): ProjectMatch {
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || /[\x00-\x1f]/.test(cwd)) return { state: 'unassigned', reason: 'invalid-path' };
  let path: string;
  try { path = deviceId === ctx.config.deviceId ? canonicalPath(cwd) : posix.resolve(cwd); }
  catch { return { state: 'unassigned', reason: 'invalid-path' }; }
  const roots = ctx.db.all<RootRow>('SELECT * FROM project_roots WHERE device_id = ?', deviceId).sort((a, b) => b.path.length - a.path.length);
  let root = roots.find((root) => inside(root.path, path));
  // Worktrees do mesmo repositório pertencem ao projeto, mesmo fora da pasta da raiz (só nesta máquina: o Git é local).
  if (!root && deviceId === ctx.config.deviceId) root = linkedRoot(roots.filter((candidate) => candidate.enabled || historical), path);
  if (!root) return { state: 'unassigned', reason: 'outside-roots' };
  if (!root.enabled && !historical) return { state: 'unassigned', reason: 'paused' };
  return { state: 'matched', projectId: root.project_id, repositoryId: root.repository_id, rootId: root.id, worktree: root.worktree, reason: 'authorized-root' };
}

export function listProjects(ctx: AppContext): Project[] {
  return ctx.db.all<{ id: string; name: string; client: string | null; clientId: string | null }>('SELECT p.id, p.name, c.name AS client, c.id AS clientId FROM projects p LEFT JOIN project_clients pc ON pc.project_id = p.id LEFT JOIN clients c ON c.id = pc.client_id ORDER BY p.name, p.id').map((project) => ({ ...project, roots: ctx.db.all<RootRow>('SELECT * FROM project_roots WHERE project_id = ? ORDER BY device_id, path', project.id).map((root) => ({ id: root.id, projectId: project.id, projectName: project.name, ...(project.client ? { client: project.client } : {}), deviceId: root.device_id, path: root.path, ...(root.repository_id ? { repositoryId: root.repository_id } : {}), worktree: root.worktree, enabled: Boolean(root.enabled) })) }));
}
