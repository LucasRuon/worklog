import { execFile } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { defaultDataDir, openStore } from '../core/context.js';
import { setWorkspaces } from '../core/automation.js';
import { configureOpenCodePlugin } from './automation.js';
import { DomainError } from '../core/contracts.js';
import { configureClaudeHooks } from './hooks.js';
import { isClaudeSupported, drainQueue } from '../collectors/claude.js';
import { registerSource } from '../collectors/source-config.js';
import { stableId } from '../core/policy.js';
import { describeAgent, exportBatch, validateEnvelope } from '../remote/protocol.js';
import { installRemote, syncHost, ssh, type RemoteHost } from '../remote/ssh.js';
import { manageService } from './service.js';
import { runAgent } from '../core/runner.js';
import { exportGitPacket } from '../remote/git.js';
import { exportFilePacket } from '../remote/files.js';
import { stopFiles } from '../collectors/files.js';
import { isOpenCodeV2 } from '../collectors/plugins/opencode-projector.js';

const execute = promisify(execFile);
export async function management(argv: string[]) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    workspace: { type: 'string', multiple: true }, 'data-dir': { type: 'string' }, 'plugin-path': { type: 'string' }, central: { type: 'boolean' },
    host: { type: 'string' }, node: { type: 'string' }, config: { type: 'string' }, 'claude-path': { type: 'string' },
    after: { type: 'string' }, limit: { type: 'string' }, 'expected-installation': { type: 'string' },
    action: { type: 'string' },
    snapshot: { type: 'string' }, known: { type: 'string' },
  } });
  const [command, action] = positionals;
  if (positionals.length !== 2) throw new DomainError('MANAGEMENT_ARGUMENTS_INVALID');
  const dataDir = resolve(values['data-dir'] ?? process.env.WORKLOG_DATA_DIR ?? defaultDataDir());
  const ctx = await openStore(dataDir);
  try {
    if (command === 'automation' && ['install', 'remove', 'configure'].includes(action!)) {
      if (values.workspace) setWorkspaces(ctx, values.workspace.map((path) => resolve(path)));
      if (action === 'configure') { console.log(JSON.stringify({ workspaces: values.workspace ?? [] })); return; }
      const pluginPath = resolve(values['plugin-path'] ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'opencode/plugins/worklog.js'));
      const version = action === 'install' ? (await execute('opencode', ['--version'], { timeout: 10_000 })).stdout.match(/\d+\.\d+\.\d+/)?.[0] : undefined;
      if (action === 'install' && !isOpenCodeV2(version)) throw new DomainError('OPENCODE_VERSION_UNSUPPORTED');
      console.log(JSON.stringify(await configureOpenCodePlugin(ctx, pluginPath, action as 'install' | 'remove', version))); return;
    }
    if (command === 'agent' && action === 'configure' && values.config && values.workspace) {
      setWorkspaces(ctx, values.workspace.map((path) => resolve(path)));
      const claudePath = values['claude-path'] ?? join(homedir(), '.local/bin/claude');
      const version = (await execute(claudePath, ['--version'], { timeout: 10_000, maxBuffer: 4096 })).stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0];
      if (!isClaudeSupported(version)) throw new DomainError('CLAUDE_VERSION_UNSUPPORTED');
      const configPath = resolve(values.config); const sourceId = stableId(ctx.config.installationId, 'claude', configPath);
      registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'claude', profile: 'default', configPath, version, enabled: true });
      await configureClaudeHooks(configPath, 'install', { ctx, sourceId });
      console.log(JSON.stringify({ configured: true, version, sourceId, identity: describeAgent(ctx).identity })); return;
    }
    if (command === 'agent' && action === 'describe') { console.log(JSON.stringify(describeAgent(ctx))); return; }
    if (command === 'agent' && action === 'files') {
      if (values['expected-installation'] !== ctx.config.installationId) throw new DomainError('REMOTE_INSTALLATION_CHANGED');
      console.log(JSON.stringify(exportFilePacket(ctx, Number(values.after ?? '0')))); return;
    }
    if (command === 'agent' && action === 'git') {
      if (values['expected-installation'] !== ctx.config.installationId) throw new DomainError('REMOTE_INSTALLATION_CHANGED');
      console.log(JSON.stringify(exportGitPacket(ctx, Number(values.after ?? '0'), values.snapshot, values.known))); return;
    }
    if (command === 'agent' && action === 'export') {
      if (values['expected-installation'] && values['expected-installation'] !== ctx.config.installationId) throw new DomainError('REMOTE_INSTALLATION_CHANGED');
      const after = Number(values.after ?? '0'); const limit = Number(values.limit ?? '500');
      drainQueue(ctx); console.log(JSON.stringify(exportBatch(ctx, after, limit))); return;
    }
    if (command === 'agent' && action === 'run') {
      const controller = new AbortController(); const stop = () => controller.abort();
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try { await runAgent(ctx, Boolean(values.central), controller.signal); }
      finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
      return;
    }
    if (command === 'service' && ['install', 'start', 'stop', 'status', 'remove'].includes(action!)) {
      console.log(JSON.stringify(await manageService(action as 'install', { dataDir, central: values.central ?? platform() === 'darwin' }))); return;
    }
    if (command === 'remote' && action === 'install' && values.host && values.node && values.workspace?.length === 1) {
      console.log(JSON.stringify(await installRemote(ctx, { host: values.host, nodePath: values.node, workspace: values.workspace[0]!, configPath: values.config }))); return;
    }
    if (command === 'remote' && action === 'sync' && values.host) { console.log(JSON.stringify(await syncHost(ctx, values.host))); return; }
    if (command === 'remote' && action === 'service' && values.host && ['start', 'stop', 'status', 'remove'].includes(values.action ?? '')) {
      const host = ctx.db.get<RemoteHost>('SELECT * FROM remote_hosts WHERE host = ?', values.host);
      if (!host) throw new DomainError('REMOTE_HOST_NOT_REGISTERED');
      const result = await ssh(host.host, [host.node_path, `${host.app_path}/dist/cli/index.js`, 'service', values.action!, '--data-dir', host.data_dir]);
      console.log(JSON.stringify(JSON.parse(result) as unknown)); return;
    }
    if (command === 'remote' && ['pause', 'resume', 'remove'].includes(action ?? '') && values.host) {
      const host = ctx.db.get<RemoteHost>('SELECT * FROM remote_hosts WHERE host = ?', values.host);
      if (!host) throw new DomainError('REMOTE_HOST_NOT_REGISTERED');
      if (action === 'remove') {
        const cli = `${host.app_path}/dist/cli/index.js`;
        const description: unknown = JSON.parse(await ssh(host.host, [host.node_path, cli, 'agent', 'describe', '--data-dir', host.data_dir])); validateEnvelope(description);
        for (const source of description.sources.filter((source) => source.tool === 'claude')) {
          await ssh(host.host, [host.node_path, cli, 'hooks', 'remove', '--data-dir', host.data_dir, '--config', source.configPath]);
        }
        await ssh(host.host, [host.node_path, cli, 'service', 'remove', '--data-dir', host.data_dir]);
        ctx.db.run('UPDATE sources SET enabled = 0 WHERE installation_id = ?', description.identity.installationId);
      }
      ctx.db.run('UPDATE remote_hosts SET enabled = ?, next_sync_ms = 0 WHERE host = ?', Number(action === 'resume'), values.host);
      console.log(JSON.stringify({ host: values.host, enabled: action === 'resume', historyPreserved: true })); return;
    }
    if (command === 'remote' && action === 'status') {
      console.log(JSON.stringify(ctx.db.all('SELECT host, device_id, last_sync_at, failures, last_error, clock_skew_ms, enabled FROM remote_hosts'))); return;
    }
    throw new DomainError('MANAGEMENT_ARGUMENTS_INVALID');
  } finally { try { await stopFiles(ctx); } finally { await ctx.shutdown(); } }
}
