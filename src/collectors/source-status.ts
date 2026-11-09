import { lstatSync } from 'node:fs';
import type { AppContext, SourceRegistration } from '../core/contracts.js';
import { listSources, sourceControl } from './source-config.js';
import { supportedClaudeVersions } from './claude.js';
import { getCodexDiagnostic, supportedCodexVersions } from './codex.js';
import { openCodeDiagnostic } from './opencode.js';
import { supportedOpenCodePluginVersions } from './plugins/opencode-projector.js';

export function sourceStatuses(ctx: AppContext, now = Date.now()) {
  return listSources(ctx).map((source) => {
    const control = sourceControl(ctx, source.id);
    const local = source.installationId === ctx.config.installationId;
    const versions: Partial<Record<SourceRegistration['tool'], string[]>> = { claude: supportedClaudeVersions, codex: supportedCodexVersions, opencode: ['1.19.5', ...supportedOpenCodePluginVersions] };
    const compatibility = !versions[source.tool] || versions[source.tool]!.includes(source.version) ? 'supported' as const : 'unsupported' as const;
    let availability: 'present' | 'missing' | 'remote' = local ? 'missing' : 'remote';
    if (local) try { const info = lstatSync(source.configPath); if (info.isFile() || info.isDirectory()) availability = 'present'; } catch { /* Presence is not evidence of collection. */ }
    const activity = ctx.db.get<{ at: string | null; received: string | null }>('SELECT max(occurred_at) AS at, max(received_at) AS received FROM events WHERE source_id = ?', source.id);
    const lastActivity = activity?.at ?? null;
    const codex = local && source.tool === 'codex' ? getCodexDiagnostic(ctx.config.dataDir, source.id) : null;
    const observation = source.tool === 'opencode' ? supportedOpenCodePluginVersions.includes(source.version) ? { transport: 'plugin-v2', diagnostic: null, observedFrom: null } : openCodeDiagnostic(ctx, source.id) : null;
    const remote = ctx.db.get<{ host: string; last_sync_at: string | null; last_error: string | null; clock_skew_ms: number }>('SELECT host, last_sync_at, last_error, clock_skew_ms FROM remote_hosts WHERE device_id = ?', source.deviceId);
    const lagMs = remote?.last_sync_at ? Math.max(0, now - Date.parse(remote.last_sync_at)) : null;
    const diagnostic = compatibility === 'unsupported' ? 'SOURCE_VERSION_UNSUPPORTED' : codex && codex.code !== 'CODEX_CAPTURE_OK' ? codex.code : observation?.diagnostic ?? (remote?.last_error ? 'REMOTE_SYNC_FAILED' : null);
    const state = control.removed_at ? 'removed' as const : !source.enabled ? 'paused' as const : compatibility === 'unsupported' ? 'unsupported' as const : diagnostic ? 'error' as const : lagMs !== null && lagMs > 60_000 ? 'delayed' as const : lastActivity ? 'observed' as const : 'no-data' as const;
    const lastImport = ctx.db.get<{ state: string; imported: number; skipped: number; warnings: string; updated_at: string }>('SELECT state, imported, skipped, warnings, updated_at FROM history_runs WHERE source_id = ? ORDER BY updated_at DESC LIMIT 1', source.id);
    return { id: source.id, deviceId: source.deviceId, tool: source.tool, profile: source.profile, version: source.version, enabled: source.enabled, lastActivity, lastReceivedAt: activity?.received ?? null, state, compatibility, availability, diagnostic, lagMs, revision: control.revision, canManage: local && ['claude', 'codex', 'opencode'].includes(source.tool), ...(lastImport ? { history: { state: lastImport.state, imported: lastImport.imported, skipped: lastImport.skipped, warnings: JSON.parse(lastImport.warnings) as string[], updatedAt: lastImport.updated_at } } : {}), ...(observation ? { observation } : {}), ...(remote ? { remote } : {}) };
  });
}
export type SourceStatus = ReturnType<typeof sourceStatuses>[number];
