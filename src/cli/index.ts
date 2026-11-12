import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { closeApp, createApp } from '../server/index.js';
import { readBootstrapToken } from '../server/auth.js';
import { doctor } from './doctor.js';
import { defaultDataDir, openStore } from '../core/context.js';
import { registerProjectRoot } from '../core/projects.js';
import { configureClaudeHooks, configureCodexHooks } from './hooks.js';
import { registerSource } from '../collectors/source-config.js';
import { stableId } from '../core/policy.js';
import { queueClaude, isClaudeSupported } from '../collectors/claude.js';
import { synchronize } from '../server/routes.js';
import { connectOpenCode, disconnectOpenCode, supportedOpenCodeVersion } from '../collectors/opencode.js';
import { DomainError } from '../core/contracts.js';
import { management } from './manage.js';
import { captureSource, enqueueEvents } from '../collectors/queue.js';
import { normalizeEvent } from '../core/policy.js';
import { pollGit } from '../collectors/git.js';
import { pollFiles, stopFiles } from '../collectors/files.js';
import { queueCodex, isCodexSupported } from '../collectors/codex.js';
import { configureHistory, exportHistory, importHistory } from '../collectors/history.js';
import { listPullRequests, pullRequestSyncState, syncPullRequests } from '../providers/github.js';
import { backupData, restoreData, runRetention, storageUsage } from '../core/maintenance.js';
import { configure, operatingConfig, setRootEnabled } from '../core/configuration.js';
import { isOpenCodeV2 } from '../collectors/plugins/opencode-projector.js';

const execute = promisify(execFile);
export { defaultDataDir } from '../core/context.js';

async function main() {
  if (['automation', 'agent', 'remote', 'service'].includes(process.argv[2] ?? '')) return management(process.argv.slice(2));
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { dev: { type: 'boolean' }, 'data-dir': { type: 'string' }, port: { type: 'string' }, config: { type: 'string' }, profile: { type: 'string' }, root: { type: 'string' }, name: { type: 'string' }, client: { type: 'string' }, 'project-id': { type: 'string' }, 'source-id': { type: 'string' }, 'repository-id': { type: 'string' }, 'worklog-hook-v1': { type: 'boolean' }, 'worklog-codex-v1': { type: 'boolean' }, tool: { type: 'string' }, database: { type: 'string' }, session: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, parser: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' }, limit: { type: 'string' } },
  });
  const command = positionals[0] ?? 'help';
  if (positionals.length > (['project', 'hooks', 'opencode', 'history', 'prs', 'maintenance'].includes(command) ? 2 : 1)) throw new Error('Argumentos inesperados.');
  if (command === 'doctor') { console.log(JSON.stringify(await doctor(), null, 2)); return; }
  if (command === 'help') {
    console.log('Manutenção:\n  maintenance config [--config JSON]\n  maintenance backup --output /destino-novo\n  maintenance restore --input /backup --data-dir /destino-novo\n  maintenance retention\n  maintenance pause|resume --root UUID\nRestauração exige destino novo e serviço parado; não substitui base ativa.');
    console.log('GitHub (somente leitura): prs repositories | prs sync --repository-id UUID | prs list --from UTC --to UTC');
    console.log('Histórico:\n  history configure --source-id UUID --parser normalized-v1|opencode-db-1.19.5|opencode-log-v1|opencode-db-v2|claude-transcript-v1|codex-receipts-v1|codex-rollout-0.167.0|codex-rollout-v2-0.167.0|codex-rollout-v3-0.167.0|codex-rollout-v4-0.167.0 --input /arquivo\n  history import --source-id UUID --from UTC --to UTC [--limit 500]\n  history export --source-id UUID --from UTC --to UTC --output /arquivo.jsonl\nImportação retomável. Ctrl+C confirma somente os registros já persistidos. Rollout Codex v1: turnos raiz; v2 opt-in: também ferramentas comprovadas e filhos diretos com borda ordinal; v3 opt-in: também chamadas dinâmicas completed/success=true; v4 opt-in: também MCP completed com FunctionCall canônico correlacionado. Todos mantêm limite parcial explícito.');
    console.log('Codex: hooks install|remove --tool codex --config /perfil/hooks.json [--profile Nome]\nApós instalar, revise e confie nos hooks Worklog pelo /hooks do Codex. A instalação não concede confiança.');
    console.log('Worklog\n  serve [--dev] [--port 4320] [--data-dir /diretorio]\n  open [--port 4320] [--data-dir /diretorio]\n  doctor\n  project add --root /repo --name Nome [--project-id UUID] [--client Cliente]\n  hooks install|remove --config /perfil/settings.json [--profile Nome]\n  automation install|configure --workspace /pasta [--workspace /outra]\n  automation remove\n  service install|start|stop|status|remove [--central]\n  remote install --host ALIAS --node /node --workspace /projetos [--config /settings.json]\n  remote sync|status --host ALIAS\n  remote service --host ALIAS --action start|stop|status|remove\n  opencode connect --root /repo [--database /opencode.db] [--session ID] (legado 1.19.5)\n  collect\nAs opções --data-dir e --port também aceitam WORKLOG_DATA_DIR/WORKLOG_PORT.');
    return;
  }
  const dataDir = values['data-dir'] ?? process.env.WORKLOG_DATA_DIR ?? defaultDataDir();
  if (command === 'maintenance' && positionals[1] === 'restore' && values.input) { console.log(JSON.stringify(await restoreData({ backup: resolve(values.input), dataDir }))); return; }
  if (command === 'plugin-event' && values['source-id']) {
    let body = '';
    for await (const chunk of process.stdin) { body += String(chunk); if (Buffer.byteLength(body) > 64 * 1024) throw new DomainError('PLUGIN_EVENT_TOO_LARGE'); }
    const source = captureSource(dataDir, values['source-id']);
    if (!source || source.tool !== 'opencode' || !isOpenCodeV2(source.version)) throw new DomainError('PLUGIN_SOURCE_UNSUPPORTED');
    const input: unknown = JSON.parse(body);
    if (!Array.isArray(input) || input.length < 1 || input.length > 4) throw new DomainError('PLUGIN_EVENT_INVALID');
    const events = input.flatMap((record) => normalizeEvent(source, record));
    if (events.length !== input.length) throw new DomainError('PLUGIN_EVENT_INVALID');
    enqueueEvents(dataDir, events); return;
  }
  if (command === 'hook' && (values['worklog-hook-v1'] || values['worklog-codex-v1']) && values['source-id']) {
    let input = ''; let oversized = false;
    for await (const chunk of process.stdin) {
      if (Buffer.byteLength(input) + Buffer.byteLength(chunk as Buffer) > 1024 * 1024) { oversized = true; break; }
      input += String(chunk);
    }
    if (!oversized) { try {
      if (values['worklog-codex-v1']) queueCodex(dataDir, values['source-id'], JSON.parse(input));
      else queueClaude(dataDir, values['source-id'], JSON.parse(input));
    } catch {
      if (values['worklog-codex-v1']) queueCodex(dataDir, values['source-id'], null);
    } }
    else if (values['worklog-codex-v1']) queueCodex(dataDir, values['source-id'], null);
    if (values['worklog-codex-v1']) process.stdout.write('{}\n');
    return;
  }
  if (['project', 'hooks', 'collect', 'opencode', 'history', 'prs', 'maintenance'].includes(command)) {
    const ctx = await openStore(dataDir);
    try {
      if (command === 'maintenance') {
        if (positionals[1] === 'config') { if (values.config) { let input: unknown; try { input = JSON.parse(values.config); } catch { throw new DomainError('INVALID_CONFIGURATION'); } configure(ctx, input as never); } console.log(JSON.stringify({ config: operatingConfig(ctx), storage: storageUsage(ctx) })); }
        else if (positionals[1] === 'backup' && values.output) console.log(JSON.stringify(await backupData(ctx, resolve(values.output))));
        else if (positionals[1] === 'retention') console.log(JSON.stringify(runRetention(ctx, new Date().toISOString())));
        else if (['pause', 'resume'].includes(positionals[1] ?? '') && values.root) { setRootEnabled(ctx, values.root, positionals[1] === 'resume'); console.log(JSON.stringify({ updated: true })); }
        else throw new DomainError('MAINTENANCE_ARGUMENTS_REQUIRED');
      } else if (command === 'prs') {
        if (positionals[1] === 'repositories') console.log(JSON.stringify(ctx.db.all('SELECT id, canonical FROM repositories ORDER BY canonical')));
        else if (positionals[1] === 'sync' && values['repository-id']) {
          const result = await syncPullRequests(ctx, values['repository-id'], { force: true }); console.log(JSON.stringify({ ...result, sync: pullRequestSyncState(ctx, values['repository-id']) })); if (result.stale) process.exitCode = 1;
        } else if (positionals[1] === 'list' && values.from && values.to) console.log(JSON.stringify(listPullRequests(ctx, { projectIds: [], from: values.from, to: values.to, timezone: ctx.config.timezone })));
        else throw new DomainError('GITHUB_ARGUMENTS_REQUIRED');
      } else if (command === 'history' && values['source-id']) {
        if (positionals[1] === 'configure' && values.parser && values.input) {
          configureHistory(ctx, values['source-id'], { parser: values.parser, path: resolve(values.input) }); console.log(JSON.stringify({ configured: true }));
        } else if (values.from && values.to && positionals[1] === 'export' && values.output) {
          console.log(JSON.stringify(exportHistory(ctx, values['source-id'], { from: values.from, to: values.to }, resolve(values.output))));
        } else if (values.from && values.to && positionals[1] === 'import') {
          const controller = new AbortController(); const cancel = () => controller.abort();
          process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
          try {
            const result = await importHistory(ctx, values['source-id'], { from: values.from, to: values.to }, { signal: controller.signal, ...(values.limit ? { limit: Number(values.limit) } : {}) });
            synchronize(ctx); console.log(JSON.stringify(result));
            if (!result.complete && (!result.warnings.includes('HISTORY_MORE_AVAILABLE') || result.warnings.includes('HISTORY_LIFECYCLE_ONLY'))) process.exitCode = result.warnings.includes('HISTORY_CANCELLED') ? 130 : 1;
          } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
        } else throw new DomainError('HISTORY_ARGUMENTS_REQUIRED');
      } else if (command === 'project' && positionals[1] === 'add' && values.root && values.name) {
        console.log(JSON.stringify({ projectId: registerProjectRoot(ctx, { projectName: values.name, path: resolve(values.root), deviceId: ctx.config.deviceId, ...(values['project-id'] ? { projectId: values['project-id'] } : {}), ...(values.client ? { client: values.client } : {}) }) }));
      } else if (command === 'hooks' && ['install', 'remove'].includes(positionals[1] ?? '') && values.config) {
        const configPath = resolve(values.config);
        const tool = values.tool ?? 'claude';
        if (tool !== 'claude' && tool !== 'codex') throw new DomainError('UNSUPPORTED_SOURCE');
        const sourceId = stableId(ctx.config.installationId, tool, configPath);
        if (positionals[1] === 'install') {
          const { stdout } = await execute(tool, ['--version'], { timeout: 10_000, maxBuffer: 4096 });
          const version = stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0];
          if (!version || !(tool === 'codex' ? isCodexSupported(version) : isClaudeSupported(version))) throw new DomainError(tool === 'codex' ? 'CODEX_VERSION_UNSUPPORTED' : 'UNSUPPORTED_SOURCE');
          registerSource(ctx, { id: sourceId, installationId: ctx.config.installationId, deviceId: ctx.config.deviceId, tool, profile: values.profile ?? 'default', configPath, version, enabled: true });
        }
        if (tool === 'codex') await configureCodexHooks(configPath, positionals[1] as 'install' | 'remove', { ctx, sourceId });
        else await configureClaudeHooks(configPath, positionals[1] as 'install' | 'remove', { ctx, sourceId });
        console.log(positionals[1] === 'install' ? 'Hooks Worklog instalados com backup.' : 'Hooks Worklog removidos.');
        if (tool === 'codex' && positionals[1] === 'install') console.log('Revisão de confiança pendente: abra /hooks no Codex e revise os comandos Worklog. Nenhuma política ou confiança foi alterada.');
      } else if (command === 'opencode' && positionals[1] === 'connect' && values.root) {
        const { stdout } = await execute('opencode', ['--version'], { timeout: 10_000, maxBuffer: 4096 });
        if (stdout.trim() !== supportedOpenCodeVersion) throw new DomainError('OPENCODE_VERSION_UNSUPPORTED');
        const databasePath = values.database ?? (await execute('opencode', ['db', 'path'], { timeout: 10_000, maxBuffer: 4096 })).stdout.trim();
        const connection = connectOpenCode(ctx, { databasePath: resolve(databasePath), rootPath: resolve(values.root), sessionId: values.session, profile: values.profile });
        const capture = synchronize(ctx, { forceObservers: true });
        console.log(JSON.stringify({ ...connection, capture }));
        if (capture.observers.some((observer) => observer.status === 'error')) process.exitCode = 1;
      } else if (command === 'opencode' && positionals[1] === 'disconnect' && values['source-id']) {
        disconnectOpenCode(ctx, values['source-id']); console.log('Observador OpenCode pausado; histórico preservado.');
      } else if (command === 'collect') {
        await pollFiles(ctx);
        await pollGit(ctx, { force: true });
        const result = synchronize(ctx, { forceObservers: true }); console.log(JSON.stringify(result));
        if (result.observers.some((observer) => observer.status === 'error')) process.exitCode = 1;
      }
      else throw new Error('Argumentos incompletos. Execute npm run cli -- help.');
    } finally { try { await stopFiles(ctx); } finally { await ctx.shutdown(); } }
    return;
  }
  const rawPort = values.port ?? process.env.WORKLOG_PORT ?? '4320';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Porta deve estar entre 1 e 65535.');
  if (!isAbsolute(dataDir)) throw new Error('Diretório de dados deve ser absoluto.');
  const port = Number(rawPort);
  if (command === 'open') {
    const token = await readBootstrapToken(dataDir);
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}/api/auth/session`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!response.ok) throw new Error('Servidor local indisponível ou token incompatível.');
    await execute(platform() === 'darwin' ? '/usr/bin/open' : 'xdg-open', [`${origin}/#token=${token}`], { timeout: 10_000 });
    console.log('Worklog aberto no navegador local.');
    return;
  }
  if (command !== 'serve') throw new Error('Comando desconhecido. Execute npm run cli -- help.');
  const ctx = await createApp({ dataDir, port, dev: values.dev, observeMachine: true });
  console.log(`Worklog disponível em ${ctx.config.origin}\nAutenticar navegador: npm run cli -- open`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void closeApp(ctx).catch(() => { console.error('Falha ao encerrar Worklog.'); process.exitCode = 1; });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

void main().catch((error: unknown) => {
  if (process.argv[2] === 'hook' && (process.argv.includes('--worklog-hook-v1') || process.argv.includes('--worklog-codex-v1'))) {
    if (process.argv.includes('--worklog-codex-v1')) process.stdout.write('{}\n');
    process.exitCode = 0; return;
  }
  const code = (error as NodeJS.ErrnoException).code;
  const message = error instanceof DomainError ? error.code : error instanceof Error && !code ? error.message : 'Não foi possível executar. Confira porta, runtime e permissões do diretório de dados.';
  console.error(`Worklog: ${message}`);
  process.exitCode = 1;
});
