import { realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { inside } from './context.js';
import { DomainError, type AppContext } from './contracts.js';
import { gitRead, registerProjectRoot, resolveProject } from './projects.js';
import { captureDecision, defaultPolicy } from './policy.js';
import { publishCaptureManifest } from '../collectors/source-config.js';

export function workspaces(ctx: AppContext): string[] {
  const row = ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'autoWorkspaces'");
  const value: unknown = row ? JSON.parse(row.value) : [];
  if (!Array.isArray(value) || value.some((path) => typeof path !== 'string' || !isAbsolute(path))) throw new DomainError('INVALID_WORKSPACES');
  return value as string[];
}
export function setWorkspaces(ctx: AppContext, paths: string[]) {
  if (!Array.isArray(paths) || paths.length > 50) throw new DomainError('INVALID_WORKSPACES');
  const roots = [...new Set(paths.map((path) => {
    if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f]/.test(path)) throw new DomainError('INVALID_WORKSPACES');
    const canonical = realpathSync(path);
    if (!statSync(canonical).isDirectory() || inside(canonical, ctx.config.dataDir) || inside(ctx.config.dataDir, canonical)) throw new DomainError('WORKSPACE_DATA_OVERLAP');
    return canonical;
  }))];
  ctx.db.run("INSERT INTO settings VALUES ('autoWorkspaces', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(roots));
  publishCaptureManifest(ctx);
  return roots;
}

export function discoverProject(ctx: AppContext, cwd: string): string | null {
  let path: string;
  try { path = realpathSync(cwd); } catch { return null; }
  const existing = resolveProject(ctx, ctx.config.deviceId, path);
  if (existing.state === 'unassigned' && existing.reason === 'paused') return null;
  const workspace = workspaces(ctx).sort((a, b) => b.length - a.length).find((root) => inside(root, path));
  if (!workspace) return existing.state === 'matched' ? existing.projectId : null;
  if (path === workspace) return existing.state === 'matched' ? existing.projectId : null;
  if (!captureDecision({ projectName: 'authorized', deviceId: ctx.config.deviceId, path: workspace }, path, defaultPolicy).metadata) return null;
  let root: string;
  try { root = realpathSync(gitRead(path, ['rev-parse', '--show-toplevel'])); }
  catch { root = join(workspace, relative(workspace, path).split('/')[0]!); }
  if (!inside(workspace, root)) root = join(workspace, relative(workspace, path).split('/')[0]!);
  if (existing.state === 'matched') {
    const matchedRoot = ctx.db.get<{ path: string }>('SELECT path FROM project_roots WHERE id = ?', existing.rootId)?.path;
    if (matchedRoot === root || (matchedRoot && inside(root, matchedRoot))) return existing.projectId;
  }
  return registerProjectRoot(ctx, { projectName: basename(root).slice(0, 160), path: root, deviceId: ctx.config.deviceId });
}
