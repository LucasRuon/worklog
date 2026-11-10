import type { AppContext, ReportFilter, Session, Tool, WorkEvent } from './contracts.js';
import { listSessions, orderEvents } from './sessions.js';

/** Sessão aguardando sem sinal há mais que isto deixa de aparecer como ativa no painel. */
export const LIVE_WAITING_MS = 30 * 60_000;
const SESSION_EVENT_LIMIT = 400;
const FEED_LIMIT = 60;

export interface LiveTask { title: string | null; status: 'pending' | 'in_progress' | 'completed'; at: string }
export interface LiveSession {
  id: string; sourceId: string; projectId: string | null; tool: Tool; profile: string; deviceId: string;
  nativeSessionId: string; nativeAgentId: string | null; parentSessionId: string | null;
  state: 'running' | 'waiting'; startedAt: string; lastEventAt: string;
  turnStartedAt: string | null;
  /** Chamadas de ferramenta iniciadas sem fim observado, da mais recente para a mais antiga. */
  calls: { name: string; startedAt: string }[];
  lastFile: { path: string; at: string } | null;
  /** Apenas com captura opt-in de títulos; nulo quando não há task observada. */
  task: LiveTask | null;
  subagents: number;
  /** Detalhe expandido: histórico curto da sessão, só metadados. */
  eventCount: number; turns: number;
  recentCalls: { name: string; startedAt: string; endedAt: string; outcome: 'completed' | 'failed' | 'interrupted' }[];
  recentFiles: { path: string; at: string; operation: string }[];
  tasks: LiveTask[];
}
export interface LiveFeedItem {
  id: string; type: WorkEvent['type']; at: string; tool: Tool; projectId: string | null; sessionKey: string | null;
  detail: string | null; outcome: string | null;
}
export interface LiveState { now: string; taskTitles: boolean; sessions: LiveSession[]; feed: LiveFeedItem[] }

function sessionEvents(ctx: AppContext, session: Session) {
  const rows = ctx.db.all<{ document: string }>(
    "SELECT document FROM events WHERE source_id = ? AND json_extract(document, '$.nativeSessionId') = ? AND coalesce(json_extract(document, '$.nativeAgentId'), '') = ? ORDER BY origin_seq DESC LIMIT ?",
    session.sourceId, session.nativeSessionId, session.nativeAgentId ?? '', SESSION_EVENT_LIMIT,
  );
  return orderEvents(rows.map((row) => JSON.parse(row.document) as WorkEvent));
}

/** Estado em curso derivado só de metadados: turno aberto, chamadas abertas, último arquivo e task (opt-in). */
function describe(ctx: AppContext, session: Session): Omit<LiveSession, 'subagents' | 'state'> {
  let turnStartedAt: string | null = null; let lastFile: LiveSession['lastFile'] = null; let turns = 0;
  const recentCalls: LiveSession['recentCalls'] = []; const files = new Map<string, LiveSession['recentFiles'][number]>();
  const taskList = new Map<string, LiveTask>();
  const open = new Map<string, { name: string; startedAt: string }>();
  const titles = new Map<string, string>(); let task: (LiveTask & { key: string | null }) | null = null;
  for (const event of sessionEvents(ctx, session)) {
    switch (event.type) {
      case 'turn.start': turnStartedAt = event.occurredAt; break;
      case 'turn.end': turns++; turnStartedAt = null; open.clear(); break;
      case 'session.end': case 'session.interrupt': turnStartedAt = null; open.clear(); break;
      case 'tool.start': open.set(event.payload.toolUseId, { name: event.payload.toolName, startedAt: event.occurredAt }); break;
      case 'tool.end': {
        const start = open.get(event.payload.toolUseId);
        if (start) recentCalls.push({ name: start.name, startedAt: start.startedAt, endedAt: event.occurredAt, outcome: event.payload.outcome });
        open.delete(event.payload.toolUseId); break;
      }
      case 'file.change': lastFile = { path: event.payload.path, at: event.occurredAt }; files.delete(event.payload.path); files.set(event.payload.path, { ...lastFile, operation: event.payload.operation }); break;
      case 'task.update': {
        const { taskId, title, status } = event.payload;
        if (taskId && title) titles.set(taskId, title);
        const resolved = title ?? (taskId ? titles.get(taskId) : undefined) ?? null; const key = taskId ?? resolved;
        // Uma task criada ou pendente não tira de cena a que está em andamento; concluir a atual a substitui.
        if (status === 'in_progress' || !task || task.status !== 'in_progress' || task.key === key) task = { title: resolved, status, at: event.occurredAt, key };
        if (key) { const previous = taskList.get(key); taskList.delete(key); taskList.set(key, { title: resolved ?? previous?.title ?? null, status, at: event.occurredAt }); }
        break;
      }
    }
  }
  return {
    id: session.id, sourceId: session.sourceId, projectId: session.projectId, tool: session.tool, profile: (session as Session & { profile?: string }).profile ?? '', deviceId: session.deviceId,
    nativeSessionId: session.nativeSessionId, nativeAgentId: session.nativeAgentId, parentSessionId: session.parentSessionId,
    startedAt: session.startedAt, lastEventAt: session.lastEventAt, turnStartedAt,
    calls: [...open.values()].reverse(), lastFile, task: task ? { title: task.title, status: task.status, at: task.at } : null,
    eventCount: session.eventCount, turns,
    recentCalls: recentCalls.slice(-8).reverse(), recentFiles: [...files.values()].slice(-6).reverse(), tasks: [...taskList.values()].slice(-10).reverse(),
  };
}

function feedDetail(event: WorkEvent): { detail: string | null; outcome: string | null } {
  switch (event.type) {
    case 'tool.start': return { detail: event.payload.toolName, outcome: null };
    case 'tool.end': return { detail: event.payload.toolName, outcome: event.payload.outcome };
    case 'turn.end': return { detail: null, outcome: event.payload.outcome };
    case 'file.change': return { detail: event.payload.path, outcome: event.payload.operation };
    case 'git.commit': return { detail: event.payload.sha.slice(0, 7), outcome: null };
    case 'task.update': return { detail: event.payload.title ?? null, outcome: event.payload.status };
    case 'session.start': return { detail: null, outcome: event.payload.reason };
    case 'session.end': return { detail: null, outcome: event.payload.reason };
    case 'machine.idle': return { detail: null, outcome: event.payload.reason };
    default: return { detail: null, outcome: null };
  }
}

export function liveState(ctx: AppContext, filter: ReportFilter, feedQuery: { tables: string; clauses: string[]; parameters: (string | number)[] }, taskTitles: boolean, now = Date.now()): LiveState {
  const sessions = listSessions(ctx, filter, now);
  const active = sessions.filter((session) => session.state === 'running' || (session.state === 'waiting' && !session.endedAt && now - Date.parse(session.lastEventAt) <= LIVE_WAITING_MS));
  const children = new Map<string, number>();
  for (const session of active) if (session.parentSessionId && session.nativeAgentId) children.set(session.parentSessionId, (children.get(session.parentSessionId) ?? 0) + 1);
  const live = active.map((session) => ({ ...describe(ctx, session), state: session.state as LiveSession['state'], subagents: children.get(session.id) ?? 0 }));
  live.sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || b.lastEventAt.localeCompare(a.lastEventAt));
  const rows = ctx.db.all<{ document: string; project_id: string | null }>(
    `SELECT e.document, p.project_id FROM ${feedQuery.tables} WHERE ${feedQuery.clauses.join(' AND ')} AND e.type NOT IN ('turn.start', 'focus.change') ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT ?`,
    ...feedQuery.parameters, FEED_LIMIT,
  );
  const feed = rows.map((row) => {
    const event = JSON.parse(row.document) as WorkEvent;
    return { id: event.eventId, type: event.type, at: event.occurredAt, tool: event.tool, projectId: row.project_id, sessionKey: event.nativeSessionId ? `${event.sourceId}:${event.nativeSessionId}:${event.nativeAgentId ?? ''}` : null, ...feedDetail(event) };
  });
  return { now: new Date(now).toISOString(), taskTitles, sessions: live, feed };
}
