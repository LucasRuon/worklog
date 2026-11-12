import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, mkdir, unlink, lstat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDataDir, openStore } from '../core/context.js';
import { assertRecord, DomainError, type AppContext } from '../core/contracts.js';
import { atomicPrivate } from '../core/private-files.js';
import { stableId } from '../core/policy.js';
import { listSources, registerSource, sourceInstalled } from '../collectors/source-config.js';
import { claudeHooks, isClaudeSupported } from '../collectors/claude.js';
import { codexHooks, isCodexSupported } from '../collectors/codex.js';

const cli = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
const marker = '--worklog-hook-v1';

export async function configureClaudeHooks(configPath: string, operation: 'install' | 'remove', options?: { ctx: AppContext; sourceId?: string }): Promise<void> {
  if (!options) {
    const ctx = await openStore(process.env.WORKLOG_DATA_DIR ?? defaultDataDir());
    try { return await configureClaudeHooks(configPath, operation, { ctx }); } finally { await ctx.shutdown(); }
  }
  configPath = resolve(configPath);
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const lockPath = `${configPath}.worklog.lock`;
  const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    let original = '';
    try {
      const info = await lstat(configPath);
      if (!info.isFile() || info.size > 1024 * 1024) throw new DomainError('INVALID_CLAUDE_CONFIG');
      original = await readFile(configPath, 'utf8');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const config: unknown = original ? JSON.parse(original) : {}; assertRecord(config);
    const hooks = config.hooks ?? {}; assertRecord(hooks);
    const ctx = options.ctx;
    const source = options.sourceId ? listSources(ctx).find((source) => source.id === options.sourceId) : undefined;
    const sourceId = source?.id ?? stableId(ctx.config.installationId, 'claude', configPath);
    if (source && source.configPath !== configPath) throw new DomainError('SOURCE_CONFIG_MISMATCH');
    if (source && (source.tool !== 'claude' || !isClaudeSupported(source.version))) throw new DomainError('UNSUPPORTED_SOURCE');
    if (operation === 'install') {
      await lstat(cli).catch(() => { throw new DomainError('BUILD_REQUIRED'); });
      if (!source) registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'claude', profile: 'default', configPath, version: '2.1.318', enabled: true });
    }
    const nextHooks: Record<string, unknown> = { ...hooks };
    for (const event of claudeHooks) {
      const groups = hooks[event] ?? [];
      if (!Array.isArray(groups)) throw new DomainError('INVALID_CLAUDE_HOOKS');
      const preserved = groups.flatMap((group: unknown) => {
        assertRecord(group);
        if (!Array.isArray(group.hooks)) throw new DomainError('INVALID_CLAUDE_HOOKS');
        const kept = group.hooks.filter((handler: unknown) => {
          assertRecord(handler);
          return !(Array.isArray(handler.args) && handler.args[1] === 'hook' && handler.args.includes(marker) && handler.args.includes(ctx.config.dataDir) && handler.args.includes(sourceId));
        });
        return kept.length === group.hooks.length ? [group] : kept.length ? [{ ...group, hooks: kept }] : [];
      });
      if (operation === 'install') preserved.push({ hooks: [{ type: 'command', command: process.execPath, args: [cli, 'hook', marker, '--data-dir', ctx.config.dataDir, '--source-id', sourceId], timeout: 2, onFailure: 'continue' }] });
      if (preserved.length) nextHooks[event] = preserved;
      else delete nextHooks[event];
    }
    const next = { ...config, ...(Object.keys(nextHooks).length ? { hooks: nextHooks } : {}) };
    if (!Object.keys(nextHooks).length) delete next.hooks;
    if (JSON.stringify(config) === JSON.stringify(next)) {
      if (source && source.enabled !== (operation === 'install')) registerSource(ctx, { ...source, enabled: operation === 'install' });
      if (operation === 'install') sourceInstalled(ctx, sourceId);
      return;
    }
    if (original) atomicPrivate(`${configPath}.worklog-backup-${randomUUID()}`, original);
    let current = '';
    try { current = await readFile(configPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (current !== original) throw new DomainError('CLAUDE_CONFIG_CHANGED', 409);
    atomicPrivate(configPath, `${JSON.stringify(next, null, 2)}\n`);
    if (source && source.enabled !== (operation === 'install')) registerSource(ctx, { ...source, enabled: operation === 'install' });
    if (operation === 'install') sourceInstalled(ctx, sourceId);
  } finally { await lock.close(); await unlink(lockPath); }
}

export async function configureCodexHooks(configPath: string, operation: 'install' | 'remove', options: { ctx: AppContext; sourceId: string }): Promise<void> {
  configPath = resolve(configPath);
  const { ctx, sourceId } = options;
  const source = listSources(ctx).find((source) => source.id === sourceId);
  if (!source || source.tool !== 'codex' || source.configPath !== configPath || source.installationId !== ctx.config.installationId) throw new DomainError('SOURCE_CONFIG_MISMATCH');
  if (operation === 'install' && !isCodexSupported(source.version)) throw new DomainError('CODEX_VERSION_UNSUPPORTED');
  // Codex uses a shell command string, not Claude's exec-form args.
  const quote = (value: string) => {
    if (/[\x00-\x1f]/.test(value)) throw new DomainError('INVALID_PATH');
    return `'${value.replaceAll("'", "'\\''")}'`;
  };
  const command = [process.execPath, cli, 'hook', '--worklog-codex-v1', '--data-dir', ctx.config.dataDir, '--source-id', sourceId].map(quote).join(' ');
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const lockPath = `${configPath}.worklog.lock`;
  const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    let original = '';
    try {
      const info = await lstat(configPath);
      if (!info.isFile() || info.size > 1024 * 1024) throw new DomainError('INVALID_CODEX_CONFIG');
      original = await readFile(configPath, 'utf8');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const config: unknown = original ? JSON.parse(original) : {}; assertRecord(config);
    const hooks = config.hooks ?? {}; assertRecord(hooks);
    const nextHooks = { ...hooks };
    for (const event of codexHooks) {
      const groups = hooks[event] ?? [];
      if (!Array.isArray(groups)) throw new DomainError('INVALID_CODEX_HOOKS');
      const keptGroups = groups.flatMap((group: unknown) => {
        assertRecord(group);
        if (!Array.isArray(group.hooks)) throw new DomainError('INVALID_CODEX_HOOKS');
        const kept = group.hooks.filter((handler: unknown) => { assertRecord(handler); return handler.command !== command; });
        return kept.length === group.hooks.length ? [group] : kept.length ? [{ ...group, hooks: kept }] : [];
      });
      if (operation === 'install') keptGroups.push({ hooks: [{ type: 'command', command, timeout: 2 }] });
      if (keptGroups.length) nextHooks[event] = keptGroups; else delete nextHooks[event];
    }
    const next = { ...config, ...(Object.keys(nextHooks).length ? { hooks: nextHooks } : {}) };
    if (!Object.keys(nextHooks).length) delete next.hooks;
    if (JSON.stringify(config) !== JSON.stringify(next)) {
      if (operation === 'install') await lstat(cli).catch(() => { throw new DomainError('BUILD_REQUIRED'); });
      if (original) atomicPrivate(`${configPath}.worklog-backup-${randomUUID()}`, original);
      let current = '';
      try { current = await readFile(configPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (current !== original) throw new DomainError('CODEX_CONFIG_CHANGED', 409);
      atomicPrivate(configPath, `${JSON.stringify(next, null, 2)}\n`);
    }
    if (source.enabled !== (operation === 'install')) registerSource(ctx, { ...source, enabled: operation === 'install' });
    if (operation === 'install') sourceInstalled(ctx, sourceId);
  } finally { await lock.close(); await unlink(lockPath); }
}
