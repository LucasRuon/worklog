import { isAbsolute, join } from 'node:path';
import { atomicPrivate } from '../core/private-files.js';
import { assertRecord, exactKeys, uuid, tools, DomainError, type AppContext, type SourceRegistration, type Diagnostic } from '../core/contracts.js';
import { sourceStatuses } from './source-status.js';
import { policyFor } from '../core/policy.js';

export function registerSource(ctx: AppContext, source: SourceRegistration): string {
  assertRecord(source); exactKeys(source, ['id', 'deviceId', 'installationId', 'tool', 'profile', 'configPath', 'version', 'enabled']);
  for (const id of [source.id, source.deviceId, source.installationId]) uuid(id);
  if (!tools.includes(source.tool) || typeof source.enabled !== 'boolean' || typeof source.configPath !== 'string' || !isAbsolute(source.configPath) || source.configPath.length > 4096 || /[\x00-\x1f]/.test(source.configPath) || [source.profile, source.version].some((value) => typeof value !== 'string' || !/^[A-Za-z0-9_. -]{1,120}$/.test(value))) throw new DomainError('INVALID_SOURCE');
  const installation = ctx.db.get<{ device_id: string }>('SELECT device_id FROM installations WHERE id = ?', source.installationId);
  if (installation?.device_id !== source.deviceId) throw new DomainError('SOURCE_MISMATCH');
  const previous = ctx.db.get<{ installation_id: string; tool: string; config_path: string }>('SELECT installation_id, tool, config_path FROM sources WHERE id = ?', source.id);
  if (previous && (previous.installation_id !== source.installationId || previous.tool !== source.tool || previous.config_path !== source.configPath)) throw new DomainError('SOURCE_IDENTITY_CONFLICT', 409);
  ctx.db.run('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET profile = excluded.profile, version = excluded.version, enabled = excluded.enabled', source.id, source.installationId, source.deviceId, source.tool, source.profile, source.configPath, source.version, Number(source.enabled));
  publishCaptureManifest(ctx);
  return source.id;
}

export function publishCaptureManifest(ctx: AppContext) {
  const roots = ctx.db.all<{ id: string; project_id: string; device_id: string; path: string; enabled: number }>('SELECT id, project_id, device_id, path, enabled FROM project_roots');
  const workspaces: unknown = JSON.parse(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'autoWorkspaces'")?.value ?? '[]');
  // Opt-in lido pelo hook: sem ele, nenhum título de task sai da máquina de origem para a fila.
  let taskTitles = false;
  try { taskTitles = (JSON.parse(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'operatingConfig'")?.value ?? '{}') as { captureTaskTitles?: unknown }).captureTaskTitles === true; } catch { /* Configuração ilegível mantém a captura desligada. */ }
  atomicPrivate(join(ctx.config.dataDir, 'capture.json'), JSON.stringify({ schemaVersion: 1, policy: policyFor(ctx), sources: listSources(ctx), workspaces, taskTitles, roots: roots.map((root) => ({ id: root.id, projectId: root.project_id, projectName: 'authorized', deviceId: root.device_id, path: root.path, enabled: Boolean(root.enabled) })) }));
}

export function listSources(ctx: AppContext): SourceRegistration[] {
  return ctx.db.all<{ id: string; device_id: string; installation_id: string; tool: SourceRegistration['tool']; profile: string; config_path: string; version: string; enabled: number }>('SELECT s.*, CASE WHEN c.enabled = 0 OR c.removed_at IS NOT NULL THEN 0 ELSE s.enabled END AS enabled FROM sources s LEFT JOIN source_controls c ON c.source_id = s.id ORDER BY tool, profile, id').map((row) => ({ id: row.id, deviceId: row.device_id, installationId: row.installation_id, tool: row.tool, profile: row.profile, configPath: row.config_path, version: row.version, enabled: Boolean(row.enabled) }));
}
export function getSourceDiagnostics(ctx: AppContext): Diagnostic[] {
  return sourceStatuses(ctx).map((source) => ({ code: source.id, status: source.state === 'error' ? 'error' : source.state === 'observed' ? 'ok' : 'warning', message: source.diagnostic ?? (source.state === 'removed' ? 'Instrumentação removida; histórico preservado' : source.state === 'paused' ? 'Fonte pausada' : source.lastActivity ? `Última atividade: ${source.lastActivity}` : 'Sem eventos recebidos') }));
}

export function sourceControl(ctx: AppContext, sourceId: string) {
  uuid(sourceId);
  if (!ctx.db.get('SELECT id FROM sources WHERE id = ?', sourceId)) throw new DomainError('SOURCE_NOT_FOUND', 404);
  return ctx.db.get<{ enabled: number; removed_at: string | null; revision: number }>('SELECT enabled, removed_at, revision FROM source_controls WHERE source_id = ?', sourceId) ?? { enabled: 1, removed_at: null, revision: 0 };
}

export function controlSource(ctx: AppContext, sourceId: string, enabled: boolean, revision: number, removed = false) {
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(revision) || revision < 0) throw new DomainError('INVALID_SOURCE_CONTROL');
  ctx.db.transaction(() => {
    const previous = sourceControl(ctx, sourceId);
    if (previous.revision !== revision) throw new DomainError('SOURCE_CHANGED', 409);
    if (enabled && previous.removed_at) throw new DomainError('SOURCE_REINSTALL_REQUIRED', 409);
    ctx.db.run('INSERT INTO source_controls VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET enabled = excluded.enabled, removed_at = excluded.removed_at, revision = excluded.revision', sourceId, Number(enabled), removed ? new Date().toISOString() : previous.removed_at, revision + 1);
    const source = listSources(ctx).find((source) => source.id === sourceId)!;
    if (enabled && source.installationId === ctx.config.installationId) ctx.db.run('UPDATE sources SET enabled = 1 WHERE id = ?', sourceId);
  });
  publishCaptureManifest(ctx);
  return sourceControl(ctx, sourceId);
}

// Only an explicit successful instrumentation install may clear a tombstone.
export function sourceInstalled(ctx: AppContext, sourceId: string) {
  const previous = sourceControl(ctx, sourceId);
  if (previous.enabled && !previous.removed_at) return;
  ctx.db.run('INSERT INTO source_controls VALUES (?, 1, NULL, ?) ON CONFLICT(source_id) DO UPDATE SET enabled = 1, removed_at = NULL, revision = excluded.revision', sourceId, previous.revision + 1);
  ctx.db.run('UPDATE sources SET enabled = 1 WHERE id = ?', sourceId);
  publishCaptureManifest(ctx);
}
