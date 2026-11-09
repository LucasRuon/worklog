import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { assertRecord, DomainError, shortId, utc, uuid, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { normalizeEvent, stableId } from '../core/policy.js';
import { atomicPrivate, readPrivate } from '../core/private-files.js';
import { captureSource, enqueueEvents, prepareCapture } from './queue.js';
import { canonicalCodexEvent } from './codex-receipts.js';

export const supportedCodexVersions = ['0.167.0'];
export const codexHooks = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Interrupt', 'SubagentStart', 'SubagentStop', 'PreCompact'] as const;
type Observation = { originId: string; occurredAt: string };

export function normalizeCodex(source: SourceRegistration, raw: unknown, observed: Observation = { originId: randomUUID(), occurredAt: new Date().toISOString() }): EventInput[] {
  try {
    assertRecord(raw);
    if (source.tool !== 'codex' || !supportedCodexVersions.includes(source.version) || Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024 || !codexHooks.includes(raw.hook_event_name as never)) return [];
    shortId(raw.session_id); utc(observed.occurredAt);
    if (typeof raw.cwd !== 'string') return [];
    const hook = raw.hook_event_name as typeof codexHooks[number];
    if (!['SessionStart', 'SessionEnd'].includes(hook)) shortId(raw.turn_id);
    if (raw.agent_id !== undefined) shortId(raw.agent_id);
    if (['SubagentStart', 'SubagentStop'].includes(hook)) shortId(raw.agent_id);
    const originId = typeof raw.turn_id === 'string'
      ? stableId(raw.session_id as string, String(raw.agent_id ?? ''), hook, raw.turn_id, String(raw.tool_use_id ?? ''))
      : observed.originId;
    const common = { originId, occurredAt: observed.occurredAt, nativeSessionId: raw.session_id, cwd: raw.cwd, ...(raw.agent_id ? { nativeAgentId: raw.agent_id, parentSessionId: raw.session_id } : {}) };
    const events: EventInput[] = [];
    const add = (type: string, payload: object) => events.push(...normalizeEvent(source, { ...common, type, payload }));
    const turn = { turnId: raw.turn_id };
    switch (hook) {
      case 'SessionStart': add('session.start', { reason: ['startup', 'resume', 'compact'].includes(String(raw.source)) ? raw.source : 'unknown' }); break;
      case 'SessionEnd': add('session.end', { reason: 'other' }); break;
      case 'UserPromptSubmit': add('turn.submit', turn); add('turn.start', turn); break;
      case 'PreToolUse': add('tool.start', { toolName: raw.tool_name, toolUseId: raw.tool_use_id }); break;
      // Completion of a call is not evidence that the command or a test passed.
      case 'PostToolUse': add('tool.end', { toolName: raw.tool_name, toolUseId: raw.tool_use_id, outcome: 'completed' }); break;
      case 'Stop': add('turn.end', { ...turn, outcome: 'completed' }); break;
      case 'Interrupt': add('turn.end', { ...turn, outcome: 'interrupted' }); add('session.interrupt', { reason: 'user' }); break;
      case 'SubagentStart': add('session.start', { reason: 'subagent' }); break;
      case 'SubagentStop': add('turn.end', { outcome: 'completed' }); break;
      case 'PreCompact': add('session.start', { reason: 'compact' }); break;
    }
    return events;
  } catch { return []; }
}

export function getCodexDiagnostic(dataDir: string, sourceId: string): { code: string; at: string } | null {
  uuid(sourceId);
  try {
    const value: unknown = JSON.parse(readPrivate(join(dataDir, `codex-${sourceId}.diagnostic.json`), 1024)); assertRecord(value);
    utc(value.at);
    return typeof value.code === 'string' ? { code: value.code, at: value.at as string } : null;
  } catch { return null; }
}

export function queueCodex(dataDir: string, sourceId: string, raw: unknown, observed?: Observation): number {
  try {
    uuid(sourceId);
    const source = captureSource(dataDir, sourceId);
    if (!source || source.tool !== 'codex') return 0;
    let events = normalizeCodex(source, raw, observed);
    if (!events.length) throw new DomainError('CODEX_INPUT_UNSUPPORTED');
    // Authorize before retaining even normalized metadata in the replay receipt.
    events = prepareCapture(dataDir, events).events;
    const batchIds = events.map((event) => event.eventId);
    const count = enqueueEvents(dataDir, events.map((event) => canonicalCodexEvent(dataDir, event, batchIds)));
    atomicPrivate(join(dataDir, `codex-${sourceId}.diagnostic.json`), JSON.stringify({ code: 'CODEX_CAPTURE_OK', at: new Date().toISOString() }));
    return count;
  } catch (error) {
    try {
      uuid(sourceId);
      const code = error instanceof DomainError ? error.code : 'CODEX_CAPTURE_UNAVAILABLE';
      atomicPrivate(join(dataDir, `codex-${sourceId}.diagnostic.json`), JSON.stringify({ code, at: new Date().toISOString() }));
    } catch { /* A hook must not block Codex when its data directory is unavailable. */ }
    return 0;
  }
}
