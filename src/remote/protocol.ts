import { hostname, platform } from 'node:os';
import { assertRecord, exactKeys, shortId, utc, uuid, DomainError, type AppContext, type EventBatch, type ProjectRoot, type SourceRegistration } from '../core/contracts.js';
import { readBatch, importBatch, registerInstallation, validateEvent } from '../core/events.js';
import { listSources, registerSource } from '../collectors/source-config.js';
import { listProjects, normalizeRemote, registerProjectRoot } from '../core/projects.js';
import { projectSessions } from '../core/sessions.js';

export interface AgentEnvelope {
  protocolVersion: 1; generatedAt: string;
  identity: { deviceId: string; installationId: string; name: string; os: string; timezone: string };
  sources: SourceRegistration[]; roots: ProjectRoot[]; batch?: EventBatch;
  capabilities?: string[];
}
export function describeAgent(ctx: AppContext): AgentEnvelope {
  const roots = listProjects(ctx).flatMap((project) => project.roots.filter((root) => root.deviceId === ctx.config.deviceId).map((root) => {
    const canonical = root.repositoryId ? ctx.db.get<{ canonical: string }>('SELECT canonical FROM repositories WHERE id = ?', root.repositoryId)?.canonical : undefined;
    const { repositoryId: _, ...value } = root;
    return { ...value, ...(canonical && !canonical.startsWith('local:') ? { remote: `https://${canonical}` } : {}) };
  }));
  return { protocolVersion: 1, capabilities: ['git-v1', 'files-v1'], generatedAt: new Date().toISOString(), identity: { deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, name: hostname(), os: platform(), timezone: ctx.config.timezone }, sources: listSources(ctx).filter((source) => source.installationId === ctx.config.installationId), roots };
}
export function exportBatch(ctx: AppContext, seq: number, limit = 500): AgentEnvelope {
  return { ...describeAgent(ctx), batch: readBatch(ctx, { installationId: ctx.config.installationId, seq }, limit) };
}
export function validateEnvelope(value: unknown): asserts value is AgentEnvelope {
  assertRecord(value); exactKeys(value, ['protocolVersion', 'generatedAt', 'identity', 'sources', 'roots'], ['batch', 'capabilities']);
  if (value.capabilities !== undefined && (!Array.isArray(value.capabilities) || value.capabilities.length > 10 || value.capabilities.some((c) => typeof c !== 'string' || c.length > 40))) throw new DomainError('REMOTE_PROTOCOL_UNSUPPORTED');
  if (value.protocolVersion !== 1) throw new DomainError('REMOTE_PROTOCOL_UNSUPPORTED'); utc(value.generatedAt);
  assertRecord(value.identity); exactKeys(value.identity, ['deviceId', 'installationId', 'name', 'os', 'timezone']);
  uuid(value.identity.deviceId); uuid(value.identity.installationId);
  for (const key of ['name', 'os', 'timezone']) if (typeof value.identity[key] !== 'string' || String(value.identity[key]).length > 160 || !value.identity[key]) throw new DomainError('REMOTE_IDENTITY_INVALID');
  if (!Array.isArray(value.sources) || value.sources.length > 100 || !Array.isArray(value.roots) || value.roots.length > 1000) throw new DomainError('REMOTE_MANIFEST_TOO_LARGE');
  const sourceIds = new Set<string>();
  for (const input of value.sources) {
    assertRecord(input); exactKeys(input, ['id', 'deviceId', 'installationId', 'tool', 'profile', 'configPath', 'version', 'enabled']);
    uuid(input.id);
    if (sourceIds.has(input.id) || input.deviceId !== value.identity.deviceId || input.installationId !== value.identity.installationId || !['claude', 'opencode', 'codex', 'git', 'files', 'focus'].includes(String(input.tool)) || typeof input.enabled !== 'boolean') throw new DomainError('REMOTE_SOURCE_INVALID');
    if (typeof input.configPath !== 'string' || !input.configPath.startsWith('/') || input.configPath.length > 4096 || /[\x00-\x1f]/.test(input.configPath)) throw new DomainError('REMOTE_SOURCE_INVALID');
    for (const key of ['profile', 'version']) if (typeof input[key] !== 'string' || !/^[A-Za-z0-9_. -]{1,120}$/.test(String(input[key]))) throw new DomainError('REMOTE_SOURCE_INVALID');
    sourceIds.add(input.id);
  }
  for (const root of value.roots) {
    assertRecord(root); exactKeys(root, ['id', 'projectId', 'projectName', 'deviceId', 'path', 'worktree', 'enabled'], ['client', 'remote']);
    uuid(root.id); uuid(root.projectId);
    if (root.deviceId !== value.identity.deviceId || typeof root.enabled !== 'boolean' || typeof root.projectName !== 'string' || root.projectName.length < 1 || root.projectName.length > 160 || (root.client !== undefined && (typeof root.client !== 'string' || root.client.length > 160))) throw new DomainError('REMOTE_ROOT_INVALID');
    for (const key of ['path', 'worktree']) if (typeof root[key] !== 'string' || !String(root[key]).startsWith('/') || String(root[key]).length > 4096 || /[\x00-\x1f]/.test(String(root[key])) || String(root[key]).split('/').includes('..')) throw new DomainError('REMOTE_ROOT_INVALID');
    if (root.remote !== undefined) normalizeRemote(String(root.remote));
  }
  if (value.batch !== undefined) {
    assertRecord(value.batch); exactKeys(value.batch, ['schemaVersion', 'installationId', 'events', 'nextCursor', 'hasMore']);
    assertRecord(value.batch.nextCursor); exactKeys(value.batch.nextCursor, ['installationId', 'seq']);
    if (value.batch.schemaVersion !== 1 || value.batch.installationId !== value.identity.installationId || value.batch.nextCursor.installationId !== value.identity.installationId || !Number.isSafeInteger(value.batch.nextCursor.seq) || Number(value.batch.nextCursor.seq) < 0 || !Array.isArray(value.batch.events) || value.batch.events.length > 500 || typeof value.batch.hasMore !== 'boolean') throw new DomainError('REMOTE_BATCH_INVALID');
    for (const event of value.batch.events) {
      validateEvent(event, true);
      const source = value.sources.find((source) => source.id === event.sourceId);
      if (event.deviceId !== value.identity.deviceId || event.installationId !== value.identity.installationId || !source || source.tool !== event.tool) throw new DomainError('REMOTE_EVENT_IDENTITY_INVALID');
    }
  }
}
export function importEnvelope(ctx: AppContext, envelope: AgentEnvelope, clockSkewMs = 0) {
  validateEnvelope(envelope);
  if (!envelope.batch) throw new DomainError('REMOTE_BATCH_REQUIRED');
  registerInstallation(ctx, envelope.identity);
  for (const source of envelope.sources) registerSource(ctx, source);
  for (const root of envelope.roots) {
    registerProjectRoot(ctx, { ...root, ...(root.remote ? { projectId: undefined } : {}) });
  }
  const result = importBatch(ctx, envelope.batch, () => {
    if (Math.abs(clockSkewMs) > 60_000) {
      for (const event of envelope.batch!.events) ctx.db.run('INSERT OR IGNORE INTO event_quality VALUES (?, ?)', event.eventId, 'clock-skew');
    }
  });
  projectSessions(ctx, envelope.batch.events);
  return result;
}
