import { lstat, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { atomicPrivate } from '../core/private-files.js';
import { stableId } from '../core/policy.js';
import { DomainError, type AppContext } from '../core/contracts.js';
import { registerSource, listSources, sourceInstalled } from '../collectors/source-config.js';
import { isOpenCodeV2 } from '../collectors/plugins/opencode-projector.js';

const owner = '// worklog-managed-opencode-v2';
export async function configureOpenCodePlugin(ctx: AppContext, pluginPath: string, action: 'install' | 'remove', version?: string) {
  if (action === 'install' && !isOpenCodeV2(version)) throw new DomainError('OPENCODE_VERSION_UNSUPPORTED');
  await mkdir(dirname(pluginPath), { recursive: true, mode: 0o700 });
  let previous = '';
  try { if (!(await lstat(pluginPath)).isFile()) throw new DomainError('PLUGIN_PATH_UNSAFE'); previous = await readFile(pluginPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (previous && !previous.startsWith(owner)) throw new DomainError('PLUGIN_FILE_NOT_OWNED');
  const sourceId = stableId(ctx.config.installationId, 'opencode-plugin-v2', pluginPath);
  if (action === 'install') {
    const modulePath = fileURLToPath(new URL('../../dist/collectors/plugins/worklog-opencode.js', import.meta.url));
    const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
    await lstat(modulePath).catch(() => { throw new DomainError('BUILD_REQUIRED'); });
    const revision = createHash('sha256').update(await readFile(modulePath)).digest('hex').slice(0, 16);
    const content = `${owner}\nimport { createWorklogPlugin } from ${JSON.stringify(`${pathToFileURL(modulePath).href}?revision=${revision}`)};\nexport default createWorklogPlugin(${JSON.stringify({ nodePath: process.execPath, cliPath, dataDir: ctx.config.dataDir, sourceId })});\n`;
    if (content !== previous) atomicPrivate(pluginPath, content);
    registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'opencode', profile: 'automatico-v2', configPath: pluginPath, version: version!, enabled: true });
    sourceInstalled(ctx, sourceId);
    for (const old of listSources(ctx)) if (old.tool === 'opencode' && old.version === '1.19.5' && old.enabled) registerSource(ctx, { ...old, enabled: false });
  } else {
    if (previous && (!previous.includes(`"sourceId":${JSON.stringify(sourceId)}`) || !previous.includes(`"dataDir":${JSON.stringify(ctx.config.dataDir)}`))) throw new DomainError('PLUGIN_FILE_NOT_OWNED');
    if (previous) await unlink(pluginPath);
    const source = listSources(ctx).find((source) => source.id === sourceId);
    if (source) registerSource(ctx, { ...source, enabled: false });
  }
  return { sourceId, pluginPath, action };
}
