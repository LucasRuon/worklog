import { assertRecord, exactKeys, uuid, DomainError, type AppContext } from './contracts.js';
import { publishCaptureManifest } from '../collectors/source-config.js';
import { stableId } from './policy.js';

export interface OperatingConfig { revision: number; humanWindowMs: number; idleMs: number; retentionDays: number; syncIntervalMs: number; storageBudgetBytes: number; excludedPaths: string[]; captureTaskTitles: boolean }
export function operatingConfig(ctx: AppContext): OperatingConfig {
  const saved = JSON.parse(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'operatingConfig'")!.value) as Omit<OperatingConfig, 'revision' | 'humanWindowMs'>;
  return { ...saved, captureTaskTitles: saved.captureTaskTitles === true, revision: Number(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'configRevision'")!.value), humanWindowMs: Number(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'humanWindowMs'")!.value) };
}
export function safetyChanged(ctx: AppContext) { ctx.db.run("UPDATE settings SET value = cast(cast(value AS INTEGER) + 1 AS TEXT) WHERE key = 'reportSafetyRevision'"); }
export function configure(ctx: AppContext, input: Partial<Omit<OperatingConfig, 'revision'>> & { revision: number }): OperatingConfig {
  assertRecord(input); exactKeys(input, ['revision'], ['idleMs', 'retentionDays', 'syncIntervalMs', 'storageBudgetBytes', 'excludedPaths', 'humanWindowMs', 'captureTaskTitles']);
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new DomainError('INVALID_CONFIGURATION');
  ctx.db.transaction(() => {
    const previous = operatingConfig(ctx); if (input.revision !== previous.revision) throw new DomainError('CONFIG_CHANGED', 409);
    const value = { ...previous, ...input };
    const validInt = (v: number, min: number, max: number) => Number.isSafeInteger(v) && v >= min && v <= max;
    if (typeof value.captureTaskTitles !== 'boolean') throw new DomainError('INVALID_CONFIGURATION');
    if (!validInt(value.idleMs, 60000, 3600000) || !validInt(value.humanWindowMs, 60000, 3600000) || !validInt(value.retentionDays, 1, 365) || !validInt(value.syncIntervalMs, 1000, 300000) || !validInt(value.storageBudgetBytes, 1048576, 1099511627776) || !Array.isArray(value.excludedPaths) || value.excludedPaths.length > 100 || value.excludedPaths.some((path) => typeof path !== 'string' || !path || path.length > 4096 || path.startsWith('/') || /[\x00-\x1f\\]/.test(path) || path.split('/').some((part) => part === '..' || part === '.' || !part))) throw new DomainError('INVALID_CONFIGURATION');
    const { revision: _, humanWindowMs, ...stored } = value;
    ctx.db.run("UPDATE settings SET value = ? WHERE key = 'operatingConfig'", JSON.stringify(stored));
    ctx.db.run("UPDATE settings SET value = ? WHERE key = 'humanWindowMs'", String(humanWindowMs));
    ctx.db.run("UPDATE settings SET value = ? WHERE key = 'configRevision'", String(previous.revision + 1));
    ctx.db.run("UPDATE settings SET value = '-1' WHERE key = 'intervalProjection'"); safetyChanged(ctx);
    ctx.db.run("UPDATE tracked_files SET fingerprint = ''");
  });
  publishCaptureManifest(ctx); return operatingConfig(ctx);
}
export function setRootEnabled(ctx: AppContext, rootId: string, enabled: boolean) {
  uuid(rootId); if (typeof enabled !== 'boolean') throw new DomainError('INVALID_ROOT');
  ctx.db.transaction(() => {
    if (!ctx.db.get('SELECT id FROM project_roots WHERE id = ?', rootId)) throw new DomainError('ROOT_NOT_FOUND', 404);
    ctx.db.run('INSERT INTO root_controls VALUES (?, ?) ON CONFLICT(root_id) DO UPDATE SET enabled = excluded.enabled', rootId, Number(enabled));
    ctx.db.run('UPDATE project_roots SET enabled = ? WHERE id = ?', Number(enabled), rootId); safetyChanged(ctx);
  }); publishCaptureManifest(ctx);
}
export function captureBudgetReached(ctx: AppContext, additional: number) {
  const pages = ctx.db.get<{ page_count: number }>('PRAGMA page_count')!.page_count; const size = ctx.db.get<{ page_size: number }>('PRAGMA page_size')!.page_size;
  return pages * size + additional > operatingConfig(ctx).storageBudgetBytes;
}
export function collectionEnabled(ctx: AppContext, tool: 'focus' | 'files') {
  const row = ctx.db.get<{ enabled: number; local_enabled: number | null; removed_at: string | null }>('SELECT s.enabled, c.enabled AS local_enabled, c.removed_at FROM sources s LEFT JOIN source_controls c ON c.source_id = s.id WHERE s.id = ?', stableId(ctx.config.installationId, tool));
  return !row || !!row.enabled && row.local_enabled !== 0 && !row.removed_at;
}
