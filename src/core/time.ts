import { stableId } from './policy.js';
import { resolveProject } from './projects.js';
import { validateFilter, selectedOrigin, selectedProjects } from './filters.js';
import { listSessions } from './sessions.js';
import { dateInZone, nextDate, startOfDay } from './dates.js';
import { manualTimeMs } from './manual-time.js';
import { OPEN_END, presenceEventTypes, presenceRows } from './presence.js';
import type { Adjustment, AppContext, Interval, ReportFilter, TimeSummary, Tool, WorkEvent } from './contracts.js';

export function unionDuration(intervals: (Pick<Interval, 'start' | 'end'> & Partial<Interval>)[]): number {
  const sorted = intervals.map((interval) => [Date.parse(interval.start), Date.parse(interval.end)] as const).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
  let total = 0; let until = -Infinity;
  for (const [start, end] of sorted) { total += Math.max(0, end - Math.max(start, until)); until = Math.max(until, end); }
  return total;
}
interface Row { id: string; kind: 'human' | 'agent'; session_id: string; project_id: string | null; device_id: string; source_id: string; tool: Tool; start_at: string; end_at: string; quality: Interval['quality'] }

/**
 * Versão da regra de dedicação; alterá-la reprocessa as janelas já projetadas.
 * `presence-attribution-v2` (ver `presence.ts`) vale a partir do primeiro retorno observado de cada máquina;
 * antes disso, o histórico legado mantém as janelas por prompt/sinal de `presence-split-v1`.
 */
export const HUMAN_RULE = 'presence-attribution-v2';

export function projectIntervals(ctx: AppContext) {
  const version = `${ctx.db.get<{ n: number }>('SELECT COALESCE(max(rowid), 0) AS n FROM events')!.n}:${HUMAN_RULE}`;
  if (ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'intervalProjection'")?.value === version) return;
  const humanEvents = ctx.db.all<{ document: string }>(`SELECT document FROM events WHERE type IN (${presenceEventTypes.map((type) => `'${type}'`).join(', ')}) AND NOT EXISTS (SELECT 1 FROM event_quality q WHERE q.event_id = events.event_id AND q.reason = 'clock-skew') ORDER BY occurred_at, origin_seq, event_id`).map((row) => JSON.parse(row.document) as WorkEvent);
  const rows: Row[] = [];
  // Por máquina, uma janela aberta por projeto: trabalho paralelo mantém janelas simultâneas.
  const active = new Map<string, Map<string, Row>>();
  const away = new Set<string>();
  // A presença só é conhecida a partir do primeiro retorno observado; antes disso, prompts contam como no histórico legado.
  const trackedFrom = new Map<string, string>();
  for (const event of humanEvents) if (event.type === 'machine.resume' && !trackedFrom.has(event.deviceId)) trackedFrom.set(event.deviceId, event.occurredAt);
  const isTracked = (event: WorkEvent) => { const tracked = trackedFrom.get(event.deviceId); return !!tracked && event.occurredAt >= tracked; };
  const legacy = humanEvents.filter((event) => !isTracked(event) && ['human.interaction', 'focus.change', 'machine.idle', 'machine.resume', 'turn.submit'].includes(event.type));
  const windowMs = Math.min(60 * 60_000, Math.max(1000, Number(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'humanWindowMs'")!.value)));
  const windows = (deviceId: string) => { let map = active.get(deviceId); if (!map) active.set(deviceId, map = new Map()); return map; };
  function close(row: Row, at: string) { const end = row.end_at < at ? row.end_at : at; if (end > row.start_at) rows.push({ ...row, end_at: end }); }
  function flush(deviceId: string, at: string) {
    const open = [...windows(deviceId).values()]; open.forEach((row) => close(row, at)); windows(deviceId).clear(); return open;
  }
  function openWindow(event: WorkEvent, projectId: string | null, endAt = new Date(Date.parse(event.occurredAt) + windowMs).toISOString(), base?: Row) {
    const map = windows(event.deviceId); const key = projectId ?? '';
    const previous = map.get(key); if (previous) close(previous, event.occurredAt);
    map.set(key, { id: event.eventId, kind: 'human', session_id: '', project_id: projectId, device_id: base?.device_id ?? event.deviceId, source_id: base?.source_id ?? event.sourceId, tool: base?.tool ?? event.tool, start_at: event.occurredAt, end_at: endAt, quality: 'estimated' });
  }
  const resolved = new Map<string, string | null>();
  const projectOf = (event: WorkEvent): string | null => {
    if ((event.type === 'human.interaction' || event.type === 'focus.change') && event.payload.projectId && ctx.db.get('SELECT id FROM projects WHERE id = ?', event.payload.projectId)) return event.payload.projectId;
    if (!event.cwd) return null;
    const key = `${event.deviceId}\0${event.cwd}`;
    if (!resolved.has(key)) { const match = resolveProject(ctx, event.deviceId, event.cwd, true); resolved.set(key, match.state === 'matched' ? match.projectId : null); }
    return resolved.get(key)!; };
  for (const event of legacy) {
    if (event.nativeAgentId) continue;
    if (event.type === 'human.interaction') {
      // Sinal explícito: "estou neste projeto agora" encerra as demais janelas da máquina.
      away.delete(event.deviceId); flush(event.deviceId, event.occurredAt); openWindow(event, projectOf(event));
    } else if (event.type === 'turn.submit') {
      // Prompt de sessão raiz; subagentes e prompts enviados com a máquina ociosa não indicam presença.
      if (event.parentSessionId) continue;
      openWindow(event, projectOf(event));
    } else if (event.type === 'machine.idle') { flush(event.deviceId, event.occurredAt); away.add(event.deviceId); }
    else if (event.type === 'machine.resume') away.delete(event.deviceId);
    else if (event.type === 'focus.change') {
      const previous = flush(event.deviceId, event.occurredAt);
      const last = previous.reduce<Row | null>((best, row) => !best || row.end_at > best.end_at ? row : best, null);
      if (last && last.end_at > event.occurredAt) openWindow(event, event.payload.confidence === 'unresolved' ? null : event.payload.projectId ?? null, last.end_at, last);
    }
  }
  // Janelas legadas param no primeiro retorno observado; dali em diante vale a presença.
  for (const deviceId of [...active.keys()]) flush(deviceId, trackedFrom.get(deviceId) ?? '9999-12-31T23:59:59.999Z');
  const idleMs = Number((JSON.parse(ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'operatingConfig'")?.value ?? '{}') as { idleMs?: unknown }).idleMs) || 300_000;
  for (const row of presenceRows(humanEvents.filter(isTracked), projectOf, idleMs)) {
    rows.push({ id: row.id, kind: 'human', session_id: '', project_id: row.projectId, device_id: row.deviceId, source_id: row.sourceId, tool: row.tool, start_at: new Date(row.start).toISOString(), end_at: row.end >= OPEN_END ? '9999-12-31T23:59:59.999Z' : new Date(row.end).toISOString(), quality: 'estimated' });
  }
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
  let humanEstimated = 0; let unassignedHuman = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!; const end = points[index + 1]!;
    if (adjustments.some((a) => a.start <= start && a.end >= end)) continue;
    const active = humans.filter((row) => row.start_at <= start && row.end_at >= end);
    // Projetos simultâneos dividem o trecho em partes iguais; a divisão é global, calculada antes do filtro.
    const candidates = new Set(active.map((row) => row.project_id));
    const share = (Date.parse(end) - Date.parse(start)) / candidates.size;
    for (const project of candidates) {
      if (!active.some((row) => row.project_id === project && selectedOrigin(filter, row.device_id, row.tool, row.source_id))) continue;
      if (project && projects.has(project)) humanEstimated += share;
      else if (!project && (!filter.projectIds.length || filter.includeUnassigned)) unassignedHuman += share;
    }
  }
  const humanEstimatedMs = Math.round(humanEstimated); const unassignedHumanMs = Math.round(unassignedHuman);
  let humanAdjustedMs = 0;
  for (const a of adjustments) {
    if (!projects.has(a.projectId) || !selectedOrigin(filter, a.deviceId, 'focus', a.sourceId)) continue;
    const start = Date.parse(a.start); const span = BigInt(Date.parse(a.end) - start);
    const left = Math.max(start, from); const right = Math.min(Date.parse(a.end), to);
    if (right > left) humanAdjustedMs += Number(BigInt(a.nextMs) * BigInt(right - start) / span - BigInt(a.nextMs) * BigInt(left - start) / span);
  }
  const sessions = listSessions(ctx, filter, now);
  return {
    humanEstimatedMs, humanAdjustedMs, humanManualMs: manualTimeMs(ctx, filter), unassignedHumanMs,
    agentAccumulatedMs: [...sessionSpans.values()].reduce((total, spans) => total + unionDuration(spans), 0),
    agentWallMs: unionDuration(agents.map((row) => ({ start: row.start_at, end: row.end_at }))),
    sessionSpanMs: sessions.reduce((total, session) => total + Math.max(0, Math.min(to, Date.parse(session.lastEventAt)) - Math.max(from, Date.parse(session.startedAt))), 0),
    incompleteSessions: sessions.filter((session) => !session.complete).length, ruleVersion: adjustments.length ? `${HUMAN_RULE}+adjustments-v1` : HUMAN_RULE,
    humanSignalCount: humans.filter((row) => selectedOrigin(filter, row.device_id, row.tool, row.source_id) && (row.project_id ? projects.has(row.project_id) : !filter.projectIds.length || filter.includeUnassigned)).length,
  };
}

export interface TimeSeries {
  days: { date: string; agentWallMs: number; sessionCount: number }[];
  /** weekday: 0 = domingo … 6 = sábado, no fuso do filtro. */
  heatmap: { weekday: number; hour: number; agentWallMs: number }[];
  truncated: boolean;
}
const SERIES_MAX_DAYS = 366;
const SERIES_CHUNK_MS = 15 * 60_000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Execução de IA no relógio (união, sem sobreposição) distribuída por dia e por dia da semana × hora locais. */
export function deriveSeries(ctx: AppContext, filter: ReportFilter, now = Date.now()): TimeSeries {
  validateFilter(filter); projectIntervals(ctx);
  const projects = selectedProjects(ctx, filter);
  const from = Date.parse(filter.from); const to = Math.min(Date.parse(filter.to), now); const end = Date.parse(filter.to);
  const days: TimeSeries['days'] = []; const starts: number[] = [];
  let date = dateInZone(new Date(from), filter.timezone);
  while (days.length < SERIES_MAX_DAYS) {
    const start = Date.parse(startOfDay(date, filter.timezone));
    if (start >= end) break;
    days.push({ date, agentWallMs: 0, sessionCount: 0 }); starts.push(start); date = nextDate(date);
  }
  const truncated = Date.parse(startOfDay(date, filter.timezone)) < end;
  const dayIndex = new Map(days.map((day, index) => [day.date, index]));
  const heat = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: filter.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const agents = ctx.db.all<Row>("SELECT * FROM intervals WHERE kind = 'agent' AND start_at < ? AND end_at > ?", filter.to, filter.from)
    .filter((row) => selectedOrigin(filter, row.device_id, row.tool, row.source_id) && (row.project_id ? projects.has(row.project_id) : filter.includeUnassigned))
    .map((row) => [Math.max(from, Date.parse(row.start_at)), Math.min(to, Date.parse(row.end_at))] as const)
    .filter(([start, finish]) => Number.isFinite(start) && Number.isFinite(finish) && finish > start)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, finish] of agents) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], finish); else merged.push([start, finish]);
  }
  // Blocos de 15 min cobrem fusos com deslocamento de 30/45 min sem atribuir tempo à hora errada.
  for (const [start, finish] of merged) {
    for (let at = start; at < finish;) {
      const next = Math.min(finish, Math.floor(at / SERIES_CHUNK_MS) * SERIES_CHUNK_MS + SERIES_CHUNK_MS);
      const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
      const index = dayIndex.get(`${parts.year}-${parts.month}-${parts.day}`);
      if (index !== undefined) days[index]!.agentWallMs += next - at;
      const key = `${WEEKDAYS[parts.weekday!]}:${Number(parts.hour)}`;
      heat.set(key, (heat.get(key) ?? 0) + next - at);
      at = next;
    }
  }
  for (const session of listSessions(ctx, filter, now)) {
    const first = Math.max(from, Date.parse(session.startedAt)); const last = Math.min(to, Date.parse(session.lastEventAt));
    starts.forEach((start, index) => { const dayEnd = starts[index + 1] ?? end; if (first < dayEnd && last >= start) days[index]!.sessionCount++; });
  }
  const heatmap: TimeSeries['heatmap'] = [];
  for (let weekday = 0; weekday < 7; weekday++) for (let hour = 0; hour < 24; hour++) heatmap.push({ weekday, hour, agentWallMs: heat.get(`${weekday}:${hour}`) ?? 0 });
  return { days, heatmap, truncated };
}
