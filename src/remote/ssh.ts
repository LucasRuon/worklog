import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertRecord, DomainError, uuid, type AppContext } from '../core/contracts.js';
import { describeAgent, validateEnvelope, importEnvelope, type AgentEnvelope } from './protocol.js';
import { syncRemoteGit } from './git.js';
import { syncRemoteFiles } from './files.js';
import { operatingConfig } from '../core/configuration.js';

export interface RemoteHost { host: string; node_path: string; app_path: string; data_dir: string; device_id: string | null; installation_id: string | null; last_sync_at: string | null; next_sync_ms: number; failures: number; last_error: string | null; clock_skew_ms: number; enabled: number }
const execute = promisify(execFile);
export function shellQuote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }
export function validateHost(host: string) { if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(host)) throw new DomainError('INVALID_SSH_HOST'); }
function absolute(path: string) { if (!path.startsWith('/') || path.length > 4096 || /[\x00-\x1f]/.test(path) || path.split('/').includes('..')) throw new DomainError('INVALID_REMOTE_PATH'); }
export async function ssh(host: string, argv: string[], options: { input?: Buffer; signal?: AbortSignal; timeout?: number } = {}): Promise<string> {
  validateHost(host);
  const args = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes', host, argv.map(shellQuote).join(' ')];
  return new Promise((resolve, reject) => {
    const child = execFile('ssh', args, { timeout: options.timeout ?? 25_000, maxBuffer: 16 * 1024 * 1024, signal: options.signal }, (error, stdout) => error ? reject(new DomainError('SSH_UNAVAILABLE', 503)) : resolve(stdout));
    child.stdin?.on('error', () => {}); child.stdin?.end(options.input);
  });
}
export function registerRemoteHost(ctx: AppContext, config: { host: string; nodePath: string; appPath: string; dataDir: string }) {
  validateHost(config.host); [config.nodePath, config.appPath, config.dataDir].forEach(absolute);
  ctx.db.run('INSERT INTO remote_hosts(host, node_path, app_path, data_dir) VALUES (?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET node_path = excluded.node_path, app_path = excluded.app_path, data_dir = excluded.data_dir, enabled = 1, next_sync_ms = 0', config.host, config.nodePath, config.appPath, config.dataDir);
}
export async function syncHost(ctx: AppContext, hostAlias: string, options: { signal?: AbortSignal; transport?: typeof ssh } = {}) {
  validateHost(hostAlias);
  const host = ctx.db.get<RemoteHost>('SELECT * FROM remote_hosts WHERE host = ? AND enabled = 1', hostAlias);
  if (!host) throw new DomainError('REMOTE_HOST_NOT_REGISTERED');
  const transport = options.transport ?? ssh;
  const cli = `${host.app_path}/dist/cli/index.js`;
  const run = (command: string, args: string[] = []) => transport(hostAlias, [host.node_path, cli, 'agent', command, '--data-dir', host.data_dir, ...args], { signal: options.signal });
  let inserted = 0; let duplicates = 0;
  try {
    const description: unknown = JSON.parse(await run('describe')); validateEnvelope(description);
    const previous = ctx.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', description.identity.installationId)?.seq ?? 0;
    let after = previous; let hasMore = false; let skew = 0;
    for (let count = 0; count < 10; count++) {
      const envelope: unknown = JSON.parse(await run('export', ['--after', String(after), '--limit', '500', '--expected-installation', description.identity.installationId])); validateEnvelope(envelope);
      if (envelope.identity.installationId !== description.identity.installationId || envelope.identity.deviceId !== description.identity.deviceId || !envelope.batch) throw new DomainError('REMOTE_INSTALLATION_CHANGED');
      skew = Date.parse(envelope.generatedAt) - Date.now();
      const result = importEnvelope(ctx, envelope, skew); inserted += result.inserted; duplicates += result.duplicates;
      after = result.cursor.seq; hasMore = envelope.batch.hasMore;
      if (!hasMore) break;
    }
    await syncRemoteGit(ctx, description, run);
    await syncRemoteFiles(ctx, description, run);
    ctx.db.run('UPDATE remote_hosts SET device_id = ?, installation_id = ?, last_sync_at = ?, next_sync_ms = ?, failures = 0, last_error = ?, clock_skew_ms = ? WHERE host = ?', description.identity.deviceId, description.identity.installationId, new Date().toISOString(), Date.now() + (hasMore ? 1000 : operatingConfig(ctx).syncIntervalMs), Math.abs(skew) > 60_000 ? 'clock-skew' : null, skew, hostAlias);
    return { host: hostAlias, inserted, duplicates, cursor: { installationId: description.identity.installationId, seq: after }, hasMore, clockSkewMs: skew };
  } catch (error) {
    if (options.signal?.aborted) {
      ctx.db.run('UPDATE remote_hosts SET next_sync_ms = 0 WHERE host = ?', hostAlias);
      throw new DomainError('REMOTE_SYNC_CANCELLED');
    }
    const diagnostic = error instanceof DomainError ? error.code : 'REMOTE_RESPONSE_INVALID';
    ctx.db.run('UPDATE remote_hosts SET failures = failures + 1, last_error = ?, next_sync_ms = ? WHERE host = ?', diagnostic, Date.now() + Math.min(300_000, operatingConfig(ctx).syncIntervalMs * 2 ** Math.min(host.failures, 5)), hostAlias);
    throw new DomainError(diagnostic, 503);
  }
}
export async function syncScheduledHosts(ctx: AppContext, signal?: AbortSignal) {
  for (const host of ctx.db.all<RemoteHost>('SELECT * FROM remote_hosts WHERE enabled = 1 AND next_sync_ms <= ?', Date.now())) {
    if (signal?.aborted) break;
    const lease = ctx.db.run('UPDATE remote_hosts SET next_sync_ms = ? WHERE host = ? AND next_sync_ms <= ?', Date.now() + 60_000, host.host, Date.now());
    if (!lease.changes) continue;
    try { await syncHost(ctx, host.host, { signal }); } catch { /* O diagnóstico e backoff foram persistidos. */ }
  }
}

export async function installRemote(ctx: AppContext, options: { host: string; nodePath: string; workspace: string; configPath?: string }) {
  validateHost(options.host); absolute(options.nodePath); absolute(options.workspace);
  const probe: unknown = JSON.parse(await ssh(options.host, [options.nodePath, '-e', 'console.log(JSON.stringify({home:require("node:os").homedir(),platform:process.platform,node:process.versions.node}))']));
  assertRecord(probe);
  if (probe.platform !== 'linux' || typeof probe.home !== 'string' || typeof probe.node !== 'string' || !probe.node.startsWith('24.')) throw new DomainError('REMOTE_RUNTIME_UNSUPPORTED');
  absolute(probe.home);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const archive = execFileSync('tar', ['-cf', '-', '--exclude=dist/web', '-C', root, 'package.json', 'dist', 'db/migrations'], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const digest = createHash('sha256').update(archive).digest('hex').slice(0, 20);
  const appPath = `${probe.home}/.local/share/worklog/releases/${digest}`; const dataDir = `${probe.home}/.local/share/worklog/data`;
  const mkdir = 'const fs=require("node:fs");const p=process.argv[1];fs.mkdirSync(p,{recursive:true,mode:448});';
  await ssh(options.host, [options.nodePath, '-e', mkdir, appPath]);
  await ssh(options.host, ['tar', '-xf', '-', '-C', appPath], { input: archive });
  const configPath = options.configPath ?? `${probe.home}/.claude/settings.json`; absolute(configPath);
  const configured = await ssh(options.host, [options.nodePath, `${appPath}/dist/cli/index.js`, 'agent', 'configure', '--data-dir', dataDir, '--workspace', options.workspace, '--config', configPath, '--claude-path', `${probe.home}/.local/bin/claude`]);
  registerRemoteHost(ctx, { host: options.host, nodePath: options.nodePath, appPath, dataDir });
  const service = await ssh(options.host, [options.nodePath, `${appPath}/dist/cli/index.js`, 'service', 'install', '--data-dir', dataDir], { timeout: 130_000 });
  const synced = await syncHost(ctx, options.host);
  return { host: options.host, appPath, dataDir, configured: JSON.parse(configured) as unknown, service: JSON.parse(service) as unknown, synced };
}
