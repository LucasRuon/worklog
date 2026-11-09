import { createHash } from 'node:crypto';
import { existsSync, openSync, readSync, closeSync, realpathSync, statSync, lstatSync, constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { inside } from './context.js';
import { canonicalPath, gitRead } from './projects.js';
import { assertRecord, type AppContext, type ProjectRoot, type PolicyConfig, type CaptureDecision, type SourceRegistration, type EventInput } from './contracts.js';
import { validateEvent } from './events.js';

export const defaultPolicy: PolicyConfig = { maxTextBytes: 2 * 1024 * 1024, allowExamples: [], excludedPaths: [] };
export function policyFor(ctx: AppContext): PolicyConfig {
  const config = JSON.parse(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'operatingConfig'")?.value ?? '{}') as { excludedPaths?: string[] };
  return { ...defaultPolicy, excludedPaths: config.excludedPaths ?? [] };
}
const excludedDirectories = new Set(['.git', '.claude', '.codex', '.opencode', '.ssh', '.aws', 'node_modules', 'dist', 'build', 'coverage', '.next', '.venv', 'vendor', 'test-results', 'playwright-report']);

// Git fornece nomes NUL-delimitados: quebras de linha são nomes válidos, não separadores.
export function gitPathAllowed(path: string, config: PolicyConfig = defaultPolicy): boolean {
  if (!path || path.length > 4096 || path.includes('\0') || isAbsolute(path) || path.split('/').some((part) => part === '..' || excludedDirectories.has(part))) return false;
  if (path.split('/').some((part) => /^(?:\.env|id_rsa|id_ed25519|credentials(?:\.|$)|auth\.json$|\.npmrc$|\.netrc$)/i.test(part) || /\.(?:pem|key|p12|pfx|keystore)$/i.test(part)) || config.excludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) return false;
  return true;
}
export function gitMetadataAllowed(root: ProjectRoot, path: string, config: PolicyConfig = defaultPolicy): boolean {
  if (!gitPathAllowed(path, config)) return false;
  try {
    if ((root.id && realpathSync(root.path) !== root.path) || lstatSync(root.path).isSymbolicLink()) return false;
    if (!inside(realpathSync(root.path), canonicalPath(resolve(root.worktree ?? root.path, path)))) return false;
    try { gitRead(root.worktree ?? root.path, ['check-ignore', '--no-index', '--quiet', '--', path]); return false; }
    catch (error) { return (error as { status?: number }).status === 1; }
  } catch { return false; }
}

export function captureDecision(root: ProjectRoot, path: string, config: PolicyConfig = defaultPolicy, options: { gitChecked?: boolean } = {}): CaptureDecision {
  const deny = (reason: string): CaptureDecision => ({ metadata: false, content: false, reason });
  if (!root.enabled && root.enabled !== undefined) return deny('paused');
  if (typeof path !== 'string' || path.length > 4096 || /[\x00-\x1f]/.test(path) || path.split(/[\\/]/).includes('..')) return deny('invalid-path');
  try {
    const base = realpathSync(root.path);
    if ((root.id && base !== root.path) || lstatSync(root.path).isSymbolicLink()) return deny('outside-root');
    const target = canonicalPath(isAbsolute(path) ? path : resolve(base, path));
    if (!inside(base, target)) return deny('outside-root');
    const name = relative(base, target).replaceAll('\\', '/');
    const parts = name.split('/');
    if (parts.some((part) => excludedDirectories.has(part)) || config.excludedPaths.some((excluded) => name === excluded || name.startsWith(`${excluded}/`))) return deny('excluded');
    const exampleAllowed = config.allowExamples.includes(name) && /(?:^|\/)\.env\.(?:example|sample|template)$/.test(name);
    if (parts.some((part) => /^(?:\.env|id_rsa|id_ed25519|credentials(?:\.|$)|auth\.json$|\.npmrc$|\.netrc$)/i.test(part) || /\.(?:pem|key|p12|pfx|keystore)$/i.test(part)) && !exampleAllowed) return deny('sensitive');
    if (!options.gitChecked) try {
      gitRead(base, ['rev-parse', '--is-inside-work-tree']);
      try { gitRead(base, ['check-ignore', '--no-index', '--quiet', '--', name || '.']); return deny('gitignored'); }
      catch (error) { if ((error as { status?: number }).status !== 1) return deny('ignore-unavailable'); }
    } catch { /* Pasta sem Git: ainda se aplica a política explícita. */ }
    if (!existsSync(target)) return { metadata: true, content: false, reason: 'missing', relativePath: name };
    const info = statSync(target);
    if (!info.isFile()) return { metadata: true, content: false, reason: 'not-file', relativePath: name };
    if (info.size > config.maxTextBytes) return { metadata: true, content: false, reason: 'too-large', relativePath: name };
    const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const bytes = Buffer.alloc(Math.min(8192, info.size));
    try { readSync(descriptor, bytes, 0, bytes.length, 0); } finally { closeSync(descriptor); }
    if (bytes.includes(0) || /\.(?:png|jpe?g|gif|pdf|zip|gz|woff2?|mp[34]|sqlite|db)$/i.test(name)) return { metadata: true, content: false, reason: 'binary', relativePath: name };
    return { metadata: true, content: true, reason: exampleAllowed ? 'explicit-example' : 'eligible', relativePath: name };
  } catch { return deny('unavailable'); }
}

export function stableId(...parts: string[]): string {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function normalizeEvent(source: SourceRegistration, raw: unknown): EventInput[] {
  if (!source.enabled) return [];
  try {
    assertRecord(raw);
    if (Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024 || typeof raw.originId !== 'string' || raw.originId.length < 1 || raw.originId.length > 512) return [];
    const value = {
      schemaVersion: 1, eventId: stableId(source.id, raw.originId, String(raw.type)), deviceId: source.deviceId, installationId: source.installationId, sourceId: source.id,
      tool: source.tool, type: raw.type, occurredAt: raw.occurredAt, payload: raw.payload,
      ...Object.fromEntries(['nativeSessionId', 'nativeAgentId', 'parentSessionId', 'cwd'].filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]])),
    };
    validateEvent(value);
    return [value];
  } catch { return []; }
}
