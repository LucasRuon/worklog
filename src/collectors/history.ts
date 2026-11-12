import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, openSync, readSync, readdirSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { assertRecord, exactKeys, DomainError, utc, uuid, type AppContext, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { appendEvent, validateEvent } from '../core/events.js';
import { stableId } from '../core/policy.js';
import { listProjects, resolveProject } from '../core/projects.js';
import { openReadonlyDatabase } from '../core/sqlite.js';
import { readPrivate } from '../core/private-files.js';
import { listSources } from './source-config.js';
import { prepareCapture } from './queue.js';
import { normalizeOpenCode } from './opencode.js';
import { nativeSession, readNativePage, validateNativeSchema, type ScanCursor } from './opencode-store.js';
import { scanCommits } from './git.js';
import { openCodeLogRecords } from './opencode-history.js';
import { openCodeDbV2Records } from './opencode-db-v2.js';
import { claudeTranscriptRecords } from './claude-transcripts.js';
import { codexRolloutRecords, type CodexHistoryRecord } from './codex-history.js';
import { canonicalCodexEvent } from './codex-receipts.js';
import { isCodexSupported } from './codex.js';

const parsers = ['normalized-v1', 'opencode-db-1.19.5', 'opencode-log-v1', 'opencode-db-v2', 'claude-transcript-v1', 'codex-receipts-v1', 'codex-rollout-0.167.0', 'codex-rollout-v2-0.167.0', 'codex-rollout-v3-0.167.0', 'codex-rollout-v4-0.167.0', 'git-v1'] as const;
type Parser = typeof parsers[number];
type Range = { from: string; to: string };
type Checkpoint = { offset: number; resource: string; digest: string };
type RecordInput = { value: unknown; checkpoint?: Checkpoint };
export interface HistoryResult { imported: number; skipped: number; warnings: string[]; complete: boolean }
interface ImportOptions { signal?: AbortSignal; limit?: number; onProgress?: () => void }

function validateRange(range: Range) { utc(range.from); utc(range.to); if (range.from >= range.to) throw new DomainError('INVALID_PERIOD'); }
function sourceFor(ctx: AppContext, id: string) {
  uuid(id); const source = listSources(ctx).find((source) => source.id === id);
  if (!source || !source.enabled || source.installationId !== ctx.config.installationId) throw new DomainError('HISTORY_SOURCE_UNAVAILABLE', 409);
  return source;
}
export function configureHistory(ctx: AppContext, sourceId: string, input: { parser: string; path: string }) {
  const source = sourceFor(ctx, sourceId); assertRecord(input); exactKeys(input, ['parser', 'path']);
  if (!parsers.includes(input.parser as Parser) || !isAbsolute(input.path) || input.path.length > 4096 || /[\x00-\x1f]/.test(input.path)) throw new DomainError('HISTORY_INPUT_INVALID');
  if (input.parser === 'git-v1' && source.tool !== 'git') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  if (['opencode-log-v1', 'opencode-db-v2'].includes(input.parser) && source.tool !== 'opencode') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  if (input.parser === 'claude-transcript-v1' && source.tool !== 'claude') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  if (['codex-rollout-0.167.0', 'codex-rollout-v2-0.167.0', 'codex-rollout-v3-0.167.0', 'codex-rollout-v4-0.167.0'].includes(input.parser) && source.tool !== 'codex') throw new DomainError('HISTORY_SOURCE_MISMATCH');
  ctx.db.run('INSERT INTO history_inputs VALUES (?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET parser = excluded.parser, path = excluded.path', sourceId, input.parser, input.path);
}

function hashPrefix(fd: number, end: number) {
  const hash = createHash('sha256'); const bytes = Buffer.alloc(64 * 1024);
  for (let offset = 0; offset < end;) { const count = readSync(fd, bytes, 0, Math.min(bytes.length, end - offset), offset); if (!count) throw new DomainError('HISTORY_INPUT_CHANGED'); hash.update(bytes.subarray(0, count)); offset += count; }
  return hash.digest('hex');
}

function* archiveRecords(path: string, source: SourceRegistration, checkpoint: Checkpoint): Generator<RecordInput> {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd); const resource = `${info.dev}:${info.ino}`;
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new DomainError('HISTORY_INPUT_TOO_LARGE');
    const resume = resource === checkpoint.resource && checkpoint.offset <= info.size && hashPrefix(fd, checkpoint.offset) === checkpoint.digest ? checkpoint.offset : 0;
    const hash = createHash('sha256'); const chunk = Buffer.alloc(64 * 1024); let pending = Buffer.alloc(0); let position = 0; let endOffset = 0; let lineNumber = 0;
    while (position < info.size) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, info.size - position), position); if (!count) break; position += count;
      pending = Buffer.concat([pending, chunk.subarray(0, count)]);
      let newline: number;
      while ((newline = pending.indexOf(10)) !== -1) {
        if (newline > 1024 * 1024) throw new DomainError('HISTORY_RECORD_TOO_LARGE');
        const line = pending.subarray(0, newline); hash.update(pending.subarray(0, newline + 1)); endOffset += newline + 1; pending = pending.subarray(newline + 1);
        lineNumber++;
        let value: unknown;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
        catch { throw new DomainError(lineNumber === 1 ? 'HISTORY_FORMAT_UNSUPPORTED' : 'HISTORY_RECORD_INVALID'); }
        if (lineNumber === 1) {
          try {
            assertRecord(value); exactKeys(value, ['format', 'schemaVersion', 'tool', 'version']);
            if (value.format !== 'worklog-history' || value.schemaVersion !== 1 || value.tool !== source.tool || value.version !== source.version) throw new Error();
          } catch { throw new DomainError('HISTORY_FORMAT_UNSUPPORTED'); }
          continue;
        }
        if (endOffset <= resume) continue;
        yield { value, checkpoint: { resource, offset: endOffset, digest: hash.copy().digest('hex') } };
      }
      if (pending.length > 1024 * 1024) throw new DomainError('HISTORY_RECORD_TOO_LARGE');
    }
    if (pending.length || !lineNumber) throw new DomainError('HISTORY_TRUNCATED');
  } finally { closeSync(fd); }
}

function* legacyRecords(ctx: AppContext, path: string, source: SourceRegistration): Generator<RecordInput> {
  if (source.tool !== 'opencode' || source.version !== '1.19.5') throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const db = openReadonlyDatabase(path);
  try {
    validateNativeSchema(db);
    const roots = listProjects(ctx).flatMap((p) => p.roots).filter((r) => r.deviceId === source.deviceId && r.enabled);
    if (!roots.length) throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
    // Read only IDs/cwds before authorization: native paths can use symlink aliases
    // (e.g. /var versus /private/var). No message/tool data is read outside roots.
    const sessions = db.all<{ id: string; cwd: string }>('SELECT id, directory AS cwd FROM session ORDER BY id LIMIT 10001');
    if (sessions.length > 10000) throw new DomainError('HISTORY_NATIVE_SCAN_LIMIT');
    for (const { id, cwd } of sessions) {
      if (resolveProject(ctx, source.deviceId, cwd).state !== 'matched') continue;
      const session = nativeSession(db, id)!;
      if (session.version !== '1.19.5') continue;
      if (resolveProject(ctx, source.deviceId, session.cwd).state !== 'matched') continue;
      const start = normalizeOpenCode(source, { ...session, kind: 'session', parentSessionId: session.parentSessionId, reason: session.parentSessionId ? 'subagent' : 'startup' });
      if (!start.length) throw new DomainError('HISTORY_RECORD_INVALID');
      // Authorize the native session before reading any of its message/tool fields.
      for (const value of prepareCapture(ctx.config.dataDir, start).events) yield { value };
      for (const kind of ['message', 'tool'] as const) {
        let cursor: ScanCursor = { watermark: 0, after: null };
        do {
          const page = readNativePage(db, session, 0, cursor, kind);
          for (const record of page.records) {
            const normalized = normalizeOpenCode(source, record);
            if (!normalized.length && !(record.kind === 'tool' && ['pending', 'running'].includes(record.status ?? '') && record.start == null && record.end == null)) throw new DomainError('HISTORY_RECORD_INVALID');
            for (const value of normalized) yield { value };
          }
          cursor = page.cursor;
        } while (cursor.after);
      }
    }
  } finally { db.close(); }
}

function* receiptRecords(ctx: AppContext, source: SourceRegistration): Generator<RecordInput> {
  if (source.tool !== 'codex' || !isCodexSupported(source.version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const directory = join(ctx.config.dataDir, 'codex-receipts');
  let names: string[];
  try { names = readdirSync(directory).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)).sort(); }
  catch { throw new DomainError('HISTORY_UNAVAILABLE'); }
  let found = false;
  for (const name of names) {
    const values: unknown = JSON.parse(readPrivate(join(directory, name), 64 * 1024));
    if (!Array.isArray(values) || values.length > 4) throw new DomainError('HISTORY_RECORD_INVALID');
    for (const value of values) {
      assertRecord(value); if (value.sourceId !== source.id) continue;
      found = true; yield { value };
    }
  }
  if (!found) throw new DomainError('HISTORY_UNAVAILABLE');
}

const running = new WeakMap<AppContext, Set<string>>();
export async function importHistory(ctx: AppContext, sourceId: string, range: Range, options: ImportOptions = {}): Promise<HistoryResult> {
  validateRange(range); const source = sourceFor(ctx, sourceId); const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new DomainError('INVALID_LIMIT');
  const input = ctx.db.get<{ parser: Parser; path: string }>('SELECT parser, path FROM history_inputs WHERE source_id = ?', sourceId) ?? (source.tool === 'codex' ? { parser: 'codex-receipts-v1' as const, path: ctx.config.dataDir } : source.tool === 'opencode' && source.version === '1.19.5' ? { parser: 'opencode-db-1.19.5' as const, path: source.configPath } : source.tool === 'git' ? { parser: 'git-v1' as const, path: source.configPath } : null);
  if (!input) return { imported: 0, skipped: 0, warnings: ['HISTORY_UNAVAILABLE'], complete: false };
  let active = running.get(ctx); if (!active) { active = new Set(); running.set(ctx, active); }
  if (active.has(sourceId)) throw new DomainError('HISTORY_ALREADY_RUNNING', 409); active.add(sourceId);
  const id = stableId(sourceId, input.parser, input.path, range.from, range.to);
  const previous = ctx.db.get<{ checkpoint: string }>('SELECT checkpoint FROM history_runs WHERE id = ?', id);
  let checkpoint: Checkpoint = previous ? JSON.parse(previous.checkpoint) as Checkpoint : { offset: 0, resource: '', digest: '' };
  const result: HistoryResult = { imported: 0, skipped: 0, warnings: [], complete: false };
  const warn = (code: string) => { if (!result.warnings.includes(code)) result.warnings.push(code); };
  const save = (state: string) => ctx.db.run('INSERT INTO history_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET checkpoint = excluded.checkpoint, state = excluded.state, imported = history_runs.imported + excluded.imported, skipped = history_runs.skipped + excluded.skipped, warnings = excluded.warnings, updated_at = excluded.updated_at', id, sourceId, input.parser, range.from, range.to, JSON.stringify(checkpoint), state, 0, 0, JSON.stringify(result.warnings), new Date().toISOString());
  try {
    save('running');
    if (input.parser === 'git-v1') {
      if (source.tool !== 'git') throw new DomainError('HISTORY_SOURCE_MISMATCH');
      const match = resolveProject(ctx, source.deviceId, input.path);
      const roots = listProjects(ctx).flatMap((p) => p.roots).filter((r) => match.state === 'matched' && r.id === match.rootId && r.deviceId === source.deviceId && r.enabled && r.repositoryId);
      if (!roots.length) throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
      for (const root of roots) {
        if (options.signal?.aborted) { warn('HISTORY_CANCELLED'); return result; }
        result.imported += (await scanCommits(ctx, root)).inserted;
        if (ctx.db.get<{ pending: number }>('SELECT pending FROM git_scans WHERE root_id = ?', root.id!)?.pending) warn('HISTORY_MORE_AVAILABLE');
      }
      // Git indexes repository objects independently of a report period; querying applies [from,to).
      result.complete = !result.warnings.length; return result;
    }
    const records: Iterable<RecordInput | CodexHistoryRecord> | null = input.parser === 'normalized-v1' ? archiveRecords(input.path, source, checkpoint) : input.parser === 'opencode-db-1.19.5' ? legacyRecords(ctx, input.path, source) : input.parser === 'opencode-log-v1' ? openCodeLogRecords(ctx, source, input.path) : input.parser === 'opencode-db-v2' ? openCodeDbV2Records(ctx, source, input.path) : input.parser === 'claude-transcript-v1' ? claudeTranscriptRecords(ctx, source, input.path, range.from) : input.parser === 'codex-receipts-v1' ? receiptRecords(ctx, source) : ['codex-rollout-0.167.0', 'codex-rollout-v2-0.167.0', 'codex-rollout-v3-0.167.0', 'codex-rollout-v4-0.167.0'].includes(input.parser) ? codexRolloutRecords(ctx, source, input.path, input.parser !== 'codex-rollout-0.167.0', ['codex-rollout-v3-0.167.0', 'codex-rollout-v4-0.167.0'].includes(input.parser), input.parser === 'codex-rollout-v4-0.167.0') : null;
    if (!records) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
    for (const item of records) {
      if (options.signal?.aborted) { warn('HISTORY_CANCELLED'); break; }
      if ('warning' in item) { warn(item.warning); continue; }
      const value = item.value;
      try { validateEvent(value); } catch { throw new DomainError('HISTORY_RECORD_INVALID'); }
      let event = value as EventInput;
      const itemCheckpoint = 'checkpoint' in item ? item.checkpoint : undefined;
      if (event.sourceId !== sourceId || event.installationId !== source.installationId || event.deviceId !== source.deviceId || event.tool !== source.tool) throw new DomainError('HISTORY_SOURCE_MISMATCH');
      if (!['session.start', 'session.end', 'session.interrupt', 'turn.submit', 'turn.start', 'turn.end', 'tool.start', 'tool.end'].includes(event.type)) throw new DomainError('HISTORY_RECORD_NOT_ALLOWED');
      if ('codexBatchIds' in item) {
        if (!event.cwd || resolveProject(ctx, event.deviceId, event.cwd).state !== 'matched') throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
        event = prepareCapture(ctx.config.dataDir, [event]).events[0]!;
        try {
          event = canonicalCodexEvent(ctx.config.dataDir, event, item.codexBatchIds, false);
          if (event.occurredAt >= range.from && event.occurredAt < range.to) event = canonicalCodexEvent(ctx.config.dataDir, event, item.codexBatchIds);
        } catch (error) { throw new DomainError(error instanceof DomainError && error.code === 'CODEX_EVENT_CONFLICT' ? 'HISTORY_EVENT_CONFLICT' : 'HISTORY_RECEIPT_UNAVAILABLE'); }
      }
      if (event.occurredAt < range.from || event.occurredAt >= range.to) {
        result.skipped++; if (itemCheckpoint) checkpoint = itemCheckpoint;
        ctx.db.transaction(() => { save('running'); ctx.db.run('UPDATE history_runs SET skipped = skipped + 1 WHERE id = ?', id); });
        await setImmediate(); continue;
      }
      if (!event.cwd || resolveProject(ctx, event.deviceId, event.cwd).state !== 'matched') throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
      const captured = prepareCapture(ctx.config.dataDir, [event]);
      // Match the live queue's canonical cwd without rewriting archive identities.
      if (input.parser === 'opencode-db-1.19.5' || input.parser === 'opencode-log-v1' || input.parser === 'opencode-db-v2' || input.parser === 'claude-transcript-v1') event = captured.events[0]!;
      // Legacy observers clamp the session-start time to the opt-in boundary. Preserve that immutable observation.
      if (input.parser === 'opencode-db-1.19.5' && event.type === 'session.start' && ctx.db.get('SELECT event_id FROM events WHERE event_id = ?', event.eventId)) { result.skipped++; await setImmediate(); continue; }
      const appended = appendEvent(ctx, event, (inserted) => {
        if (inserted) ctx.db.run('INSERT INTO event_provenance VALUES (?, ?, ?)', event.eventId, input.parser, new Date().toISOString());
        if (itemCheckpoint) checkpoint = itemCheckpoint;
        save('running');
        ctx.db.run('UPDATE history_runs SET imported = imported + ?, skipped = skipped + ? WHERE id = ?', Number(inserted), Number(!inserted), id);
      });
      result.imported += appended.inserted; result.skipped += appended.duplicates;
      options.onProgress?.();
      await setImmediate();
      if (result.imported >= limit) { warn('HISTORY_MORE_AVAILABLE'); break; }
    }
    result.complete = result.warnings.length === 0;
  } catch (error) {
    warn(error instanceof DomainError && error.code.startsWith('HISTORY_') ? error.code : 'HISTORY_READ_UNAVAILABLE');
  } finally {
    try { save(result.complete ? 'complete' : result.warnings.includes('HISTORY_CANCELLED') ? 'cancelled' : 'partial'); }
    finally { active.delete(sourceId); }
  }
  return result;
}

export function exportHistory(ctx: AppContext, sourceId: string, range: Range, path: string): { exported: number } {
  validateRange(range); const source = sourceFor(ctx, sourceId);
  if (!isAbsolute(path) || /[\x00-\x1f]/.test(path)) throw new DomainError('HISTORY_INPUT_INVALID');
  const rows = ctx.db.all<{ document: string }>('SELECT document FROM events WHERE source_id = ? AND occurred_at >= ? AND occurred_at < ? ORDER BY origin_seq LIMIT 10001', sourceId, range.from, range.to);
  if (rows.length > 10000) throw new DomainError('HISTORY_EXPORT_TOO_LARGE');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); let exported = 0;
  try {
    writeSync(fd, `${JSON.stringify({ format: 'worklog-history', schemaVersion: 1, tool: source.tool, version: source.version })}\n`);
    for (const row of rows) {
      const { originSeq: _, receivedAt: __, ...event } = JSON.parse(row.document);
      if (!['session.start', 'session.end', 'session.interrupt', 'turn.submit', 'turn.start', 'turn.end', 'tool.start', 'tool.end'].includes(event.type)) continue;
      if (!event.cwd || resolveProject(ctx, source.deviceId, event.cwd).state !== 'matched') continue;
      prepareCapture(ctx.config.dataDir, [event]); writeSync(fd, `${JSON.stringify(event)}\n`); exported++;
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
  return { exported };
}
