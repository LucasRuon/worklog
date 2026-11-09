import { readFile } from 'node:fs/promises';
import { DomainError, type AppContext } from '../core/contracts.js';
import { controlSource, listSources, sourceControl } from '../collectors/source-config.js';
import { configureClaudeHooks, configureCodexHooks } from './hooks.js';
import { configureOpenCodePlugin } from './automation.js';
import { supportedOpenCodePluginVersions } from '../collectors/plugins/opencode-projector.js';

export async function removeSourceInstrumentation(ctx: AppContext, id: string, revision: number) {
  const source = listSources(ctx).find((source) => source.id === id);
  if (!source) throw new DomainError('SOURCE_NOT_FOUND', 404);
  if (source.installationId !== ctx.config.installationId || !['claude', 'codex', 'opencode'].includes(source.tool)) throw new DomainError('SOURCE_LOCAL_ACTION_REQUIRED', 409);
  if (sourceControl(ctx, id).removed_at) throw new DomainError('SOURCE_REINSTALL_REQUIRED', 409);
  controlSource(ctx, id, false, revision);
  // Pause first. If filesystem removal fails, the source stays paused and retryable.
  if (source.tool === 'claude') await configureClaudeHooks(source.configPath, 'remove', { ctx, sourceId: id });
  else if (source.tool === 'codex') await configureCodexHooks(source.configPath, 'remove', { ctx, sourceId: id });
  else if (supportedOpenCodePluginVersions.includes(source.version)) {
    let wrapper = '';
    try { wrapper = await readFile(source.configPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DomainError('SOURCE_REMOVE_UNAVAILABLE', 409); }
    if (wrapper && (!wrapper.includes(`"sourceId":${JSON.stringify(id)}`) || !wrapper.includes(`"dataDir":${JSON.stringify(ctx.config.dataDir)}`))) throw new DomainError('PLUGIN_FILE_NOT_OWNED', 409);
    await configureOpenCodePlugin(ctx, source.configPath, 'remove');
  }
  const current = sourceControl(ctx, id);
  controlSource(ctx, id, false, current.revision, true);
}
