import { assertRecord, DomainError, shortId, type AppContext, type SourceRegistration } from '../core/contracts.js';
import { normalizeEvent } from '../core/policy.js';
import { resolveProject } from '../core/projects.js';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isOpenCodeV2, projectV2Event, v2EventTypes } from './plugins/opencode-projector.js';

const ignoredTypes = new Set([
  'session.agent.selected', 'session.model.selected', 'session.renamed', 'session.metadata.updated', 'session.permissions',
  'session.viewed', 'session.archived', 'session.unarchived', 'session.deleted', 'session.forked',
  'session.inbox.enqueued', 'session.inbox.cancelled', 'session.inbox.delivery.changed',
  'session.execution.started', 'session.execution.succeeded', 'session.instructions.updated', 'session.synthetic',
  'session.skill.activated', 'session.shell.started', 'session.shell.ended', 'session.step.streamed',
  'session.text.started', 'session.text.ended', 'session.reasoning.started', 'session.reasoning.ended',
  'session.tool.input.ended', 'session.retry.scheduled', 'session.compaction.ended', 'session.compaction.failed',
  'session.revert.staged', 'session.revert.cleared', 'session.revert.committed', 'session.usage.recorded', 'session.message.content.updated',
]);
function nativeId(value: unknown): asserts value is string {
  try { shortId(value); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
}
function safeTime(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > Date.now() + 60000 || !Number.isFinite(new Date(Number(value)).getTime())) throw new DomainError('HISTORY_RECORD_INVALID');
}
function readLog(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > 64 * 1024 * 1024) throw new DomainError('HISTORY_INPUT_TOO_LARGE');
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) throw new DomainError('HISTORY_INPUT_CHANGED'); offset += count; }
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new DomainError('HISTORY_INPUT_CHANGED');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
  } finally { closeSync(fd); }
}

/** Offline durable log: replay its context, persist only the shared allowlisted projection. */
export function* openCodeLogRecords(ctx: AppContext, source: SourceRegistration, path: string) {
  if (source.tool !== 'opencode') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  if (!isOpenCodeV2(source.version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const bytes = readLog(path);
  const tools = new Map<string, string>(); let sessionId: string | undefined; let cwd = ''; let parentSessionId: string | undefined;
  const ids = new Set<string>(); const publicGaps = source.version !== '2.2.5';
  let seq: number | undefined; let synced = false; let frames = 0;
  const authorize = (directory: unknown) => {
    if (typeof directory !== 'string' || resolveProject(ctx, source.deviceId, directory).state !== 'matched') throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
    return directory;
  };
  const blocks = bytes.split(/\r?\n\r?\n/);
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    if (!block.trim()) continue;
    if (Buffer.byteLength(block) > 1024 * 1024) throw new DomainError('HISTORY_RECORD_TOO_LARGE');
    if (index === blocks.length - 1) throw new DomainError('HISTORY_TRUNCATED');
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    if (synced) throw new DomainError('HISTORY_SEQUENCE_INVALID');
    if (++frames > 10000) throw new DomainError('HISTORY_NATIVE_SCAN_LIMIT');
    let raw: unknown;
    try { raw = JSON.parse(data); assertRecord(raw); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
    if (raw.type === 'log.synced') {
      if (!sessionId) throw new DomainError('HISTORY_UNAVAILABLE');
      if (raw.aggregateID !== sessionId || !Number.isSafeInteger(raw.seq) || Number(raw.seq) < seq! || (!publicGaps && raw.seq !== seq)) throw new DomainError('HISTORY_SEQUENCE_INVALID');
      if (raw.seq !== seq) yield { warning: 'HISTORY_PUBLIC_LOG_GAPS' };
      synced = true; continue;
    }
    if (!raw.durable || typeof raw.durable !== 'object' || Array.isArray(raw.durable) || (raw.durable as Record<string, unknown>).version !== 1) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
    const durable = raw.durable as Record<string, unknown>;
    if (!Number.isSafeInteger(durable.seq) || Number(durable.seq) < 0 || (seq !== undefined && (Number(durable.seq) <= seq || (!publicGaps && durable.seq !== seq + 1)))) throw new DomainError('HISTORY_SEQUENCE_INVALID');
    if (seq !== undefined && durable.seq !== seq + 1) yield { warning: 'HISTORY_PUBLIC_LOG_GAPS' };
    seq = Number(durable.seq); nativeId(raw.id); safeTime(raw.created);
    if (ids.has(raw.id)) throw new DomainError('HISTORY_SEQUENCE_INVALID');
    ids.add(raw.id);
    try { assertRecord(raw.data); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
    nativeId(raw.data.sessionID);
    if (!sessionId) {
      if (raw.type !== 'session.created' || seq > 1) throw new DomainError('HISTORY_TRUNCATED');
      if (!isOpenCodeV2(raw.data.version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
      sessionId = raw.data.sessionID;
      if (raw.data.parentID !== undefined) { nativeId(raw.data.parentID); parentSessionId = raw.data.parentID; }
      const location = raw.data.location as Record<string, unknown> | undefined;
      cwd = authorize(location?.directory);
    } else if (raw.type === 'session.created') throw new DomainError('HISTORY_SEQUENCE_INVALID');
    if (raw.data.sessionID !== sessionId || durable.aggregateID !== sessionId) throw new DomainError('HISTORY_SOURCE_MISMATCH');
    if (raw.location !== undefined) { assertRecord(raw.location); cwd = authorize(raw.location.directory); }
    if (raw.type === 'session.moved') {
      const location = raw.data.location as Record<string, unknown> | undefined; cwd = authorize(location?.directory); continue;
    }
    if (typeof raw.type !== 'string') throw new DomainError('HISTORY_RECORD_INVALID');
    if (ignoredTypes.has(raw.type)) continue;
    if (!(v2EventTypes as readonly string[]).includes(raw.type)) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
    if (raw.type.startsWith('session.step.')) nativeId(raw.data.assistantMessageID);
    if (raw.type === 'session.inbox.delivered') nativeId(raw.data.inboxID);
    const toolKey = `${String(raw.data.assistantMessageID)}:${String(raw.data.id)}`;
    if (raw.type.startsWith('session.tool.')) { nativeId(raw.data.assistantMessageID); nativeId(raw.data.id); }
    if (raw.type === 'session.tool.input.started') {
      if (typeof raw.data.name !== 'string' || !raw.data.name || raw.data.name.length > 120) throw new DomainError('HISTORY_RECORD_INVALID');
      tools.set(toolKey, raw.data.name); continue;
    }
    const projected = projectV2Event(raw, { cwd, parentSessionId, toolName: tools.get(toolKey) });
    if (!projected) throw new DomainError('HISTORY_RECORD_INVALID');
    const values = normalizeEvent(source, projected);
    if (values.length !== 1) throw new DomainError('HISTORY_RECORD_INVALID');
    yield { value: values[0]! };
  }
  if (!synced) throw new DomainError('HISTORY_TRUNCATED');
}
