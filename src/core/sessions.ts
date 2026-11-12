import { stableId } from './policy.js';
import { resolveProject } from './projects.js';
import { validateFilter, selectedProjects, selectedOrigin } from './filters.js';
import type { AppContext, WorkEvent, Session, ReportFilter, Tool } from './contracts.js';

export function sessionId(event: Pick<WorkEvent, 'sourceId' | 'nativeSessionId' | 'nativeAgentId'>) {
  return stableId(event.sourceId, 'session', event.nativeSessionId ?? '', event.nativeAgentId ?? 'main');
}
/**
 * Ferramentas que só esperam a resposta do humano (pergunta, aprovação de plano). O tempo delas sai da execução
 * do agente: um turno parado a madrugada inteira numa pergunta não é trabalho da IA.
 */
export const humanWaitTools = new Set(['AskUserQuestion', 'ExitPlanMode', 'question', 'request_user_input']);
const priority: Record<string, number> = { 'session.start': 0, 'turn.submit': 1, 'turn.start': 2, 'tool.start': 3, 'tool.end': 4, 'turn.end': 5, 'session.interrupt': 6, 'session.end': 7 };
export function orderEvents(events: WorkEvent[]) {
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || (priority[a.type] ?? 4) - (priority[b.type] ?? 4) || a.originSeq - b.originSeq || a.eventId.localeCompare(b.eventId));
}

export function projectSessions(ctx: AppContext, events: WorkEvent[]) {
  const sources = new Set(events.filter((event) => event.nativeSessionId).map((event) => event.sourceId));
  if (events.length === 0) return;
  ctx.db.transaction(() => {
    for (const event of events) {
      const match = event.cwd ? resolveProject(ctx, event.deviceId, event.cwd, true) : { state: 'unassigned' as const, reason: 'no-cwd' };
      ctx.db.run('INSERT INTO event_projects VALUES (?, ?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET project_id = excluded.project_id, root_id = excluded.root_id, reason = excluded.reason', event.eventId, match.state === 'matched' ? match.projectId : null, match.state === 'matched' ? match.rootId : null, match.reason);
    }
    for (const sourceId of sources) {
      const groups = new Map<string, WorkEvent[]>();
      for (const row of ctx.db.all<{ document: string }>('SELECT document FROM events WHERE source_id = ? ORDER BY origin_seq', sourceId)) {
        const event = JSON.parse(row.document) as WorkEvent;
        if (!event.nativeSessionId || event.tool === 'focus') continue;
        const id = sessionId(event); const group = groups.get(id);
        if (group) group.push(event); else groups.set(id, [event]);
      }
      for (const [id, unordered] of groups) {
        const ordered = orderEvents(unordered); const first = ordered[0]!; const last = ordered.at(-1)!;
        let state: Session['state'] = 'incomplete'; let endedAt: string | null = null; let knownStart = false; let complete = true;
        const projects = new Set<string>();
        const open = new Map<string, WorkEvent>();
        const spans: { id: string; start: string; end: string; kind: string; complete: boolean }[] = [];
        const waitKeys = new Set<string>(); let waits: { start: string; end: string }[] = [];
        // Ferramentas antes do turno: uma espera ainda aberta precisa ser descontada do turno que ela interrompe.
        const closing = () => [...open.keys()].sort((a, b) => Number(a === 'turn') - Number(b === 'turn'));
        function end(key: string, event: WorkEvent, matched: boolean) {
          const start = open.get(key); if (!start) { complete = false; return; }
          open.delete(key);
          if (waitKeys.delete(key)) { waits.push({ start: start.occurredAt, end: event.occurredAt }); return; }
          if (key !== 'turn') { spans.push({ id: stableId(id, start.eventId, key), start: start.occurredAt, end: event.occurredAt, kind: 'tool', complete: matched }); return; }
          // Turno sem as esperas pelo humano: cada trecho restante vira uma execução.
          let cursor = start.occurredAt; let index = 0;
          for (const wait of waits.filter((item) => item.end > cursor).sort((a, b) => a.start.localeCompare(b.start))) {
            if (wait.start > cursor) spans.push({ id: stableId(id, start.eventId, key, String(index++)), start: cursor, end: wait.start < event.occurredAt ? wait.start : event.occurredAt, kind: 'turn', complete: matched });
            if (wait.end > cursor) cursor = wait.end;
          }
          if (event.occurredAt > cursor) spans.push({ id: index ? stableId(id, start.eventId, key, String(index)) : stableId(id, start.eventId, key), start: cursor, end: event.occurredAt, kind: 'turn', complete: matched });
          waits = [];
        }
        for (const event of ordered) {
          if (event.cwd) { const match = resolveProject(ctx, event.deviceId, event.cwd, true); if (match.state === 'matched') projects.add(match.projectId); }
          switch (event.type) {
            case 'session.start':
              if (['startup', 'subagent'].includes(event.payload.reason)) knownStart = true;
              if (event.payload.reason !== 'compact') { endedAt = null; state = 'waiting'; }
              break;
            case 'turn.start': {
              if (open.has('turn')) { end('turn', event, false); complete = false; }
              waits = [];
              open.set('turn', event); state = 'running'; endedAt = null; break;
            }
            case 'tool.start': {
              const key = `tool:${event.payload.toolUseId}`;
              if (open.has(key)) complete = false;
              else { open.set(key, event); if (humanWaitTools.has(event.payload.toolName)) waitKeys.add(key); }
              state = 'running'; break;
            }
            case 'tool.end': end(`tool:${event.payload.toolUseId}`, event, true); if (!open.size) state = 'waiting'; break;
            case 'turn.end':
              if (open.get('turn')?.type === 'turn.start') {
                const start = open.get('turn')!;
                if (start.type === 'turn.start' && start.payload.turnId && event.payload.turnId && start.payload.turnId !== event.payload.turnId) { complete = false; break; }
              }
              end('turn', event, true); state = event.payload.outcome === 'completed' ? 'waiting' : 'interrupted'; break;
            case 'session.interrupt':
              for (const key of closing()) end(key, event, false);
              state = 'interrupted'; complete = false; break;
            case 'session.end':
              for (const key of closing()) { end(key, event, false); complete = false; }
              endedAt = event.occurredAt; state = 'closed'; break;
          }
        }
        if (open.size) {
          complete = false;
          for (const key of closing()) end(key, last, false);
        }
        const projectId = projects.size === 1 ? [...projects][0]! : null;
        const parent = first.parentSessionId ? stableId(first.sourceId, 'session', first.parentSessionId, 'main') : null;
        ctx.db.run('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, parent_session_id = excluded.parent_session_id, started_at = excluded.started_at, last_event_at = excluded.last_event_at, ended_at = excluded.ended_at, state = excluded.state, complete = excluded.complete, event_count = excluded.event_count', id, first.sourceId, first.deviceId, first.nativeSessionId!, first.nativeAgentId ?? null, parent, projectId, first.occurredAt, last.occurredAt, endedAt, state, Number(knownStart && complete && projects.size <= 1), ordered.length);
        ctx.db.run('DELETE FROM session_executions WHERE session_id = ?', id);
        for (const span of spans) ctx.db.run('INSERT INTO session_executions VALUES (?, ?, ?, ?, ?, ?)', span.id, id, span.start, span.end, span.kind, Number(span.complete));
      }
    }
    ctx.db.run("INSERT INTO settings VALUES ('intervalProjection', '-1') ON CONFLICT(key) DO UPDATE SET value = '-1'");
  });
}

export function rebuildSessions(ctx: AppContext) {
  ctx.db.transaction(() => { ctx.db.exec('DELETE FROM session_executions; DELETE FROM sessions;'); });
  projectSessions(ctx, ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY installation_id, origin_seq').map((row) => JSON.parse(row.document) as WorkEvent));
}

export function listSessions(ctx: AppContext, filter: ReportFilter, now = Date.now()): Session[] {
  validateFilter(filter); const projects = selectedProjects(ctx, filter);
  const rows = ctx.db.all<{ id: string; source_id: string; device_id: string; native_session_id: string; native_agent_id: string | null; parent_session_id: string | null; project_id: string | null; started_at: string; last_event_at: string; ended_at: string | null; state: Session['state']; complete: number; event_count: number; tool: Tool; profile: string }>('SELECT sessions.*, sources.tool, sources.profile FROM sessions JOIN sources ON sources.id = sessions.source_id WHERE started_at < ? AND (last_event_at > ? OR (started_at = last_event_at AND started_at >= ?)) ORDER BY last_event_at DESC, sessions.id', filter.to, filter.from, filter.from);
  return rows.filter((row) => (row.project_id ? projects.has(row.project_id) : filter.includeUnassigned) && selectedOrigin(filter, row.device_id, row.tool, row.source_id)).map((row) => {
    const stale = row.state === 'running' && now - Date.parse(row.last_event_at) > 5 * 60_000;
    const imported = ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM events e JOIN event_provenance p ON p.event_id = e.event_id WHERE e.source_id = ? AND json_extract(e.document, '$.nativeSessionId') = ? AND coalesce(json_extract(e.document, '$.nativeAgentId'), '') = ?", row.source_id, row.native_session_id, row.native_agent_id ?? '')!.n;
    const provenance: Session['provenance'] = imported === 0 ? 'observed' : imported === row.event_count ? 'imported' : 'mixed';
    return { id: row.id, sourceId: row.source_id, deviceId: row.device_id, nativeSessionId: row.native_session_id, nativeAgentId: row.native_agent_id, parentSessionId: row.parent_session_id, projectId: row.project_id, startedAt: row.started_at, lastEventAt: row.last_event_at, endedAt: row.ended_at, state: stale ? 'incomplete' : row.state, complete: Boolean(row.complete) && !stale, eventCount: row.event_count, tool: row.tool, profile: row.profile, provenance };
  });
}
