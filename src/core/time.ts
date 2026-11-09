import { stableId } from './policy.js';
import { resolveProject } from './projects.js';
import { validateFilter, selectedOrigin, selectedProjects } from './filters.js';
import { listSessions } from './sessions.js';
import type { Adjustment, AppContext, Interval, ReportFilter, TimeSummary, Tool, WorkEvent } from './contracts.js';

export function unionDuration(intervals: (Pick<Interval, 'start' | 'end'> & Partial<Interval>)[]): number {
  const sorted = intervals.map((interval) => [Date.parse(interval.start), Date.parse(interval.end)] as const).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
  let total = 0; let until = -Infinity;
  for (const [start, end] of sorted) { total += Math.max(0, end - Math.max(start, until)); until = Math.max(until, end); }
  return total;
}
interface Row { id: string; kind: 'human' | 'agent'; session_id: string; project_id: string | null; device_id: string; source_id: string; tool: Tool; start_at: string; end_at: string; quality: Interval['quality'] }

export function projectIntervals(ctx: AppContext) {
  const version = String(ctx.db.get<{ n: number }>('SELECT COALESCE(max(rowid), 0) AS n FROM events')!.n);
  if (ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'intervalProjection'")?.value === version) return;
  const humanEvents = ctx.db.all<{ document: string }>("SELECT document FROM events WHERE type IN ('human.interaction', 'focus.change', 'machine.idle', 'machine.resume') AND NOT EXISTS (SELECT 1 FROM event_quality q WHERE q.event_id = events.event_id AND q.reason = 'clock-skew') ORDER BY occurred_at, origin_seq, event_id").map((row) => JSON.parse(row.document) as WorkEvent);
  const rows: Row[] = [];
  const active = new Map<string, Row>();
  const windowMs = Math.min(60 * 60_000, Math.max(1000, Number(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'humanWindowMs'")!.value)));
  function flush(deviceId: string, at: string) {
    const row = active.get(deviceId);
    if (row) { const end = row.end_at < at ? row.end_at : at; if (end > row.start_at) rows.push({ ...row, end_at: end }); active.delete(deviceId); }
    return row;
  }
  for (const event of humanEvents) {
    if (event.nativeAgentId) continue;
    if (event.type === 'human.interaction') {
      flush(event.deviceId, event.occurredAt);
      const match = event.cwd ? resolveProject(ctx, event.deviceId, event.cwd, true) : null;
      active.set(event.deviceId, { id: event.eventId, kind: 'human', session_id: '', project_id: match?.state === 'matched' ? match.projectId : null, device_id: event.deviceId, source_id: event.sourceId, tool: event.tool, start_at: event.occurredAt, end_at: new Date(Date.parse(event.occurredAt) + windowMs).toISOString(), quality: 'estimated' });
    } else if (event.type === 'machine.idle') flush(event.deviceId, event.occurredAt);
    else if (event.type === 'focus.change') {
      const previous = flush(event.deviceId, event.occurredAt);
      if (previous && previous.end_at > event.occurredAt) active.set(event.deviceId, { ...previous, id: event.eventId, start_at: event.occurredAt, project_id: event.payload.confidence === 'unresolved' ? null : event.payload.projectId ?? null });
    }
  }
  for (const deviceId of [...active.keys()]) flush(deviceId, '9999-12-31T23:59:59.999Z');
  const executions = ctx.db.all<{ id: string; session_id: string; project_id: string | null; device_id: string; source_id: string; tool: Tool; start_at: string; end_at: string }>('SELECT session_executions.id, session_id, project_id, sessions.device_id, sessions.source_id, sources.tool, start_at, end_at FROM session_executions JOIN sessions ON sessions.id = session_id JOIN sources ON sources.id = sessions.source_id');
  for (const row of executions) rows.push({ ...row, kind: 'agent', quality: 'observed' });
  ctx.db.transaction(() => {
    ctx.db.exec('DELETE FROM intervals');
    rows.forEach((row, index) => ctx.db.run('INSERT INTO intervals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', stableId(row.id, String(index)), row.kind, row.session_id, row.project_id, row.device_id, row.tool, row.start_at, row.end_at, row.quality, row.source_id));
    ctx.db.run("INSERT INTO settings VALUES ('intervalProjection', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", version);
  });
}

export function deriveTime(ctx: AppContext, filter: ReportFilter, now = Date.now()): TimeSummary {
  validateFilter(filter); projectIntervals(ctx);
  const projects = selectedProjects(ctx, filter);
  const from = Date.parse(filter.from); const to = Math.min(Date.parse(filter.to), now);
  const raw = ctx.db.all<Row>('SELECT * FROM intervals WHERE start_at < ? AND end_at > ?', filter.to, filter.from).map((row) => ({ ...row, start_at: new Date(Math.max(from, Date.parse(row.start_at))).toISOString(), end_at: new Date(Math.min(to, Date.parse(row.end_at))).toISOString() })).filter((row) => row.end_at > row.start_at);
  const agents = raw.filter((row) => row.kind === 'agent' && selectedOrigin(filter, row.device_id, row.tool, row.source_id) && (row.project_id ? projects.has(row.project_id) : filter.includeUnassigned));
  const sessionSpans = new Map<string, Pick<Interval, 'start' | 'end'>[]>();
  for (const row of agents) {
    const spans = sessionSpans.get(row.session_id); const span = { start: row.start_at, end: row.end_at };
    if (spans) spans.push(span); else sessionSpans.set(row.session_id, [span]);
  }
  const humans = raw.filter((row) => row.kind === 'human');
  const adjustments = ctx.db.all<{ document: string }>('SELECT a.document FROM time_adjustments a WHERE a.undo_of IS NULL AND NOT EXISTS (SELECT 1 FROM time_adjustments u WHERE u.undo_of = a.id) AND a.start_at < ? AND a.end_at > ?', filter.to, filter.from).map((row) => JSON.parse(row.document) as Adjustment);
  const points = [...new Set([...humans.flatMap((row) => [row.start_at, row.end_at]), ...adjustments.flatMap((a) => [new Date(Math.max(from, Date.parse(a.start))).toISOString(), new Date(Math.min(to, Date.parse(a.end))).toISOString()])])].filter((at) => Date.parse(at) >= from && Date.parse(at) <= to).sort();
  let humanEstimatedMs = 0; let unassignedHumanMs = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!; const end = points[index + 1]!;
    if (adjustments.some((a) => a.start <= start && a.end >= end)) continue;
    const active = humans.filter((row) => row.start_at <= start && row.end_at >= end);
    if (!active.some((row) => selectedOrigin(filter, row.device_id, row.tool, row.source_id))) continue;
    const candidates = new Set(active.map((row) => row.project_id));
    const project = candidates.size === 1 ? [...candidates][0]! : null;
    const duration = Date.parse(end) - Date.parse(start);
    if (project && projects.has(project)) humanEstimatedMs += duration;
    else if (!project && (!filter.projectIds.length || filter.includeUnassigned)) unassignedHumanMs += duration;
  }
  let humanAdjustedMs = 0;
  for (const a of adjustments) {
    if (!projects.has(a.projectId) || !selectedOrigin(filter, a.deviceId, 'focus', a.sourceId)) continue;
    const start = Date.parse(a.start); const span = BigInt(Date.parse(a.end) - start);
    const left = Math.max(start, from); const right = Math.min(Date.parse(a.end), to);
    if (right > left) humanAdjustedMs += Number(BigInt(a.nextMs) * BigInt(right - start) / span - BigInt(a.nextMs) * BigInt(left - start) / span);
  }
  const sessions = listSessions(ctx, filter, now);
  return {
    humanEstimatedMs, humanAdjustedMs, unassignedHumanMs,
    agentAccumulatedMs: [...sessionSpans.values()].reduce((total, spans) => total + unionDuration(spans), 0),
    agentWallMs: unionDuration(agents.map((row) => ({ start: row.start_at, end: row.end_at }))),
    sessionSpanMs: sessions.reduce((total, session) => total + Math.max(0, Math.min(to, Date.parse(session.lastEventAt)) - Math.max(from, Date.parse(session.startedAt))), 0),
    incompleteSessions: sessions.filter((session) => !session.complete).length, ruleVersion: adjustments.length ? 'explicit-signal-window-v1+adjustments-v1' : 'explicit-signal-window-v1',
    humanSignalCount: humans.filter((row) => selectedOrigin(filter, row.device_id, row.tool, row.source_id) && (row.project_id ? projects.has(row.project_id) : !filter.projectIds.length || filter.includeUnassigned)).length,
  };
}
