import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, watch, type FSWatcher } from 'node:fs';
import { join, relative } from 'node:path';
import { DomainError, type AppContext, type FileRevision, type FileScan, type ProjectRoot, type ReportFilter } from '../core/contracts.js';
import { inside } from '../core/context.js';
import { listProjects } from '../core/projects.js';
import { captureDecision, gitPathAllowed, policyFor } from '../core/policy.js';
import { selectedProjects } from '../core/filters.js';
import { setFileAccess, storeRevision } from './revisions.js';
import { collectionEnabled } from '../core/configuration.js';

interface Tracked { path: string; file_id: string; revision_id: string; identity: string | null; fingerprint: string }
interface Candidate { path: string; size: number; identity: string | null; fingerprint: string }
function localRoot(ctx: AppContext, id: string | undefined) {
  const root = listProjects(ctx).flatMap((p) => p.roots).find((r) => r.id === id && r.enabled && r.deviceId === ctx.config.deviceId);
  if (!root) throw new DomainError('FILE_ROOT_UNAVAILABLE'); return root;
}
function git(root: string, args: string[], input?: string) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { encoding: 'utf8', input, timeout: 15_000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}
function inventory(ctx: AppContext, root: ProjectRoot, nested: ProjectRoot[]): { candidates: Candidate[]; ignored: Set<string> } {
  try { if (realpathSync(root.path) !== root.path || !lstatSync(root.path).isDirectory()) throw new DomainError('FILE_ROOT_CHANGED'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new DomainError('FILE_ROOT_UNAVAILABLE'); throw error; }
  let hasGit = false;
  try { hasGit = git(root.path, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'; }
  catch { if (root.repositoryId) throw new DomainError('FILE_GIT_UNAVAILABLE'); }
  let names: string[] = [];
  if (hasGit) names = [...new Set(git(root.path, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
  else {
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = relative(root.path, join(directory, entry.name));
        if (!gitPathAllowed(path, policyFor(ctx)) || /[\x00-\x1f]/.test(path) || entry.isSymbolicLink() || nested.some((r) => inside(r.path, join(root.path, path)))) continue;
        if (entry.isDirectory()) walk(join(directory, entry.name));
        else if (entry.isFile()) names.push(path);
        if (names.length > 25_000) throw new DomainError('FILE_SCAN_LIMIT');
      }
    }; walk(root.path);
  }
  if (names.length > 25_000) throw new DomainError('FILE_SCAN_LIMIT');
  names = names.filter((name) => gitPathAllowed(name, policyFor(ctx)) && !/[\x00-\x1f]/.test(name) && !nested.some((r) => inside(r.path, join(root.path, name))));
  const ignored = new Set<string>();
  if (hasGit && names.length) {
    try { git(root.path, ['check-ignore', '--no-index', '-z', '--stdin'], `${names.join('\0')}\0`).split('\0').filter(Boolean).forEach((name) => ignored.add(name)); }
    catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
  }
  const candidates: Candidate[] = [];
  for (const path of names) {
    if (ignored.has(path)) continue;
    const full = join(root.path, path);
    let info;
    try { info = lstatSync(full, { bigint: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || !inside(root.path, realpathSync(full))) continue;
    if (!captureDecision(root, path, policyFor(ctx), { gitChecked: true }).metadata) continue;
    candidates.push({ path, size: Number(info.size), identity: info.birthtimeNs > 0 ? `${info.dev}:${info.ino}:${info.birthtimeNs}` : null, fingerprint: `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}` });
  }
  return { candidates, ignored };
}
function readCandidate(ctx: AppContext, root: ProjectRoot, candidate: Candidate): Pick<FileRevision, 'content' | 'sha256' | 'unavailableReason'> {
  const decision = captureDecision(root, candidate.path, policyFor(ctx));
  if (!decision.metadata) throw new DomainError('FILE_POLICY_CHANGED');
  if (candidate.size > 2 * 1024 * 1024) return { sha256: null, unavailableReason: 'too-large' };
  const full = join(root.path, candidate.path); const descriptor = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (`${before.dev}:${before.ino}:${before.size}:${before.mtimeNs}:${before.ctimeNs}` !== candidate.fingerprint || !inside(root.path, realpathSync(full))) throw new DomainError('FILE_CHANGED_DURING_READ');
    const buffer = Buffer.alloc(candidate.size + 1); let length = 0;
    while (length < buffer.length) { const read = readSync(descriptor, buffer, length, buffer.length - length, null); if (!read) break; length += read; }
    const bytes = buffer.subarray(0, length);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(full, { bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.size !== after.size || current.dev !== after.dev || current.ino !== after.ino || current.mtimeNs !== after.mtimeNs || bytes.length !== candidate.size || !captureDecision(root, candidate.path, policyFor(ctx)).metadata || !inside(root.path, realpathSync(full))) throw new DomainError('FILE_CHANGED_DURING_READ');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || decision.reason === 'binary') return { sha256, unavailableReason: 'binary' };
    try { return { sha256, content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), unavailableReason: null }; }
    catch { return { sha256, unavailableReason: 'invalid-utf8' }; }
  } finally { closeSync(descriptor); }
}
function gap(ctx: AppContext, rootId: string, error: string) {
  ctx.db.run('INSERT INTO file_scans(root_id, error, last_gap_at) VALUES (?, ?, ?) ON CONFLICT(root_id) DO UPDATE SET error = excluded.error, last_gap_at = excluded.last_gap_at', rootId, error, new Date().toISOString());
}

export async function reconcileRoot(ctx: AppContext, input: ProjectRoot, observation: 'watch' | 'reconciliation' = 'reconciliation'): Promise<void> {
  if (!collectionEnabled(ctx, 'files')) throw new DomainError('SOURCE_PAUSED', 409);
  const root = localRoot(ctx, input.id);
  try {
    const scan = ctx.db.get<{ baselined: number }>('SELECT baselined FROM file_scans WHERE root_id = ?', root.id!);
    const nested = listProjects(ctx).flatMap((p) => p.roots).filter((r) => r.deviceId === root.deviceId && r.path !== root.path && inside(root.path, r.path));
    const { candidates } = inventory(ctx, root, nested);
    const names = new Set(candidates.map((c) => c.path));
    const previous = ctx.db.all<Tracked>('SELECT * FROM tracked_files WHERE root_id = ?', root.id!);
    const removed = new Map(previous.filter((p) => !names.has(p.path)).map((p) => [p.path, p]));
    const identityCounts = new Map<string, number>();
    for (const c of candidates) if (c.identity) identityCounts.set(c.identity, (identityCounts.get(c.identity) ?? 0) + 1);
    const removedIdentities = new Map<string, Tracked[]>();
    for (const old of removed.values()) if (old.identity) removedIdentities.set(old.identity, [...(removedIdentities.get(old.identity) ?? []), old]);
    const at = new Date().toISOString(); const deadline = Date.now() + 10_000; let bytesRead = 0; let pending = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline) { pending = true; break; }
      let old = ctx.db.get<Tracked>('SELECT * FROM tracked_files WHERE root_id = ? AND path = ?', root.id!, candidate.path);
      let previousPath: string | null = null;
      if (!old && candidate.identity && identityCounts.get(candidate.identity) === 1) {
        const matching = (removedIdentities.get(candidate.identity) ?? []).filter((p) => removed.has(p.path) && captureDecision(root, p.path, policyFor(ctx)).metadata);
        if (matching.length === 1) { old = matching[0]; previousPath = old!.path; removed.delete(old!.path); }
      }
      if (old?.fingerprint === candidate.fingerprint && !previousPath) { ctx.db.transaction(() => setFileAccess(ctx, root.id!, candidate.path, true)); continue; }
      if (bytesRead + Math.min(candidate.size, 2 * 1024 * 1024) > 32 * 1024 * 1024) { pending = true; continue; }
      const captured = readCandidate(ctx, root, candidate); bytesRead += Math.min(candidate.size, 2 * 1024 * 1024);
      const prior = old ? ctx.db.get<{ sha256: string | null; document: string }>('SELECT sha256, document FROM file_revisions WHERE id = ?', old.revision_id) : undefined;
      const same = prior && captured.sha256 !== null && prior.sha256 === captured.sha256 && (JSON.parse(prior.document) as FileRevision).unavailableReason === captured.unavailableReason;
      const update = (revisionId: string, fileId: string) => {
        if (previousPath) ctx.db.run('DELETE FROM tracked_files WHERE root_id = ? AND path = ?', root.id!, previousPath);
        ctx.db.run('INSERT INTO tracked_files VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(root_id, path) DO UPDATE SET file_id = excluded.file_id, revision_id = excluded.revision_id, identity = excluded.identity, fingerprint = excluded.fingerprint', root.id!, candidate.path, fileId, revisionId, candidate.identity, candidate.fingerprint);
      };
      if (same && !previousPath) { update(old!.revision_id, old!.file_id); continue; }
      const revision: FileRevision = { id: randomUUID(), rootId: root.id!, fileId: old?.file_id ?? randomUUID(), path: candidate.path, occurredAt: at, operation: previousPath ? 'rename' : old ? 'edit' : scan?.baselined ? 'create' : 'baseline', observation: !old && !scan?.baselined ? 'baseline' : observation, previousPath, previousRevisionId: old?.revision_id ?? null, size: candidate.size, ...captured };
      storeRevision(ctx, revision, () => update(revision.id, revision.fileId));
    }
    for (const old of pending ? [] : removed.values()) {
      if (nested.some((r) => inside(r.path, join(root.path, old.path))) || !captureDecision(root, old.path, policyFor(ctx)).metadata) {
        ctx.db.transaction(() => { setFileAccess(ctx, root.id!, old.path, false); ctx.db.run('DELETE FROM tracked_files WHERE root_id = ? AND path = ?', root.id!, old.path); }); continue;
      }
      const revision: FileRevision = { id: randomUUID(), rootId: root.id!, fileId: old.file_id, path: old.path, occurredAt: at, operation: 'delete', observation, previousPath: null, previousRevisionId: old.revision_id, size: 0, sha256: null, unavailableReason: 'deleted' };
      storeRevision(ctx, revision, () => { ctx.db.run('DELETE FROM tracked_files WHERE root_id = ? AND path = ?', root.id!, old.path); });
    }
    ctx.db.run('INSERT INTO file_scans(root_id, scanned_at, monitoring_since, baselined, pending) VALUES (?, ?, ?, ?, ?) ON CONFLICT(root_id) DO UPDATE SET scanned_at = excluded.scanned_at, monitoring_since = COALESCE(file_scans.monitoring_since, excluded.monitoring_since), baselined = max(file_scans.baselined, excluded.baselined), pending = excluded.pending, error = NULL', root.id!, at, at, Number(!pending), Number(pending));
  } catch (error) { const code = error instanceof DomainError ? error.code : 'FILE_SCAN_FAILED'; gap(ctx, root.id!, code); throw new DomainError(code, 503); }
}

export async function watchRoot(ctx: AppContext, input: ProjectRoot, owner?: string): Promise<() => Promise<void>> {
  const root = localRoot(ctx, input.id); let watcher: FSWatcher | undefined; let timer: ReturnType<typeof setTimeout> | undefined; let stopped = false;
  const previous = ctx.db.get<{ scanned_at: string | null }>('SELECT scanned_at FROM file_scans WHERE root_id = ?', root.id!);
  if (previous?.scanned_at && Date.now() - Date.parse(previous.scanned_at) > 30_000) gap(ctx, root.id!, 'FILE_OBSERVATION_GAP');
  const owns = () => !owner || ctx.db.get<{ owner: string | null }>('SELECT owner FROM file_scans WHERE root_id = ?', root.id!)?.owner === owner;
  await reconcileRoot(ctx, root);
  const reconcile = () => { if (!stopped && owns()) { if (owner) ctx.db.run('UPDATE file_scans SET lease_ms = ? WHERE root_id = ? AND owner = ?', Date.now() + 120_000, root.id!, owner); void reconcileRoot(ctx, root).catch(() => {}); } };
  const startWatcher = () => {
    if (stopped || watcher) return;
    try {
      watcher = watch(root.path, { recursive: true, persistent: false }, (_event, filename) => {
        if (!owns()) return;
        if (filename && !gitPathAllowed(String(filename), policyFor(ctx))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { if (!stopped && owns()) void reconcileRoot(ctx, root, 'watch').catch(() => {}); }, 500); timer.unref();
      });
      watcher.on('error', () => { watcher?.close(); watcher = undefined; if (!stopped) gap(ctx, root.id!, 'FILE_WATCHER_GAP'); });
    } catch { gap(ctx, root.id!, 'FILE_WATCHER_UNAVAILABLE'); }
  };
  startWatcher();
  const interval = setInterval(() => { reconcile(); startWatcher(); }, 30_000); interval.unref();
  return async () => { stopped = true; watcher?.close(); clearInterval(interval); if (timer) clearTimeout(timer); if (owns()) { try { await reconcileRoot(ctx, root); } catch { /* Diagnóstico persistido. */ } gap(ctx, root.id!, 'FILE_OBSERVER_STOPPED'); } };
}

interface Manager { owner: string; roots: Map<string, () => Promise<void>>; stopped: boolean; task?: Promise<void> }
const managers = new WeakMap<AppContext, Manager>();
export async function pollFiles(ctx: AppContext) {
  let manager = managers.get(ctx);
  if (!manager) { manager = { owner: randomUUID(), roots: new Map(), stopped: false }; managers.set(ctx, manager); }
  if (manager.stopped) return;
  if (manager.task) return manager.task;
  const current = manager;
  return current.task = (async () => {
   const roots = collectionEnabled(ctx, 'files') ? listProjects(ctx).flatMap((p) => p.roots).filter((r) => r.enabled && r.deviceId === ctx.config.deviceId) : [];
  for (const [id, stop] of current.roots) if (!roots.some((r) => r.id === id)) { await stop(); current.roots.delete(id); }
  for (const root of roots) {
    if (current.stopped) break;
    ctx.db.run('INSERT OR IGNORE INTO file_scans(root_id) VALUES (?)', root.id!);
    const lease = ctx.db.run('UPDATE file_scans SET owner = ?, lease_ms = ? WHERE root_id = ? AND (owner = ? OR lease_ms <= ?)', current.owner, Date.now() + 120_000, root.id!, current.owner, Date.now());
    if (!lease.changes) { const stop = current.roots.get(root.id!); if (stop) { await stop(); current.roots.delete(root.id!); } continue; }
    if (!current.roots.has(root.id!)) {
      const status = ctx.db.get<{ error: string | null; last_gap_at: string | null }>('SELECT error, last_gap_at FROM file_scans WHERE root_id = ?', root.id!);
      if (status?.error && /^(FILE_ROOT|FILE_SCAN|FILE_GIT)/.test(status.error) && status.last_gap_at && Date.now() - Date.parse(status.last_gap_at) < 30_000) continue;
      try { current.roots.set(root.id!, await watchRoot(ctx, root, current.owner)); } catch { /* Nova tentativa no próximo tick. */ }
    }
  }
  })().finally(() => { current.task = undefined; });
}
export async function stopFiles(ctx: AppContext) {
  const manager = managers.get(ctx); if (!manager) return; manager.stopped = true;
  await manager.task?.catch(() => {});
  await Promise.allSettled([...manager.roots.values()].map((stop) => stop())); manager.roots.clear();
  ctx.db.run('UPDATE file_scans SET owner = NULL, lease_ms = 0 WHERE owner = ?', manager.owner);
}
export function fileScans(ctx: AppContext, filter: ReportFilter): FileScan[] {
  const projects = selectedProjects(ctx, filter);
  return listProjects(ctx).filter((p) => projects.has(p.id)).flatMap((p) => p.roots.filter((r) => r.enabled && (!filter.deviceIds?.length || filter.deviceIds.includes(r.deviceId))).map((root) => {
    const scan = ctx.db.get<{ scanned_at: string | null; monitoring_since: string | null; error: string | null; last_gap_at: string | null; pending: number }>('SELECT * FROM file_scans WHERE root_id = ?', root.id!);
    const remote = root.deviceId !== ctx.config.deviceId ? ctx.db.get<{ error: string | null }>('SELECT s.error FROM file_remote_sync s JOIN installations i ON i.id = s.installation_id WHERE i.device_id = ? AND s.error IS NOT NULL LIMIT 1', root.deviceId) : undefined;
    return { rootId: root.id!, projectId: p.id, deviceId: root.deviceId, path: root.path, scannedAt: scan?.scanned_at ?? null, monitoringSince: scan?.monitoring_since ?? null, error: remote?.error ?? scan?.error ?? (!scan && root.deviceId !== ctx.config.deviceId ? 'FILES_REMOTE_UNAVAILABLE' : null), lastGapAt: scan?.last_gap_at ?? null, pending: Boolean(scan?.pending) };
  }));
}
