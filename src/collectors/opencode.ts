import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { assertRecord, shortId, uuid, DomainError, type AppContext, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { normalizeEvent, stableId } from '../core/policy.js';
import { resolveProject } from '../core/projects.js';
import { openReadonlyDatabase } from '../core/sqlite.js';
import { appendEvent } from '../core/events.js';
import { listSources, registerSource } from './source-config.js';
import { enqueueEvents } from './queue.js';
import { latestSession, latestUserTime, nativeSession, readNativePage, validateNativeSchema, type ScanCursor } from './opencode-store.js';

const prefix = 'opencodeObserver:';
export const supportedOpenCodeVersion = '1.19.5';

function milliseconds(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > Date.now() + 60_000 || !Number.isFinite(new Date(Number(value)).getTime())) throw new DomainError('OPENCODE_INVALID_TIME');
  return Number(value);
}
export function normalizeOpenCode(source: SourceRegistration, raw: unknown): EventInput[] {
  try {
    assertRecord(raw);
    if (source.tool !== 'opencode' || source.version !== supportedOpenCodeVersion || Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024) return [];
    shortId(raw.id);
    const nativeSessionId = raw.kind === 'session' ? raw.id : raw.sessionId; shortId(nativeSessionId);
    const common = { nativeSessionId, ...(raw.parentSessionId ? { parentSessionId: raw.parentSessionId } : {}), cwd: raw.cwd };
    const output: EventInput[] = [];
    const add = (phase: string, type: string, at: unknown, payload: object) => {
      output.push(...normalizeEvent(source, { ...common, originId: `${nativeSessionId}:${String(raw.kind)}:${raw.id}:${phase}`, type, occurredAt: new Date(milliseconds(at)).toISOString(), payload }));
    };
    if (raw.kind === 'session') add('start', 'session.start', raw.created, { reason: ['startup', 'resume', 'subagent'].includes(String(raw.reason)) ? raw.reason : 'unknown' });
    else if (raw.kind === 'message') {
      if (raw.role === 'user') add('submit', 'turn.submit', raw.created, { turnId: raw.id });
      else if (raw.role === 'assistant') {
        add('start', 'turn.start', raw.created, { turnId: raw.id });
        if (raw.completed !== undefined && raw.completed !== null) {
          if (milliseconds(raw.completed) < milliseconds(raw.created)) return [];
          add('end', 'turn.end', raw.completed, { turnId: raw.id, outcome: raw.failed ? 'failed' : 'completed' });
        }
      }
    } else if (raw.kind === 'tool' && ['pending', 'running', 'completed', 'error'].includes(String(raw.status))) {
      if (raw.start !== undefined && raw.start !== null) add('start', 'tool.start', raw.start, { toolName: raw.toolName, toolUseId: raw.id });
      if (['completed', 'error'].includes(String(raw.status)) && raw.end !== undefined && raw.end !== null) {
        if (raw.start !== undefined && raw.start !== null && milliseconds(raw.end) < milliseconds(raw.start)) return [];
        add('end', 'tool.end', raw.end, { toolName: raw.toolName, toolUseId: raw.id, outcome: raw.status === 'error' ? 'failed' : 'completed' });
      }
    }
    return output;
  } catch { return []; }
}

interface Observer {
  schemaVersion: 1; parser: 'db-1.19.5'; sourceId: string; rootId: string; sessionId: string; from: number;
  messages: ScanCursor; parts: ScanCursor; lastPollAt: number; diagnostic: string | null;
}
function readObserver(value: unknown): Observer {
  assertRecord(value);
  if (value.schemaVersion !== 1 || value.parser !== 'db-1.19.5') throw new DomainError('OPENCODE_OBSERVER_UNSUPPORTED');
  uuid(value.sourceId); uuid(value.rootId); shortId(value.sessionId); milliseconds(value.from);
  for (const key of ['messages', 'parts']) {
    assertRecord(value[key]); milliseconds(value[key].watermark);
    if (value[key].after !== null) { assertRecord(value[key].after); milliseconds(value[key].after.time); shortId(value[key].after.id); }
  }
  if (!Number.isSafeInteger(value.lastPollAt) || Number(value.lastPollAt) < 0 || (value.diagnostic !== null && typeof value.diagnostic !== 'string')) throw new DomainError('OPENCODE_OBSERVER_INVALID');
  return value as unknown as Observer;
}
function saveObserver(ctx: AppContext, observer: Observer) {
  ctx.db.run('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', `${prefix}${observer.sourceId}`, JSON.stringify(observer));
}

export function connectOpenCode(ctx: AppContext, options: { databasePath: string; rootPath: string; sessionId?: string; profile?: string }) {
  if (!isAbsolute(options.databasePath) || !isAbsolute(options.rootPath)) throw new DomainError('OPENCODE_ABSOLUTE_PATH_REQUIRED');
  const databasePath = realpathSync(options.databasePath); const rootPath = realpathSync(options.rootPath);
  const root = resolveProject(ctx, ctx.config.deviceId, rootPath);
  if (root.state !== 'matched') throw new DomainError('OPENCODE_ROOT_UNAUTHORIZED');
  const db = openReadonlyDatabase(databasePath);
  let sessionId: string; let from: number;
  try {
    validateNativeSchema(db);
    const selected = options.sessionId ?? latestSession(db, [...new Set([options.rootPath, rootPath])]);
    if (!selected) throw new DomainError('OPENCODE_SESSION_NOT_FOUND');
    shortId(selected); sessionId = selected;
    const session = nativeSession(db, sessionId);
    if (!session) throw new DomainError('OPENCODE_SESSION_NOT_FOUND');
    if (session.version !== supportedOpenCodeVersion) throw new DomainError('OPENCODE_VERSION_UNSUPPORTED');
    const matched = resolveProject(ctx, ctx.config.deviceId, session.cwd);
    if (matched.state !== 'matched' || matched.rootId !== root.rootId) throw new DomainError('OPENCODE_SESSION_UNAUTHORIZED');
    from = milliseconds(latestUserTime(db, sessionId) ?? Date.now());
  } finally { db.close(); }
  const sourceId = stableId(ctx.config.installationId, 'opencode-db', databasePath);
  const previous = ctx.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', `${prefix}${sourceId}`);
  const existing = previous ? readObserver(JSON.parse(previous.value)) : null;
  registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'opencode', profile: options.profile ?? 'local-db', configPath: databasePath, version: supportedOpenCodeVersion, enabled: true });
  if (!existing || existing.sessionId !== sessionId || existing.rootId !== root.rootId) {
    saveObserver(ctx, { schemaVersion: 1, parser: 'db-1.19.5', sourceId, rootId: root.rootId, sessionId, from, messages: { watermark: from, after: null }, parts: { watermark: from, after: null }, lastPollAt: 0, diagnostic: null });
  }
  return { sourceId, sessionId, from: new Date(existing?.sessionId === sessionId && existing.rootId === root.rootId ? existing.from : from).toISOString(), transport: 'native-db-readonly' };
}

export interface OpenCodePollResult { sourceId: string; status: 'ok' | 'error'; queued: number; duplicates: number; diagnostic: string | null }
export function pollOpenCode(ctx: AppContext, options: { force?: boolean } = {}): OpenCodePollResult[] {
  const sources = new Map(listSources(ctx).filter((source) => source.tool === 'opencode' && source.enabled && source.deviceId === ctx.config.deviceId).map((source) => [source.id, source]));
  const results: OpenCodePollResult[] = [];
  for (const row of ctx.db.all<{ key: string; value: string }>('SELECT key, value FROM settings WHERE key LIKE ?', `${prefix}%`)) {
    const id = row.key.slice(prefix.length); const source = sources.get(id); if (!source) continue;
    let observer: Observer | undefined; let queued = 0; let duplicates = 0;
    try {
      observer = readObserver(JSON.parse(row.value));
      if (observer.sourceId !== id || source.version !== supportedOpenCodeVersion) throw new DomainError('OPENCODE_OBSERVER_INVALID');
      if (!options.force && Date.now() - observer.lastPollAt < (observer.diagnostic ? 5000 : 1000)) {
        results.push({ sourceId: id, status: observer.diagnostic ? 'error' : 'ok', queued: 0, duplicates: 0, diagnostic: observer.diagnostic });
        continue;
      }
      const db = openReadonlyDatabase(source.configPath);
      try {
        validateNativeSchema(db);
        const session = nativeSession(db, observer.sessionId);
        if (!session) throw new DomainError('OPENCODE_SESSION_NOT_FOUND');
        if (session.version !== supportedOpenCodeVersion) throw new DomainError('OPENCODE_VERSION_UNSUPPORTED');
        const match = resolveProject(ctx, ctx.config.deviceId, session.cwd);
        if (match.state !== 'matched' || match.rootId !== observer.rootId) throw new DomainError('OPENCODE_SESSION_UNAUTHORIZED');
        const cwd = realpathSync(session.cwd);
        const store = (record: unknown) => {
          const events = normalizeOpenCode(source, record);
          const pending: EventInput[] = [];
          for (const event of events) {
            if (ctx.db.get('SELECT event_id FROM events WHERE event_id = ?', event.eventId)) { duplicates += appendEvent(ctx, event).duplicates; }
            else pending.push(event);
          }
          queued += enqueueEvents(ctx.config.dataDir, pending);
        };
        store({ kind: 'session', id: session.id, cwd, parentSessionId: session.parentSessionId, created: Math.max(milliseconds(session.created), observer.from), reason: session.created >= observer.from ? session.parentSessionId ? 'subagent' : 'startup' : 'resume' });
        const messages = readNativePage(db, session, observer.from, observer.messages, 'message');
        const parts = readNativePage(db, session, observer.from, observer.parts, 'tool');
        for (const record of [...messages.records, ...parts.records]) {
          milliseconds(record.updated); shortId(record.id);
          if (record.kind === 'message') {
            if (!['user', 'assistant'].includes(String(record.role))) throw new DomainError('OPENCODE_RECORD_UNSUPPORTED');
            milliseconds(record.created);
            if (record.completed !== null && record.completed !== undefined) milliseconds(record.completed);
          } else {
            if (!['pending', 'running', 'completed', 'error'].includes(String(record.status))) throw new DomainError('OPENCODE_RECORD_UNSUPPORTED');
            shortId(record.toolName);
            if (record.start !== null && record.start !== undefined) milliseconds(record.start);
            if (record.end !== null && record.end !== undefined) milliseconds(record.end);
          }
          store({ ...record, cwd });
        }
        saveObserver(ctx, { ...observer, messages: messages.cursor, parts: parts.cursor, diagnostic: null, lastPollAt: Date.now() });
      } finally { db.close(); }
      results.push({ sourceId: id, status: 'ok', queued, duplicates, diagnostic: null });
    } catch (error) {
      const diagnostic = error instanceof DomainError ? error.code : 'OPENCODE_READ_UNAVAILABLE';
      if (observer) {
        try { saveObserver(ctx, { ...observer, diagnostic, lastPollAt: Date.now() }); }
        catch { /* A fila já sincronizada em disco permanece recuperável; não confirmar cursor. */ }
      }
      results.push({ sourceId: id, status: 'error', queued, duplicates, diagnostic });
    }
  }
  return results;
}

export function disconnectOpenCode(ctx: AppContext, sourceId: string) {
  uuid(sourceId);
  const source = listSources(ctx).find((source) => source.id === sourceId && source.tool === 'opencode');
  if (!source) throw new DomainError('OPENCODE_SOURCE_NOT_FOUND');
  ctx.db.run('DELETE FROM settings WHERE key = ?', `${prefix}${sourceId}`);
  registerSource(ctx, { ...source, enabled: false });
}

export function openCodeDiagnostic(ctx: AppContext, sourceId: string) {
  const row = ctx.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', `${prefix}${sourceId}`);
  if (!row) return null;
  try { const value = readObserver(JSON.parse(row.value)); return { transport: 'native-db-readonly', diagnostic: value.diagnostic, observedFrom: new Date(value.from).toISOString() }; }
  catch { return { transport: 'native-db-readonly', diagnostic: 'OPENCODE_OBSERVER_INVALID', observedFrom: null }; }
}
