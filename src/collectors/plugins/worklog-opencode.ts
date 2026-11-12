import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, join } from 'node:path';
import { isOpenCodeV2, projectV2Event, v2EventTypes, type PluginRecord } from './opencode-projector.js';
import { linkedRoot } from '../../core/worktrees.js';

interface PluginContext {
  app: { version: string }; location: { directory: string };
  event: { subscribe(options: { types: string[]; signal: AbortSignal }): AsyncIterable<unknown> };
  session: { get(input: { sessionID: string }): Promise<{ location: { directory: string }; parentID?: string }>; list?(input: { directory: string; limit: number }): Promise<unknown> };
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void>; scan(options: { prefix: string; limit: number }): Promise<{ entries: { key: string; value: unknown }[] }> };
}
export function createWorklogPlugin(options: { nodePath: string; cliPath: string; dataDir: string; sourceId: string }) {
  return {
    id: 'worklog',
    async setup(ctx: PluginContext) {
      const version = ctx.app.version.replace(/^v/, '');
      if (!isOpenCodeV2(version)) { await ctx.storage.set('worklog.health', 'unsupported-version'); return; }
      try {
        const manifest = JSON.parse(readFileSync(join(options.dataDir, 'capture.json'), 'utf8')) as { sources: { id: string; version: string }[] };
        if (!manifest.sources.some((source) => source.id === options.sourceId && isOpenCodeV2(source.version))) { await ctx.storage.set('worklog.health', 'source-unavailable'); return; }
      } catch { await ctx.storage.set('worklog.health', 'capture-unavailable'); return; }
      const controller = new AbortController(); let flushing = false;
      const sessions = new Map<string, { cwd: string; parentID?: string }>();
      const initializing = new Map<string, Promise<PluginRecord>>();
      const firstRecord = (sid: string, fallback: PluginRecord) => {
        const existing = initializing.get(sid); if (existing) return existing;
        const pending = (async () => {
          const key = `worklog.first/${sid}`; const saved = await ctx.storage.get(key) as PluginRecord | undefined;
          if (saved) return saved;
          await ctx.storage.set(key, fallback); return fallback;
        })();
        if (initializing.size >= 1000) initializing.delete(initializing.keys().next().value!);
        initializing.set(sid, pending); void pending.catch(() => initializing.delete(sid)); return pending;
      };
      const allowed = (directory: string) => {
        try {
          const cwd = realpathSync(directory);
           const config = JSON.parse(readFileSync(join(options.dataDir, 'capture.json'), 'utf8')) as { sources: { id: string; deviceId: string; enabled: boolean; version: string }[]; roots: { deviceId: string; path: string; enabled: boolean }[]; workspaces?: string[]; policy?: { excludedPaths?: string[] } };
           const source = config.sources.find((source) => source.id === options.sourceId && source.enabled && isOpenCodeV2(source.version));
          if (!source) return false;
          const contains = (parent: string) => { const path = relative(parent, cwd); return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../')); };
          const root = config.roots.filter((root) => root.deviceId === source.deviceId && contains(root.path)).sort((a, b) => b.path.length - a.path.length)[0];
          if (root && !root.enabled) return false;
          // Worktree Git de uma raiz ativa conta como o mesmo projeto, mesmo fora da pasta da raiz.
          const linked = root ? undefined : linkedRoot(config.roots.filter((candidate) => candidate.deviceId === source.deviceId && candidate.enabled), cwd);
          const workspace = root || linked ? undefined : config.workspaces?.find((path) => path !== cwd && contains(path));
          const base = root?.path ?? (linked ? cwd : workspace);
          if (!base) return false;
          const path = relative(base, cwd);
          if (config.policy?.excludedPaths?.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) return false;
          return !relative(base, cwd).split('/').some((part) => ['.git', '.claude', '.codex', '.opencode', '.ssh', '.aws', 'node_modules', 'dist', 'build', '.venv'].includes(part) || part.startsWith('.env'));
        } catch { return false; }
      };
      const send = (records: PluginRecord[]) => new Promise<void>((resolve, reject) => {
        const child = execFile(options.nodePath, [options.cliPath, 'plugin-event', '--data-dir', options.dataDir, '--source-id', options.sourceId], { timeout: 2500, maxBuffer: 4096, signal: controller.signal }, (error) => error ? reject(new Error('capture-unavailable')) : resolve());
        child.stdin?.end(JSON.stringify(records));
      });
      const dispatch = async (records: PluginRecord[]) => {
        const backlog = await ctx.storage.scan({ prefix: 'worklog.pending/', limit: 1000 });
        if (backlog.entries.length >= 1000) { await ctx.storage.set('worklog.health', 'outbox-overflow'); return; }
        const key = `worklog.pending/${randomUUID()}`; await ctx.storage.set(key, records);
        try { await send(records); await ctx.storage.remove(key); await ctx.storage.set('worklog.health', 'ok'); }
        catch { await ctx.storage.set('worklog.health', 'capture-unavailable'); }
      };
      const flush = async () => {
        if (flushing || controller.signal.aborted) return;
        flushing = true;
        try {
          const pending = await ctx.storage.scan({ prefix: 'worklog.pending/', limit: 20 });
          for (const item of pending.entries) {
            if (controller.signal.aborted) break;
            if (!(item.value as PluginRecord[])[0] || !allowed((item.value as PluginRecord[])[0]!.cwd)) continue;
            try { await send(item.value as PluginRecord[]); await ctx.storage.remove(item.key); }
            catch { await ctx.storage.set('worklog.health', 'capture-unavailable'); break; }
          }
        } finally { flushing = false; }
      };
      const timer = setInterval(() => { void flush().catch(() => {}); }, 5000); timer.unref();
      void (async () => {
        await flush();
        while (!controller.signal.aborted) {
        try {
        for await (const raw of ctx.event.subscribe({ types: [...v2EventTypes], signal: controller.signal })) {
          try {
          if (!raw || typeof raw !== 'object') continue;
          const event = raw as { id: string; created: number; type: string; location?: { directory?: string }; data: { sessionID?: string; location?: { directory?: string }; parentID?: string; id?: string; name?: string; assistantMessageID?: string } };
          const sid = event.data?.sessionID; if (!sid) continue;
          let session = sessions.get(sid);
          if (!session) {
            const location = event.data.location ?? event.location;
            if (location?.directory) session = { cwd: location.directory, parentID: event.data.parentID };
            else { const info = await ctx.session.get({ sessionID: sid }); session = { cwd: info.location.directory, parentID: info.parentID }; }
            if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
            sessions.set(sid, session);
          }
          if (session.cwd !== ctx.location.directory) continue;
          if (!allowed(session.cwd)) continue;
          const toolKey = `worklog.tool/${sid}/${event.data.assistantMessageID ?? ''}/${event.data.id ?? ''}`;
          if (event.type === 'session.tool.input.started') {
            if (typeof event.data.name === 'string') await ctx.storage.set(toolKey, event.data.name);
            continue;
          }
          const toolName = event.type.startsWith('session.tool.') ? await ctx.storage.get(toolKey) : undefined;
          const projected = projectV2Event(raw, { cwd: session.cwd, parentSessionId: session.parentID, toolName: typeof toolName === 'string' ? toolName : undefined });
          if (!projected) continue;
          const first = await firstRecord(sid, event.type === 'session.created' ? projected : { ...projected, originId: `${sid}:observed-start`, type: 'session.start', payload: { reason: 'resume' } });
          const records = projected.originId === first.originId ? [projected] : [first, projected];
          await dispatch(records);
          } catch { if (!controller.signal.aborted) await ctx.storage.set('worklog.health', 'event-unavailable'); }
        }
        } catch { if (!controller.signal.aborted) await ctx.storage.set('worklog.health', 'stream-gap'); }
        if (!controller.signal.aborted) await new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timeout); controller.signal.removeEventListener('abort', finish); resolve(); };
          const timeout = setTimeout(finish, 1000); controller.signal.addEventListener('abort', finish, { once: true });
        });
        }
      })().catch(() => { if (!controller.signal.aborted) void ctx.storage.set('worklog.health', 'stream-gap').catch(() => {}); });
      void (async () => {
        if (!allowed(ctx.location.directory) || !ctx.session.list) return;
        const response = await ctx.session.list({ directory: ctx.location.directory, limit: 20 }) as { data?: unknown[] } | unknown[];
        const items = Array.isArray(response) ? response : response.data ?? [];
        const observed = Date.now();
        for (const item of items) {
          if (controller.signal.aborted || !item || typeof item !== 'object') continue;
          const info = item as { id?: string; parentID?: string; location?: { directory?: string }; time?: { created?: number; updated?: number; busy?: number; idle?: number } };
          if (!info.id || info.location?.directory !== ctx.location.directory || !info.time || ((info.time.updated ?? 0) < observed - 60_000 && (info.time.busy ?? 0) <= (info.time.idle ?? 0))) continue;
          const first = await firstRecord(info.id, { originId: `${info.id}:observed-start`, occurredAt: new Date(observed).toISOString(), nativeSessionId: info.id, ...(info.parentID ? { parentSessionId: info.parentID } : {}), cwd: ctx.location.directory, type: 'session.start', payload: { reason: 'resume' } });
          await dispatch([first]);
        }
      })().catch(() => { if (!controller.signal.aborted) void ctx.storage.set('worklog.health', 'bootstrap-unavailable').catch(() => {}); });
      return () => { controller.abort(); clearInterval(timer); };
    },
  };
}
