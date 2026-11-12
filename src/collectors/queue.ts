import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assertRecord, DomainError, uuid, type EventInput, type PolicyConfig, type ProjectRoot, type SourceRegistration } from '../core/contracts.js';
import { inside } from '../core/context.js';
import { validateEvent } from '../core/events.js';
import { captureDecision, defaultPolicy } from '../core/policy.js';
import { atomicPrivate, readPrivate } from '../core/private-files.js';
import { gitRead, normalizeRemote } from '../core/projects.js';
import { linkedRoot } from '../core/worktrees.js';

function manifest(dataDir: string) {
  const value: unknown = JSON.parse(readPrivate(join(dataDir, 'capture.json'))); assertRecord(value);
  if (value.schemaVersion !== 1 || !Array.isArray(value.sources) || !Array.isArray(value.roots)) throw new DomainError('INVALID_CAPTURE_CONFIG');
  return value as unknown as { schemaVersion: 1; sources: SourceRegistration[]; roots: ProjectRoot[]; workspaces?: string[]; policy?: PolicyConfig; taskTitles?: boolean };
}
export function captureSource(dataDir: string, sourceId: string) {
  uuid(sourceId);
  return manifest(dataDir).sources.find((source) => source.id === sourceId && source.enabled);
}

/** Captura de títulos de tasks é opt-in global; manifesto ausente ou antigo equivale a desligada. */
export function captureTaskTitles(dataDir: string) {
  try { return manifest(dataDir).taskTitles === true; } catch { return false; }
}

export function prepareCapture(dataDir: string, events: EventInput[]) {
  if (events.length > 4) throw new DomainError('QUEUE_BATCH_TOO_LARGE');
  const config = manifest(dataDir);
  const roots = new Map<string, { projectName: string; path: string; deviceId: string; workspace: string; remote?: string }>();
  const filtered = events.map((input) => {
    validateEvent(input);
    const source = config.sources.find((source) => source.id === input.sourceId && source.enabled);
    if (!source || source.deviceId !== input.deviceId || source.installationId !== input.installationId || source.tool !== input.tool || !input.cwd) throw new DomainError('CAPTURE_NOT_AUTHORIZED');
    const cwd = realpathSync(input.cwd);
    if (!statSync(cwd).isDirectory()) throw new DomainError('CAPTURE_NOT_AUTHORIZED');
    const explicit = config.roots.filter((root) => root.deviceId === source.deviceId).sort((a, b) => b.path.length - a.path.length).find((root) => inside(root.path, cwd));
    if (explicit?.enabled === false) throw new DomainError('CAPTURE_NOT_AUTHORIZED');
    // Precedência: raiz explícita, worktree vinculado a uma raiz ativa, workspace automático.
    const linked = explicit ? undefined : linkedRoot(config.roots.filter((root) => root.deviceId === source.deviceId && root.enabled !== false), cwd);
    const workspace = explicit || linked ? undefined : (config.workspaces ?? []).find((path) => path !== cwd && inside(path, cwd));
    const root = explicit ?? (linked ? { ...linked, path: cwd } : workspace ? { projectName: 'authorized', deviceId: source.deviceId, path: workspace } : null);
    if (!root || realpathSync(root.path) !== root.path || !captureDecision(root, cwd, config.policy ?? defaultPolicy).metadata) throw new DomainError('CAPTURE_NOT_AUTHORIZED');
    if (workspace) {
      let path: string;
      try { path = realpathSync(gitRead(cwd, ['rev-parse', '--show-toplevel'])); }
      catch { path = join(workspace, relative(workspace, cwd).split('/')[0]!); }
      if (!inside(workspace, path)) path = join(workspace, relative(workspace, cwd).split('/')[0]!);
      let remote: string | undefined;
      try { remote = `https://${normalizeRemote(gitRead(path, ['remote', 'get-url', 'origin']))}`; } catch { /* Associação sem remote permanece local. */ }
      roots.set(path, { projectName: basename(path).slice(0, 160), path, deviceId: source.deviceId, workspace, ...(remote ? { remote } : {}) });
    }
    return { ...input, cwd };
  });
  return { schemaVersion: 1, events: filtered, ...(roots.size ? { roots: [...roots.values()] } : {}) };
}

export function enqueueEvents(dataDir: string, events: EventInput[]): number {
  if (!events.length) return 0;
  const capture = prepareCapture(dataDir, events);
  const queue = join(dataDir, 'queue'); mkdirSync(queue, { recursive: true, mode: 0o700 });
  atomicPrivate(join(queue, `${Date.now()}-${String(process.hrtime.bigint()).padStart(20, '0')}-${randomUUID()}.json`), JSON.stringify(capture));
  return capture.events.length;
}
