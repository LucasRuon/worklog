import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../core/contracts.js';
import type { LiveFeedItem, LiveSession, LiveState } from '../../core/live.js';
import type { TimeSeries } from '../../core/time.js';
import { dateInZone, nextDate, startOfDay } from '../../core/dates.js';
import { applyTheme } from '../Shell.js';
import { api, ApiError, duration, machineName, type Page, type Settings, type Summary } from '../api.js';

const ZONE = 'America/Sao_Paulo';
const LIVE_MS = 3000; const SUMMARY_MS = 15_000; const COLLAPSE_MS = 90_000;
const toolNames: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', git: 'Git', files: 'Arquivos', focus: 'Sinal explícito' };

function todayQuery(includeUnassigned: boolean) {
  const today = dateInZone(new Date(), ZONE);
  return new URLSearchParams({ from: startOfDay(today, ZONE), to: startOfDay(nextDate(today), ZONE), timezone: ZONE, projectIds: '', tools: '', deviceIds: '', sourceIds: '', includeUnassigned: includeUnassigned ? '1' : '0' }).toString();
}
const clock = (value: string | number, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }) => new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, ...options }).format(new Date(value));
/** Duração compacta para leitura a distância: "4 h 12" em vez de "4 h 12 min". */
function compact(ms: number) {
  if (ms <= 0) return '0 min';
  if (ms < 60_000) return '<1 min';
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}
function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
}
const basename = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;
const seconds = (value: string) => clock(value, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const sessionKey = (s: LiveSession) => `${s.sourceId}:${s.nativeSessionId}:${s.nativeAgentId ?? ''}`;
const outcomes: Record<string, string> = { completed: 'Concluída', failed: 'Falhou', interrupted: 'Interrompida', in_progress: 'Em andamento', pending: 'Criada', create: 'Criado', edit: 'Alterado', delete: 'Removido', rename: 'Renomeado', startup: 'Início', resume: 'Retomada', compact: 'Compactação', subagent: 'Subagente', idle: 'Inatividade', lock: 'Tela bloqueada', sleep: 'Suspensão', pause: 'Pausa', clear: 'Limpeza', logout: 'Logout', prompt_input_exit: 'Saída', other: 'Outro' };
const outcomeLabel = (value: string) => outcomes[value] ?? value;
/** Chamadas seguidas da mesma ferramenta com o mesmo resultado viram uma linha com contagem e tempo somado. */
function groupCalls(calls: LiveSession['recentCalls']) {
  const rows: { name: string; endedAt: string; outcome: string; ms: number; count: number }[] = [];
  for (const call of calls) {
    const ms = Date.parse(call.endedAt) - Date.parse(call.startedAt); const last = rows.at(-1);
    if (last && last.name === call.name && last.outcome === call.outcome) { last.count++; last.ms += ms; } else rows.push({ name: call.name, endedAt: call.endedAt, outcome: call.outcome, ms, count: 1 });
  }
  return rows;
}
const projectHref = (id: string) => `?view=projects&project=${encodeURIComponent(id)}`;

const icons = {
  call: 'M4 7h10 M4 12h16 M4 17h7',
  file: 'M7 3h7l4 4v14H7z M14 3v4h4',
  commit: 'M3 12h6 M15 12h6 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  prompt: 'M4 5h16v11H9l-5 4z',
  task: 'M4 12l5 5L20 6',
  session: 'M7 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  pause: 'M8 5v14 M16 5v14',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17v.5',
};
function Icon({ name }: { name: keyof typeof icons }) {
  return <svg className="live-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>;
}

interface FeedRow { id: string; at: string; firstAt: string; item: LiveFeedItem; icon: keyof typeof icons; title: string; meta: string; tone: 'run' | 'wait' | 'fail' | 'plain'; count: number }
/** Agrupa chamadas repetidas da mesma sessão e oculta finais bem-sucedidos, para o fluxo não virar ruído. */
function feedRows(items: LiveFeedItem[], project: (id: string | null) => string): FeedRow[] {
  const rows: (FeedRow & { key: string })[] = [];
  for (const item of items) {
    if (item.type === 'tool.end' && item.outcome === 'completed') continue;
    const where = `${project(item.projectId)} · ${toolNames[item.tool] ?? item.tool}`;
    let row: Omit<FeedRow, 'id' | 'at' | 'firstAt' | 'item' | 'count'>;
    switch (item.type) {
      case 'tool.start': row = { icon: 'call', title: item.detail ?? 'Ferramenta', meta: where, tone: 'plain' }; break;
      case 'tool.end': row = { icon: 'alert', title: `${item.detail ?? 'Ferramenta'} ${item.outcome === 'interrupted' ? 'interrompida' : 'falhou'}`, meta: where, tone: 'fail' }; break;
      case 'turn.submit': row = { icon: 'prompt', title: 'Prompt enviado', meta: where, tone: 'plain' }; break;
      case 'turn.end': row = item.outcome === 'completed' ? { icon: 'pause', title: 'Turno concluído · aguardando você', meta: where, tone: 'wait' } : { icon: 'alert', title: item.outcome === 'interrupted' ? 'Turno interrompido' : 'Turno falhou', meta: where, tone: 'fail' }; break;
      case 'session.start': row = { icon: 'session', title: item.outcome === 'subagent' ? 'Subagente iniciado' : item.outcome === 'resume' ? 'Sessão retomada' : item.outcome === 'compact' ? 'Contexto compactado' : 'Sessão iniciada', meta: where, tone: 'run' }; break;
      case 'session.end': row = { icon: 'stop', title: item.outcome === 'subagent' ? 'Subagente concluído' : 'Sessão encerrada', meta: where, tone: 'plain' }; break;
      case 'session.interrupt': row = { icon: 'alert', title: 'Sessão interrompida', meta: where, tone: 'fail' }; break;
      case 'file.change': row = { icon: 'file', title: basename(item.detail ?? 'arquivo'), meta: `${project(item.projectId)} · ${item.outcome === 'create' ? 'criado' : item.outcome === 'delete' ? 'removido' : item.outcome === 'rename' ? 'renomeado' : 'alterado'}`, tone: 'plain' }; break;
      case 'git.commit': row = { icon: 'commit', title: `Commit ${item.detail ?? ''}`.trim(), meta: project(item.projectId), tone: 'plain' }; break;
      case 'task.update': row = { icon: 'task', title: item.detail ?? 'Task sem título', meta: `${where} · ${item.outcome === 'in_progress' ? 'em andamento' : item.outcome === 'completed' ? 'concluída' : 'criada'}`, tone: item.outcome === 'in_progress' ? 'run' : 'plain' }; break;
      case 'human.interaction': row = { icon: 'prompt', title: 'Dedicação sinalizada', meta: project(item.projectId), tone: 'plain' }; break;
      case 'machine.idle': row = { icon: 'pause', title: 'Mac em pausa', meta: item.outcome === 'lock' ? 'tela bloqueada' : item.outcome === 'sleep' ? 'suspensão' : 'inatividade', tone: 'plain' }; break;
      case 'machine.resume': row = { icon: 'session', title: 'Mac retomado', meta: 'atividade observada', tone: 'plain' }; break;
      default: continue;
    }
    const key = `${item.sessionKey ?? item.projectId}:${row.icon}:${row.title}`;
    const previous = rows.at(-1);
    if (previous && previous.key === key) { previous.count++; previous.firstAt = item.at; continue; }
    rows.push({ ...row, id: item.id, at: item.at, firstAt: item.at, item, count: 1, key });
  }
  return rows.slice(0, 24);
}

interface Data { projects: Project[]; settings: Settings; summary: Summary; series: TimeSeries | null }

export function Live({ expired }: { expired: () => void }) {
  const [live, setLive] = useState<LiveState | null>(null); const [data, setData] = useState<Data | null>(null);
  const [now, setNow] = useState(Date.now()); const [lastOk, setLastOk] = useState(0); const [offline, setOffline] = useState(false);
  const seen = useRef<{ feed: Set<string>; states: Map<string, string> } | null>(null);
  const [fresh, setFresh] = useState<{ feed: Set<string>; sessions: Set<string> }>({ feed: new Set(), sessions: new Set() });
  const [open, setOpen] = useState<string | null>(null); const touched = useRef(Date.now());
  const toggle = (key: string) => { touched.current = Date.now(); setOpen((current) => current === key ? null : key); };
  // Monitor dedicado: sem interação por 90 s, o detalhe fecha e a tela volta à visão geral.
  useEffect(() => { if (open && now - touched.current > COLLAPSE_MS) setOpen(null); }, [now, open]);
  useEffect(() => {
    const mark = () => { touched.current = Date.now(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
    window.addEventListener('pointermove', mark); window.addEventListener('keydown', mark); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointermove', mark); window.removeEventListener('keydown', mark); window.removeEventListener('keydown', escape); };
  }, []);

  useEffect(() => { applyTheme('dark'); document.title = 'Worklog · ao vivo'; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  function failed(error: unknown) { if (error instanceof ApiError && error.status === 401) expired(); else setOffline(true); }

  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const next = await api<LiveState>(`/api/live?${todayQuery(true)}`);
        if (!alive) return;
        // Destaque persiste até a próxima atualização: itens novos e sessões que mudaram de estado.
        const before = seen.current;
        const states = new Map(next.sessions.map((s) => [s.id, `${s.state}:${s.task?.title ?? ''}:${s.calls[0]?.name ?? ''}`]));
        setFresh(before ? { feed: new Set(next.feed.filter((item) => !before.feed.has(item.id)).map((item) => item.id)), sessions: new Set([...states].filter(([id, value]) => before.states.get(id) !== value).map(([id]) => id)) } : { feed: new Set(), sessions: new Set() });
        seen.current = { feed: new Set(next.feed.map((item) => item.id)), states };
        setLive(next); setLastOk(Date.now()); setOffline(false);
      } catch (error) { if (alive) failed(error); }
      if (alive) timer = setTimeout(() => void tick(), LIVE_MS);
    }
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const query = todayQuery(false);
        const [projects, settings, summary, series] = await Promise.all([api<Page<Project>>('/api/projects?limit=100'), api<Settings>('/api/settings'), api<Summary>(`/api/summary?${query}`), api<TimeSeries>(`/api/summary/series?${query}`).catch(() => null)]);
        if (alive) setData({ projects: projects.items, settings, summary, series });
      } catch (error) { if (alive) failed(error); }
      if (alive) timer = setTimeout(() => void tick(), SUMMARY_MS);
    }
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const projects = new Map(data?.projects.map((p) => [p.id, p]));
  const projectName = (id: string | null) => id ? projects.get(id)?.name ?? 'Projeto' : 'Sem projeto';
  const running = live?.sessions.filter((s) => s.state === 'running').length ?? 0;
  const waiting = live?.sessions.filter((s) => s.state === 'waiting').length ?? 0;
  const age = lastOk ? Math.round((now - lastOk) / 1000) : null;
  const machineOf = (session: LiveSession) => data ? machineName(data.settings, session.deviceId) : '';

  return <div className="live">
    <header className="live-bar">
      <div className="live-brand"><span className="monogram" aria-hidden="true">w.</span>worklog <span>ao vivo</span></div>
      <p className={`live-pulse ${offline ? 'is-offline' : running ? 'is-running' : waiting ? 'is-waiting' : ''}`} role="status">
        <span className="live-dot" aria-hidden="true" />
        {offline ? `Sem conexão com o servidor local${lastOk ? ` · últimos dados às ${clock(lastOk)}` : ''}`
          : !live ? 'Conectando…'
          : running || waiting ? [running && `${running} ${running === 1 ? 'agente executando' : 'agentes executando'}`, waiting && `${waiting} aguardando você`].filter(Boolean).join(' · ')
          : 'Nenhum agente executando'}
        {!offline && age !== null && <small> · atualizado há {age} s</small>}
      </p>
      <div className="live-clock"><strong className="tabular">{clock(now)}</strong><span>{clock(now, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
    </header>
    <Totals data={data} />
    <DayRuler series={data?.series ?? null} now={now} />
    <main className="live-main">
      <ProjectsToday data={data} live={live} open={open} toggle={toggle} />
      <section className="live-now" aria-labelledby="live-now-title">
        <h2 id="live-now-title">Agora</h2>
        {!live ? <p className="live-empty">Carregando sessões…</p>
          : live.sessions.length ? <ul className="live-sessions">{live.sessions.slice(0, 6).map((s) => <SessionRow key={s.id} session={s} project={projectName(s.projectId)} client={s.projectId ? projects.get(s.projectId)?.client ?? null : null} machine={data ? machineName(data.settings, s.deviceId) : ''} now={now} fresh={fresh.sessions.has(s.id)} expanded={open === `s:${s.id}`} toggle={() => toggle(`s:${s.id}`)} />)}</ul>
          : <p className="live-empty">Nenhum agente executando agora.{live.feed[0] && <> Último sinal às {clock(live.feed[0].at)}.</>}</p>}
        {live && live.sessions.length > 6 && <p className="live-more">+ {live.sessions.length - 6} sessões ativas</p>}
        {live && !live.taskTitles && live.sessions.length > 0 && <p className="live-more">Títulos de tasks desligados. Ative em Integrações › Configuração.</p>}
        <h3>Recentes</h3>
        {live && <ol className="live-feed">{feedRows(live.feed, projectName).map((row) => { const key = `f:${row.id}`; const expanded = open === key; const session = row.item.sessionKey ? live.sessions.find((s) => sessionKey(s) === row.item.sessionKey) : undefined; return <li key={row.id} className={`tone-${row.tone}${fresh.feed.has(row.id) ? ' is-fresh' : ''}${expanded ? ' is-open' : ''}`}>
          <button type="button" className="live-feed-row" aria-expanded={expanded} aria-controls={`${key}-detail`} onClick={() => toggle(key)}>
            <time className="tabular" dateTime={row.at}>{clock(row.at)}</time><Icon name={row.icon} />
            <span className="live-feed-text"><strong>{row.title}{row.count > 1 && <span className="live-count"> ×{row.count}</span>}</strong><span>{row.meta}</span></span>
          </button>
          {expanded && <div id={`${key}-detail`} className="live-detail">
            <dl>
              <div><dt>Horário</dt><dd className="tabular">{row.count > 1 ? `${seconds(row.firstAt)} → ${seconds(row.at)} · ${row.count} ocorrências` : seconds(row.at)}</dd></div>
              <div><dt>Projeto</dt><dd>{projectName(row.item.projectId)}</dd></div>
              <div><dt>Origem</dt><dd>{toolNames[row.item.tool] ?? row.item.tool}{session ? ` · ${machineOf(session)}` : ''}</dd></div>
              {row.item.type === 'file.change' && row.item.detail && <div className="is-wide"><dt>Caminho</dt><dd className="live-path">{row.item.detail}</dd></div>}
              {row.item.outcome && <div><dt>Resultado</dt><dd>{outcomeLabel(row.item.outcome)}</dd></div>}
              {row.item.sessionKey && <div className="is-wide"><dt>Sessão</dt><dd className="live-path">{session ? `${session.nativeSessionId}${session.nativeAgentId ? ` · ${session.nativeAgentId}` : ''}` : row.item.sessionKey.slice(row.item.sessionKey.indexOf(':') + 1).replace(/:$/, '')}</dd></div>}
            </dl>
            {session && <button type="button" className="live-link-button" onClick={() => toggle(`s:${session.id}`)}>Ver sessão ativa</button>}
          </div>}
        </li>; })}</ol>}
        {live && !live.feed.length && <p className="live-empty">Nenhum evento hoje.</p>}
      </section>
    </main>
  </div>;
}

function Totals({ data }: { data: Data | null }) {
  const t = data?.summary.summary;
  const human = t ? t.humanEstimatedMs + t.humanAdjustedMs + t.humanManualMs : 0;
  return <section className="live-totals" aria-label="Totais de hoje">
    <div className="is-human"><span>Dedicação hoje <em>estimativa</em></span><strong className="tabular">{t ? (human || t.humanSignalCount ? compact(human) : 'Sem registro') : '—'}</strong><small>{t ? `automática ${compact(t.humanEstimatedMs)} · manual ${compact(t.humanManualMs)}${t.humanAdjustedMs ? ` · ajustada ${compact(t.humanAdjustedMs)}` : ''}` : ' '}</small></div>
    <div className="is-ai"><span>IA no relógio</span><strong className="tabular">{t ? compact(t.agentWallMs) : '—'}</strong><small>união, sem sobreposição</small></div>
    <div><span>IA acumulada</span><strong className="tabular">{t ? compact(t.agentAccumulatedMs) : '—'}</strong><small>soma por agente · não somada à dedicação</small></div>
    <div><span>Sessões hoje</span><strong className="tabular">{data ? data.summary.sessionCount : '—'}</strong><small>{t ? `${t.incompleteSessions} com evidência incompleta` : ' '}</small></div>
  </section>;
}

/** Régua de 24 h com a execução de IA por hora de hoje e o marcador de agora. */
function DayRuler({ series, now }: { series: TimeSeries | null; now: number }) {
  const weekday = new Date(`${dateInZone(new Date(now), ZONE)}T12:00:00Z`).getUTCDay();
  const hours = Array.from({ length: 24 }, (_, h) => series?.heatmap.find((c) => c.weekday === weekday && c.hour === h)?.agentWallMs ?? 0);
  const hour = Number(clock(now, { hour: '2-digit', hourCycle: 'h23' })); const minute = Number(clock(now, { minute: '2-digit' }));
  const position = ((hour + minute / 60) / 24) * 100;
  return <section className="live-ruler" aria-label="Execução de IA por hora hoje">
    <span className="live-ruler-label">IA por hora</span>
    <div className="live-ruler-track">
      {hours.map((ms, h) => <i key={h} className={h > hour ? 'is-future' : ''} style={{ '--fill': `${Math.min(1, ms / 3_600_000)}` } as React.CSSProperties} title={`${String(h).padStart(2, '0')}h: ${duration(ms)}`} />)}
      <b className="live-ruler-now" style={{ left: `${position}%` }} aria-hidden="true" />
      <div className="live-ruler-axis" aria-hidden="true">{[0, 6, 12, 18].map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}h</span>)}</div>
    </div>
  </section>;
}

function ProjectsToday({ data, live, open, toggle }: { data: Data | null; live: LiveState | null; open: string | null; toggle: (key: string) => void }) {
  if (!data) return <section className="live-projects"><h2>Projetos de hoje</h2><p className="live-empty">Carregando projetos…</p></section>;
  const humanOf = (t: Summary['summary']) => t.humanEstimatedMs + t.humanAdjustedMs + t.humanManualMs;
  const activeRows = data.summary.byProject.filter((p) => humanOf(p.summary) > 0 || p.summary.agentWallMs > 0 || p.sessionCount > 0);
  const max = Math.max(1, ...activeRows.flatMap((p) => [humanOf(p.summary), p.summary.agentWallMs]));
  const groups = new Map<string, typeof activeRows>();
  for (const row of [...activeRows].sort((a, b) => humanOf(b.summary) + b.summary.agentWallMs - humanOf(a.summary) - a.summary.agentWallMs)) {
    const key = row.client ?? ''; groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ordered = [...groups].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1));
  const shown = new Set(activeRows.map((p) => p.id));
  const quiet = data.projects.filter((p) => !shown.has(p.id)).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const activity = new Map<string, LiveSession>();
  for (const s of live?.sessions ?? []) if (s.projectId && (!activity.has(s.projectId) || s.state === 'running')) activity.set(s.projectId, s);
  return <section className="live-projects" aria-labelledby="live-projects-title">
    <div className="live-heading"><h2 id="live-projects-title">Projetos de hoje</h2><p className="live-legend"><span className="is-human">Dedicação</span><span className="is-ai">IA no relógio</span></p></div>
    {ordered.length ? <div className="live-groups">{ordered.map(([client, rows]) => <div key={client || 'none'} className="live-group">
      <h3>{client || 'Sem cliente'}</h3>
      <ul>{rows.map((p) => {
        const s = activity.get(p.id); const human = humanOf(p.summary); const key = `p:${p.id}`; const expanded = open === key;
        const sessions = (live?.sessions ?? []).filter((item) => item.projectId === p.id);
        const files = [...new Map((live?.feed ?? []).filter((item) => item.projectId === p.id && item.type === 'file.change' && item.detail).map((item) => [item.detail!, item] as const)).values()].slice(0, 6);
        return <li key={p.id} className={expanded ? 'is-open' : ''}>
          <button type="button" className="live-project-row" aria-expanded={expanded} aria-controls={`${key}-detail`} onClick={() => toggle(key)}>
            <span className="live-project-name"><strong>{p.name}</strong>{s ? <span className={s.state === 'running' ? 'is-running' : 'is-waiting'}>{s.state === 'running' ? `${toolNames[s.tool] ?? s.tool} · ${s.calls[0]?.name ?? 'executando'}` : `${toolNames[s.tool] ?? s.tool} · aguardando você`}</span> : <span>{p.sessionCount} {p.sessionCount === 1 ? 'sessão' : 'sessões'}</span>}</span>
            <span className="live-bars" aria-hidden="true"><i className="is-human" style={{ width: `${(human / max) * 100}%` }} /><i className="is-ai" style={{ width: `${(p.summary.agentWallMs / max) * 100}%` }} /></span>
            <span className="live-value is-human tabular" aria-label={`Dedicação ${duration(human)}`}>{human || p.summary.humanSignalCount ? compact(human) : '—'}</span>
            <span className="live-value tabular" aria-label={`IA no relógio ${duration(p.summary.agentWallMs)}`}>{compact(p.summary.agentWallMs)}</span>
          </button>
          {expanded && <div id={`${key}-detail`} className="live-detail">
            <dl>
              <div><dt>Dedicação automática</dt><dd className="tabular">{duration(p.summary.humanEstimatedMs)}</dd></div>
              <div><dt>Manual</dt><dd className="tabular">{duration(p.summary.humanManualMs)}</dd></div>
              <div><dt>Ajustada</dt><dd className="tabular">{duration(p.summary.humanAdjustedMs)}</dd></div>
              <div><dt>IA no relógio</dt><dd className="tabular">{duration(p.summary.agentWallMs)}</dd></div>
              <div><dt>IA acumulada</dt><dd className="tabular">{duration(p.summary.agentAccumulatedMs)}</dd></div>
              <div><dt>Sessões hoje</dt><dd className="tabular">{p.sessionCount}{p.summary.incompleteSessions ? ` · ${p.summary.incompleteSessions} incompletas` : ''}</dd></div>
            </dl>
            {sessions.length > 0 && <><h4>Agora</h4><ul className="live-detail-list">{sessions.map((item) => <li key={item.id}><button type="button" className="live-link-button" onClick={() => toggle(`s:${item.id}`)}>{toolNames[item.tool] ?? item.tool}{item.nativeAgentId ? ' · subagente' : ''}</button><span>{item.state === 'waiting' ? 'aguardando você' : item.task?.title ?? (item.calls[0] ? `${item.calls[0].name} em execução` : 'executando')}</span></li>)}</ul></>}
            {files.length > 0 && <><h4>Arquivos recentes</h4><ul className="live-detail-list">{files.map((item) => <li key={item.id}><span className="live-path">{item.detail}</span><span className="tabular">{clock(item.at)} · {outcomeLabel(item.outcome ?? '').toLowerCase()}</span></li>)}</ul></>}
            <a className="live-link-button" href={projectHref(p.id)} target="_blank" rel="noopener">Abrir projeto no Worklog<span className="sr-only"> (nova aba)</span></a>
          </div>}
        </li>;
      })}</ul>
    </div>)}</div> : <p className="live-empty">Nenhuma atividade atribuída a projetos hoje.</p>}
    {data.summary.summary.unassignedHumanMs > 0 && <p className="live-quiet">Não atribuído: {compact(data.summary.summary.unassignedHumanMs)}</p>}
    {quiet.length > 0 && <p className="live-quiet">Sem atividade hoje: {quiet.join(' · ')}</p>}
  </section>;
}

function SessionRow({ session: s, project, client, machine, now, fresh, expanded, toggle }: { session: LiveSession; project: string; client: string | null; machine: string; now: number; fresh: boolean; expanded: boolean; toggle: () => void }) {
  const call = s.calls[0]; const detail = `s:${s.id}-detail`;
  return <li className={`live-session is-${s.state}${fresh ? ' is-fresh' : ''}${expanded ? ' is-open' : ''}`}>
    <button type="button" className="live-session-toggle" aria-expanded={expanded} aria-controls={detail} onClick={toggle}>
      <span className="live-session-head">
        <strong>{project}</strong>
        <span className="tabular">{s.state === 'running' && s.turnStartedAt ? elapsed(now - Date.parse(s.turnStartedAt)) : s.state === 'waiting' ? `parado há ${elapsed(now - Date.parse(s.lastEventAt))}` : ''}</span>
      </span>
      <span className="live-session-task">{s.task?.title ? <><Icon name="task" />{s.task.title}{s.task.status === 'completed' && <em> · concluída</em>}</> : s.state === 'waiting' ? 'Aguardando você' : call ? `${call.name} em execução` : 'Executando'}</span>
      <span className="live-session-meta">{[s.nativeAgentId ? `${toolNames[s.tool] ?? s.tool} · subagente` : toolNames[s.tool] ?? s.tool, machine, client, s.task?.title && call ? `${call.name} em execução` : null, s.subagents ? `${s.subagents} ${s.subagents === 1 ? 'subagente' : 'subagentes'}` : null, s.lastFile ? basename(s.lastFile.path) : null].filter(Boolean).join(' · ')}</span>
    </button>
    {expanded && <div id={detail} className="live-detail">
      <dl>
        <div><dt>Início observado</dt><dd className="tabular">{seconds(s.startedAt)}</dd></div>
        <div><dt>Duração da sessão</dt><dd className="tabular">{duration(now - Date.parse(s.startedAt))} <small>inclui pausas</small></dd></div>
        <div><dt>Turno atual</dt><dd className="tabular">{s.turnStartedAt ? `desde ${seconds(s.turnStartedAt)}` : 'nenhum em curso'}</dd></div>
        <div><dt>Turnos · eventos</dt><dd className="tabular">{s.turns} · {s.eventCount}</dd></div>
        <div><dt>Perfil · máquina</dt><dd>{s.profile || 'padrão'} · {machine}</dd></div>
        <div className="is-wide"><dt>Sessão</dt><dd className="live-path">{s.nativeSessionId}{s.nativeAgentId ? ` · ${s.nativeAgentId}` : ''}</dd></div>
      </dl>
      {s.calls.length > 0 && <><h4>Em execução</h4><ul className="live-detail-list">{s.calls.map((item, index) => <li key={index}><strong>{item.name}</strong><span className="tabular">há {elapsed(now - Date.parse(item.startedAt))}</span></li>)}</ul></>}
      {s.tasks.length > 0 && <><h4>Tasks da sessão</h4><ul className="live-detail-list">{s.tasks.map((item, index) => <li key={index} className={`is-${item.status}`}><strong>{item.title ?? 'Task sem título'}</strong><span>{outcomeLabel(item.status).toLowerCase()} · {clock(item.at)}</span></li>)}</ul></>}
      {s.recentCalls.length > 0 && <><h4>Últimas chamadas</h4><ul className="live-detail-list">{groupCalls(s.recentCalls).map((item, index) => <li key={index} className={item.outcome !== 'completed' ? 'is-failed' : ''}><strong>{item.name}{item.count > 1 && <span className="live-count"> ×{item.count}</span>}</strong><span className="tabular">{clock(item.endedAt)} · {duration(item.ms)}{item.count > 1 ? ' no total' : ''}{item.outcome !== 'completed' ? ` · ${outcomeLabel(item.outcome).toLowerCase()}` : ''}</span></li>)}</ul></>}
      {s.recentFiles.length > 0 && <><h4>Arquivos alterados</h4><ul className="live-detail-list">{s.recentFiles.map((item) => <li key={item.path}><span className="live-path">{item.path}</span><span className="tabular">{clock(item.at)} · {outcomeLabel(item.operation).toLowerCase()}</span></li>)}</ul></>}
      <p className="live-detail-note">Duração da sessão e execução de IA não representam dedicação humana.</p>
      {s.projectId && <a className="live-link-button" href={projectHref(s.projectId)} target="_blank" rel="noopener">Abrir projeto no Worklog<span className="sr-only"> (nova aba)</span></a>}
    </div>}
  </li>;
}
