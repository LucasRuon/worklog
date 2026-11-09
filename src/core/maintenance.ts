import { createHash } from 'node:crypto';
import { constants, createReadStream, existsSync, lstatSync, openSync, readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { assertRecord, exactKeys, DomainError, utc, uuid, type AppContext } from './contracts.js';
import { validateEvent } from './events.js';
import { inside, openStore } from './context.js';
import { openReadonlyDatabase } from './sqlite.js';
import { atomicPrivate, readPrivate } from './private-files.js';
import { operatingConfig, safetyChanged } from './configuration.js';
import { canonicalPath, listProjects } from './projects.js';
import { publishCaptureManifest } from '../collectors/source-config.js';
import { serviceStatus } from '../cli/service.js';
import { stableId } from './policy.js';

export function storageUsage(ctx: AppContext) {
  let bytes = 0; let files = 0; let partial = false;
  function walk(path: string, depth: number) {
    if (depth > 4 || files > 10000) { partial = true; return; }
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const name = join(path, item.name); if (item.isSymbolicLink()) continue;
      try { if (item.isDirectory()) walk(name, depth + 1); else if (item.isFile()) { bytes += statSync(name).size; files++; } } catch { partial = true; }
    }
  }
  try { walk(ctx.config.dataDir, 0); } catch { partial = true; }
  const databaseBytes = ctx.db.get<{ page_count: number }>('PRAGMA page_count')!.page_count * ctx.db.get<{ page_size: number }>('PRAGMA page_size')!.page_size;
  const budgetBytes = operatingConfig(ctx).storageBudgetBytes;
  return { bytes, databaseBytes, budgetBytes, files, partial, status: bytes >= budgetBytes ? 'limit' : bytes >= budgetBytes * .8 ? 'warning' : 'ok', policy: 'content-paused-at-budget; metadata-and-events-preserved' };
}
function counts(db: Pick<AppContext['db'], 'get'>) {
  return Object.fromEntries(['events', 'sessions', 'file_revisions', 'file_contents', 'time_adjustments', 'note_versions'].map((table) => [table, db.get<{ n: number }>(`SELECT count(*) n FROM ${table}`)!.n]));
}
function safeDestination(path: string) { if (!isAbsolute(path) || /[\x00-\x1f]/.test(path)) throw new DomainError('MAINTENANCE_PATH_INVALID'); return resolve(path); }
async function digest(path: string) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path, { fd: openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), autoClose: true })) hash.update(chunk); return hash.digest('hex'); }
interface PendingFile { path: string; sha256: string }
function validatePending(raw: string, queue: boolean) {
  const value: unknown = JSON.parse(raw);
  if (queue) {
    assertRecord(value); exactKeys(value, ['schemaVersion', 'events'], ['roots']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.events) || !value.events.length || value.events.length > 4) throw new DomainError('BACKUP_PENDING_INVALID');
    value.events.forEach((event) => validateEvent(event));
    if (value.roots !== undefined) {
      if (!Array.isArray(value.roots) || value.roots.length > 4) throw new DomainError('BACKUP_PENDING_INVALID');
      for (const root of value.roots) {
        assertRecord(root); exactKeys(root, ['projectName', 'path', 'deviceId', 'workspace'], ['remote']); uuid(root.deviceId);
        if (typeof root.projectName !== 'string' || !root.projectName || root.projectName.length > 160 || /[\x00-\x1f]/.test(root.projectName)) throw new DomainError('BACKUP_PENDING_INVALID');
        for (const key of ['path', 'workspace']) if (typeof root[key] !== 'string' || !isAbsolute(root[key]) || root[key].length > 4096 || /[\x00-\x1f]/.test(root[key])) throw new DomainError('BACKUP_PENDING_INVALID');
        if (!inside(root.workspace as string, root.path as string)) throw new DomainError('BACKUP_PENDING_INVALID');
        if (root.remote !== undefined) {
          if (typeof root.remote !== 'string' || root.remote.length > 4096) throw new DomainError('BACKUP_PENDING_INVALID');
          const url = new URL(root.remote); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new DomainError('BACKUP_PENDING_INVALID');
        }
      }
    }
  } else {
    if (!Array.isArray(value) || !value.length || value.length > 4) throw new DomainError('BACKUP_PENDING_INVALID');
    value.forEach((event) => validateEvent(event));
  }
}
async function copyPending(source: string, destination: string, directory: 'queue' | 'codex-receipts'): Promise<PendingFile[]> {
  const base = join(source, directory); let names: string[];
  try { if (!lstatSync(base).isDirectory()) throw new DomainError('BACKUP_PENDING_INVALID'); names = readdirSync(base); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const pattern = directory === 'queue' ? /^\d+-\d+-[a-f0-9-]+\.json$/ : /^[a-f0-9-]{36}\.json$/;
  names = names.filter((name) => pattern.test(name)); if (names.length > 10000) throw new DomainError('BACKUP_PENDING_LIMIT');
  const result: PendingFile[] = [];
  if (names.length) await mkdir(join(destination, directory), { mode: 0o700 });
  for (const name of names) {
    let raw: string;
    try { raw = readPrivate(join(base, name), 128 * 1024); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    validatePending(raw, directory === 'queue');
    atomicPrivate(join(destination, directory, name), raw); result.push({ path: `${directory}/${name}`, sha256: createHash('sha256').update(raw).digest('hex') });
  }
  return result;
}
export async function backupData(ctx: AppContext, destination: string) {
  destination = safeDestination(destination);
  if (inside(ctx.config.dataDir, destination) || listProjects(ctx).some((p) => p.roots.some((r) => r.deviceId === ctx.config.deviceId && inside(r.path, destination)))) throw new DomainError('BACKUP_ROOT_OVERLAP');
  let owned = false;
  try {
    destination = canonicalPath(destination);
    if (inside(ctx.config.dataDir, destination) || listProjects(ctx).some((p) => p.roots.some((r) => r.deviceId === ctx.config.deviceId && inside(r.path, destination)))) throw new DomainError('BACKUP_ROOT_OVERLAP');
    await mkdir(destination, { mode: 0o700 }); owned = true;
    // Copy durable queue first: if a file disappears during the copy it was already
    // committed by the drainer, so the subsequent SQLite snapshot includes it.
    const pending = await copyPending(ctx.config.dataDir, destination, 'queue');
    const path = join(destination, 'worklog.sqlite'); await ctx.db.backup(path);
    // Receipts are immutable and precede append; after SQLite they cover every
    // callback represented in the snapshot and preserve replay timestamps.
    pending.push(...await copyPending(ctx.config.dataDir, destination, 'codex-receipts'));
    const db = openReadonlyDatabase(path); let manifest: object;
    try { manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), installationId: db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'installationId'")!.value, deviceId: ctx.config.deviceId, sourceDataDir: ctx.config.dataDir, sha256: await digest(path), counts: counts(db), pending }; }
    finally { db.close(); }
    atomicPrivate(join(destination, 'manifest.json'), JSON.stringify(manifest));
    // SQLite backup may create a default-mode file; enforce the private destination mode.
    const { chmod } = await import('node:fs/promises'); await chmod(path, 0o600);
    return { code: 'BACKUP_OK', status: 'ok' as const, message: 'Backup consistente concluído e verificado.' };
  } catch (error) {
    if (owned) await rm(destination, { recursive: true, force: true });
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DomainError('BACKUP_TARGET_OCCUPIED', 409);
    throw error instanceof DomainError ? error : new DomainError((error as NodeJS.ErrnoException).code === 'ENOSPC' ? 'BACKUP_DISK_FULL' : (error as NodeJS.ErrnoException).code === 'EACCES' ? 'BACKUP_PERMISSION_DENIED' : 'BACKUP_IO_FAILED', 503);
  }
}
export async function restoreData(options: { backup: string; dataDir: string }) {
  let target = safeDestination(options.dataDir); const backup = safeDestination(options.backup);
  if (existsSync(target)) throw new DomainError('RESTORE_TARGET_OCCUPIED', 409);
  if ((await serviceStatus(target)).running) throw new DomainError('SERVICE_MUST_STOP', 409);
  let owned = false; let ctx: AppContext | undefined;
  try {
    target = canonicalPath(target);
    if (!lstatSync(backup).isDirectory() || !lstatSync(join(backup, 'worklog.sqlite')).isFile()) throw new DomainError('BACKUP_INTEGRITY_FAILED');
    const manifest: unknown = JSON.parse(readPrivate(join(backup, 'manifest.json'), 8 * 1024 * 1024)); assertRecord(manifest);
    if (manifest.schemaVersion !== 1 || typeof manifest.sha256 !== 'string' || typeof manifest.sourceDataDir !== 'string' || !isAbsolute(manifest.sourceDataDir)) throw new DomainError('BACKUP_INTEGRITY_FAILED');
    const sourcePath = join(backup, 'worklog.sqlite');
    if (await digest(sourcePath) !== manifest.sha256) throw new DomainError('BACKUP_INTEGRITY_FAILED');
    const check = openReadonlyDatabase(sourcePath);
    try {
      if (JSON.stringify(counts(check)) !== JSON.stringify(manifest.counts)) throw new DomainError('BACKUP_INTEGRITY_FAILED');
      if (check.get<{ value: string }>("SELECT value FROM settings WHERE key = 'deviceId'")?.value !== manifest.deviceId || check.get<{ value: string }>("SELECT value FROM settings WHERE key = 'installationId'")?.value !== manifest.installationId) throw new DomainError('BACKUP_INTEGRITY_FAILED');
      for (const root of check.all<{ path: string; device_id: string }>('SELECT path, device_id FROM project_roots')) if (root.device_id === manifest.deviceId && (inside(root.path, target) || inside(target, root.path))) throw new DomainError('RESTORE_ROOT_OVERLAP');
    } finally { check.close(); }
    await mkdir(target, { mode: 0o700 }); owned = true; atomicPrivate(join(target, 'restore-in-progress'), 'Worklog restore in progress');
    const stage = join(target, 'staging'); await mkdir(stage, { mode: 0o700 }); const path = join(stage, 'worklog.sqlite');
    await copyFile(sourcePath, path, constants.COPYFILE_EXCL);
    if (await digest(path) !== manifest.sha256) throw new DomainError('BACKUP_INTEGRITY_FAILED');
    ctx = await openStore(stage);
    if (ctx.config.installationId !== manifest.installationId) throw new DomainError('BACKUP_INTEGRITY_FAILED');
    for (const source of ctx.db.all<{ id: string; tool: 'focus' | 'files'; config_path: string }>("SELECT id, tool, config_path FROM sources WHERE tool IN ('focus','files') AND installation_id = ?", ctx.config.installationId)) {
      if (source.id !== stableId(ctx.config.installationId, source.tool)) continue;
      const suffix = source.tool === 'files' ? 'file-observer' : '';
      if (source.config_path !== join(manifest.sourceDataDir, suffix)) throw new DomainError('BACKUP_INTEGRITY_FAILED');
      ctx.db.run('UPDATE sources SET config_path = ? WHERE id = ?', join(target, suffix), source.id);
    }
    ctx.db.exec('UPDATE file_scans SET owner = NULL, lease_ms = 0');
    ctx.db.run("UPDATE settings SET value = '-1' WHERE key = 'intervalProjection'"); publishCaptureManifest(ctx);
    await ctx.shutdown(); ctx = undefined;
    await rename(path, join(target, 'worklog.sqlite'));
    atomicPrivate(join(target, 'capture.json'), readPrivate(join(stage, 'capture.json')));
    if (manifest.pending !== undefined) {
      if (!Array.isArray(manifest.pending) || manifest.pending.length > 20000) throw new DomainError('BACKUP_INTEGRITY_FAILED');
      for (const item of manifest.pending) {
        assertRecord(item); exactKeys(item, ['path', 'sha256']);
        if (typeof item.path !== 'string' || !/^(?:queue\/\d+-\d+-[a-f0-9-]+\.json|codex-receipts\/[a-f0-9-]{36}\.json)$/.test(item.path)) throw new DomainError('BACKUP_INTEGRITY_FAILED');
        const raw = readPrivate(join(backup, item.path), 128 * 1024);
        if (createHash('sha256').update(raw).digest('hex') !== item.sha256) throw new DomainError('BACKUP_INTEGRITY_FAILED');
        validatePending(raw, item.path.startsWith('queue/'));
        await mkdir(join(target, item.path.split('/')[0]!), { recursive: true, mode: 0o700 }); atomicPrivate(join(target, item.path), raw);
      }
    }
    await rm(stage, { recursive: true, force: true }); await unlink(join(target, 'restore-in-progress'));
    return { code: 'RESTORE_OK', status: 'ok' as const, message: 'Restaurado em destino novo. Reconfigure os serviços/hooks para esse destino antes de retomar a coleta.' };
  } catch (error) {
    await ctx?.shutdown(); if (owned) await rm(target, { recursive: true, force: true });
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DomainError('RESTORE_TARGET_OCCUPIED', 409);
    throw error instanceof DomainError ? error : new DomainError('RESTORE_IO_FAILED', 503);
  }
}
export function runRetention(ctx: AppContext, now: string) {
  utc(now); const cutoff = new Date(Date.parse(now) - operatingConfig(ctx).retentionDays * 86400000).toISOString();
  const result = ctx.db.transaction(() => {
    const deleted = ctx.db.run('DELETE FROM file_contents WHERE sha256 NOT IN (SELECT sha256 FROM file_revisions WHERE occurred_at >= ? AND sha256 IS NOT NULL) AND sha256 NOT IN (SELECT v.sha256 FROM file_revisions v WHERE v.sha256 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM file_revisions newer WHERE newer.root_id = v.root_id AND newer.file_id = v.file_id AND (newer.occurred_at > v.occurred_at OR (newer.occurred_at = v.occurred_at AND newer.rowid > v.rowid))))', cutoff);
    ctx.db.run("INSERT INTO settings VALUES ('lastRetentionAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", now);
    if (deleted.changes) safetyChanged(ctx);
    return Number(deleted.changes);
  });
  return { code: 'RETENTION_OK', status: 'ok' as const, message: 'Conteúdo intermediário antigo removido; metadados, eventos e cursores preservados.', deletedContents: result, cutoff };
}
export function scheduledRetention(ctx: AppContext) {
  const last = ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'lastRetentionAt'")?.value;
  if (!last || Date.now() - Date.parse(last) >= 86400000) return runRetention(ctx, new Date().toISOString());
}
