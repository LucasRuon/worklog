import { useEffect, useRef, useState } from 'react';
import type { FileChange, Project, Session, Tool } from '../core/contracts.js';
import { dateInZone, nextDate, startOfDay } from '../core/dates.js';
import { api, ApiError, errorMessage, timestamp, stateLabels, duration, machineName, type Activity as ActivityData, type DashboardData, type Page, type Settings, type Source, type Summary } from './api.js';
import { Overview } from './pages/Overview.js';
import { Projects } from './pages/Projects.js';
import { Activity } from './pages/Activity.js';
import { Integrations } from './pages/Integrations.js';
import { Commits } from './pages/Commits.js';
import { Exports } from './pages/Exports.js';
import { Files, fileOperations } from './pages/Files.js';
import { Shell, views, type View } from './Shell.js';
import { ProjectDetail } from './pages/ProjectDetail.js';
import { NoteEditor } from './pages/Notes.js';

export function Workspace({ logout, expired }: { logout: () => void; expired: () => void }) {
  const initialView = new URLSearchParams(location.search).get('view') as View;
  const [view, setView] = useState<View>(Object.hasOwn(views, initialView) ? initialView : 'overview');
  const today = dateInZone(new Date(), 'America/Sao_Paulo');
  const initialProject = initialView === 'projects' ? new URLSearchParams(location.search).get('project') : null;
  const [from, setFrom] = useState(today); const [to, setTo] = useState(today); const [projects, setProjects] = useState<string[]>(initialProject ? [initialProject] : []);
  const [tool, setTool] = useState(''); const [device, setDevice] = useState(''); const [unassigned, setUnassigned] = useState(false);
  const [source, setSource] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [projectTarget, setProjectTarget] = useState<string | null>(initialProject);
  const [data, setData] = useState<DashboardData | null>(null); const [loadedKey, setLoadedKey] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0); const [moreBusy, setMoreBusy] = useState(false); const [updated, setUpdated] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<{ session: Session; executions: { start: string; end: string; complete: boolean }[]; hasMore: boolean; files: FileChange[]; filesHasMore: boolean } | null>(null);
  const [fileTarget, setFileTarget] = useState<string | null>(new URLSearchParams(location.search).get('revision'));
  const [detailError, setDetailError] = useState(''); const dialog = useRef<HTMLDialogElement>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  let query = ''; let filterError = '';
  try {
    if (from > to) throw new Error();
    query = new URLSearchParams({ from: startOfDay(from, 'America/Sao_Paulo'), to: startOfDay(nextDate(to), 'America/Sao_Paulo'), timezone: 'America/Sao_Paulo', projectIds: view === 'projects' && projectTarget ? projectTarget : projects.join(','), tools: tool, deviceIds: device, sourceIds: source, includeUnassigned: (unassigned || onlyUnassigned && view === 'activity') && view !== 'exports' && view !== 'files' && !projectTarget ? '1' : '0', onlyUnassigned: onlyUnassigned && view === 'activity' ? '1' : '0' }).toString();
  } catch { filterError = 'Selecione um período válido. A data final inclui o dia inteiro.'; }
  if (view === 'integrations') {
    filterError = '';
    query = new URLSearchParams({ from: startOfDay(today, 'America/Sao_Paulo'), to: startOfDay(nextDate(today), 'America/Sao_Paulo'), timezone: 'America/Sao_Paulo', projectIds: '', tools: '', deviceIds: '', includeUnassigned: '0' }).toString();
  }
  const key = query;
  const currentKey = useRef(key); currentKey.current = key;
  const refresh = () => { setExpanded(false); setRevision((value) => value + 1); };
  useEffect(() => () => { sessionRequest.current?.abort(); dialog.current?.close(); }, [query]);

  useEffect(() => { if (expanded || moreBusy) return; const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [expanded, moreBusy]);
  useEffect(() => { setExpanded(false); }, [query]);
  useEffect(() => {
    if (!query || filterError) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    const options = { signal: controller.signal };
    void Promise.all([
      api<Page<Project>>('/api/projects?limit=100', options), api<Page<Session>>(`/api/sessions?${query}`, options), api<Page<ActivityData>>(`/api/activity?${query}`, options), api<Summary>(`/api/summary?${query}`, options), api<{ items: Source[]; collectorStatus: string }>('/api/sources', options), api<Settings>('/api/settings', options),
    ]).then(([projects, sessions, activity, summary, sources, settings]) => {
      setData({ projects, sessions, activity, summary, sources, settings }); setLoadedKey(key); setUpdated(new Date().toISOString()); setLoading(false);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) expired();
      setError(errorMessage(error)); setLoading(false);
    });
    return () => controller.abort();
  }, [query, revision]);

  async function more(kind: 'projects' | 'sessions' | 'activity') {
    const cursor = data?.[kind].nextCursor; if (!cursor || moreBusy) return;
    setMoreBusy(true);
    try {
      const suffix = kind === 'projects' ? 'limit=100' : query;
      const page = await api<Page<Project | Session | ActivityData>>(`/api/${kind}?${suffix}&cursor=${encodeURIComponent(cursor)}`);
      if (currentKey.current === key) { setData((previous) => previous ? { ...previous, [kind]: { items: [...previous[kind].items, ...page.items], nextCursor: page.nextCursor } } as DashboardData : previous); setExpanded(true); }
    } catch (error) { setError(errorMessage(error)); } finally { setMoreBusy(false); }
  }
  async function openSession(id: string) {
    sessionRequest.current?.abort(); const controller = new AbortController(); sessionRequest.current = controller;
    setDetail(null); setDetailError(''); dialog.current?.showModal();
    try { const value = await api<NonNullable<typeof detail>>(`/api/sessions/${id}`, { signal: controller.signal }); if (!controller.signal.aborted) setDetail(value); } catch (error) { if (!controller.signal.aborted) setDetailError(errorMessage(error)); }
  }
  function closeSession() { sessionRequest.current?.abort(); dialog.current?.close(); }
  function openRevision(id: string) { closeSession(); if (projectTarget) setProjects([projectTarget]); setProjectTarget(null); setFileTarget(id); setView('files'); history.replaceState(null, '', `?view=files&revision=${id}`); }
  function openProject(id: string) { setProjectTarget(id); setProjects([id]); history.replaceState(null, '', `?view=projects&project=${id}`); }
  function selectProjects(ids: string[]) { setProjects(ids); if (projectTarget) { setProjectTarget(null); history.replaceState(null, '', '?view=projects'); } }
  const names = new Map(data?.projects.items.map((project) => [project.id, project.name]));
  const available = data && loadedKey === key && !filterError;
  return <Shell view={view} navigate={(view) => { setView(view); setProjectTarget(null); history.replaceState(null, '', `?view=${view}`); }} logout={logout} authenticated>
    <div className="page-heading"><div><h1>{views[view]}</h1><p className="intro">{view === 'overview' ? 'Seu trabalho por projeto, com origem e natureza de cada medida.' : view === 'projects' ? 'Identidades estáveis, mesmo em clones, pastas e worktrees diferentes.' : view === 'activity' ? 'Metadados observados, sem prompts ou transcrições brutas.' : view === 'files' ? 'Revisões entre commits, diffs e relações com grau de confiança visível.' : view === 'commits' ? 'Mensagens, autoria e arquivos do Git, preservados por repositório.' : view === 'exports' ? 'Selecione projetos e período, confira a prévia e baixe seu relatório.' : 'Compatibilidade, dados recebidos e regras de estimativa.'}</p></div><button className="button-flat" onClick={refresh} disabled={loading || moreBusy}>Atualizar</button></div>
    {view !== 'integrations' && <section className="filter-bar" aria-label="Filtros do histórico">
      <label>De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Até (inclusive)<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      <div className="filter-field"><span aria-hidden="true">Projetos</span><details className="project-filter"><summary>{projects.length ? `${projects.length} projeto(s)` : 'Todos os projetos'}</summary><div>{data?.projects.items.map((project) => <label key={project.id}><input type="checkbox" checked={projects.includes(project.id)} onChange={(event) => selectProjects(event.target.checked ? [...projects, project.id] : projects.filter((id) => id !== project.id))} />{project.name}</label>)}{!data?.projects.items.length && <p>Nenhum projeto cadastrado.</p>}<button className="button-flat" onClick={() => selectProjects([])}>{view === 'exports' ? 'Limpar seleção' : 'Todos os projetos'}</button></div></details></div>
      <label>Ferramenta<select value={tool} onChange={(event) => setTool(event.target.value)}><option value="">Todas</option>{(['claude', 'codex', 'opencode', 'git', 'files', 'focus'] as Tool[]).map((tool) => <option key={tool} value={tool}>{tool === 'focus' ? 'Sinais explícitos' : tool === 'git' ? 'Git' : tool === 'files' ? 'Arquivos' : tool}</option>)}</select></label>
      <label>Máquina<select value={device} onChange={(event) => setDevice(event.target.value)}><option value="">Todas</option>{[...new Set([...(data?.sources.items.map((source) => source.deviceId) ?? []), ...(data?.settings.devices?.map((d) => d.id) ?? []), ...(data ? [data.settings.deviceId] : [])])].map((id) => <option key={id} value={id}>{data ? machineName(data.settings, id) : id.slice(0, 8)}</option>)}</select></label>
      <label>Fonte / perfil<select aria-label="Fonte / perfil" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Todas as fontes</option>{data?.sources.items.map((item) => <option key={item.id} value={item.id}>{item.tool} · {item.profile} · {machineName(data.settings, item.deviceId)}</option>)}</select></label>
      {view !== 'exports' && view !== 'commits' && view !== 'files' && !projectTarget && <label className="checkbox-label"><input type="checkbox" checked={unassigned} onChange={(event) => { setUnassigned(event.target.checked); setOnlyUnassigned(false); }} />Incluir sem projeto</label>}
      {view === 'activity' && <label className="checkbox-label"><input type="checkbox" checked={onlyUnassigned} onChange={(event) => { setOnlyUnassigned(event.target.checked); setUnassigned(false); }} />Somente sem projeto</label>}
      <small className="filter-timezone">America/Sao_Paulo · início inclusivo e fim exclusivo na consulta</small>
    </section>}
    {filterError && <p role="alert" className="error-banner">{filterError}</p>}
    {error && <div role="alert" className="error-banner">{error} {available && 'Os dados abaixo podem estar desatualizados.'}<button className="button-flat" onClick={refresh}>Tentar novamente</button></div>}
    {loading && <p role="status" className="loading-status">{available ? 'Atualizando dados…' : 'Carregando histórico…'}</p>}
    {available && <>
      {view !== 'integrations' && data.sessions.items.some((session) => session.provenance === 'imported' || session.provenance === 'mixed') && <p className="summary-notes">Esta seleção contém histórico importado ou misto. Consulte a proveniência nos detalhes; registros ausentes não são reconstruídos.</p>}
      {view === 'overview' && <Overview data={data} refresh={refresh} openSession={(id) => void openSession(id)} moreSessions={() => void more('sessions')} loading={moreBusy} />}
      {view === 'projects' && (projectTarget ? <ProjectDetail key={query} id={projectTarget} data={data} query={query} updated={updated} back={() => { setProjectTarget(null); history.replaceState(null, '', '?view=projects'); }} openSession={(id) => void openSession(id)} openRevision={openRevision} moreSessions={() => void more('sessions')} sessionsLoading={moreBusy} pauseRefresh={() => setExpanded(true)} refresh={refresh} /> : <><div className="instructions"><button className="button-flat" onClick={() => { setProjectTarget(null); setView('activity'); setOnlyUnassigned(true); setUnassigned(false); history.replaceState(null, '', '?view=activity'); }}>Revisar atividades sem projeto</button></div><Projects data={data} selectedIds={projects} refresh={refresh} more={() => void more('projects')} loading={moreBusy} openProject={openProject} /></>)}
      {view === 'activity' && onlyUnassigned && <p className="summary-notes">Somente atividades sem projeto. Cadastre ou associe a pasta de origem em Projetos para reprocessar a atribuição; eventos sem pasta permanecem sem projeto.</p>}
      {view === 'activity' && <Activity data={data} more={() => void more('activity')} moreSessions={() => void more('sessions')} openSession={(id) => void openSession(id)} loading={moreBusy} />}
      {view === 'files' && <Files key={query} data={data} query={query} updated={updated} initialRevision={fileTarget} clearTarget={() => { setFileTarget(null); }} openSession={(id) => void openSession(id)} />}
      {view === 'commits' && <Commits key={query} data={data} query={query} updated={updated} />}
      {view === 'exports' && <Exports key={query} data={data} query={query} moreProjects={() => void more('projects')} loading={moreBusy} />}
      {view === 'integrations' && <Integrations data={data} refresh={refresh} />}
      <p className="updated-at">Consulta atualizada em {timestamp(updated, data.settings.timezone)} · {expanded ? 'paginação expandida; use Atualizar para buscar novos eventos.' : 'atualização automática a cada 5 s.'}</p>
    </>}
    <dialog ref={dialog} className="session-dialog" aria-labelledby="detail-title" onCancel={() => sessionRequest.current?.abort()}>
      <div className="section-heading"><h2 id="detail-title">Detalhes da sessão</h2><button className="button-flat" onClick={closeSession} aria-label="Fechar detalhes">Fechar</button></div>
      {detailError && <p role="alert" className="inline-error">{detailError}</p>}{!detail && !detailError && <p role="status">Carregando sessão…</p>}
      {detail && <div className="detail-body"><h3>{detail.session.projectId ? names.get(detail.session.projectId) ?? 'Projeto' : 'Sem projeto'}</h3><p className="session-native">{detail.session.nativeSessionId}</p>
        <dl>
          <div><dt>Ferramenta / perfil</dt><dd>{detail.session.tool} · {detail.session.profile}</dd></div>
          <div><dt>Máquina de origem</dt><dd>{data ? machineName(data.settings, detail.session.deviceId) : detail.session.deviceId}</dd></div>
          <div><dt>Estado</dt><dd>{stateLabels[detail.session.state]}{!detail.session.complete && ' · evidência incompleta'}</dd></div>
          <div><dt>Início observado</dt><dd>{timestamp(detail.session.startedAt, data?.settings.timezone)}</dd></div>
          <div><dt>Última evidência</dt><dd>{timestamp(detail.session.lastEventAt, data?.settings.timezone)}</dd></div>
          <div><dt>Duração observada da sessão</dt><dd>{duration(Date.parse(detail.session.lastEventAt) - Date.parse(detail.session.startedAt))} · inclui pausas</dd></div>
           <div><dt>Eventos</dt><dd>{detail.session.eventCount}</dd></div>
           <div><dt>Proveniência</dt><dd>{detail.session.provenance === 'imported' ? 'Histórico importado' : detail.session.provenance === 'mixed' ? 'Coleta observada e histórico importado' : 'Coleta observada'}</dd></div>
          {detail.session.nativeAgentId && <div><dt>Subagente</dt><dd>{detail.session.nativeAgentId}</dd></div>}
          {detail.session.parentSessionId && <div><dt>Sessão pai</dt><dd><button className="button-flat" onClick={() => void openSession(detail.session.parentSessionId!)}>Abrir sessão pai</button></dd></div>}
        </dl>
        <h3>Execuções de turno observadas</h3>
        {detail.executions.length ? <ul className="execution-list">{detail.executions.map((execution, index) => <li key={index}><span>{timestamp(execution.start, data?.settings.timezone)} → {timestamp(execution.end, data?.settings.timezone)}</span><span>{duration(Date.parse(execution.end) - Date.parse(execution.start))}{!execution.complete && ' · incompleta'}</span></li>)}</ul> : <p className="muted">Sem pares de início/fim disponíveis.</p>}
        {detail.hasMore && <p className="muted">Exibindo os primeiros 100 turnos.</p>}
        <h3>Arquivos relacionados</h3>
        {detail.files?.length ? <ul className="file-history">{detail.files.map((file) => <li key={file.id}><button className="session-link git-path" onClick={() => openRevision(file.id)}>{file.path}</button><small>{fileOperations[file.operation]} · {file.associationConfidence === 'explicit' ? 'Associação explícita' : 'Inferência temporal; não comprova autoria'}</small></li>)}</ul> : <p className="muted">Sem revisão vinculada a esta sessão. Proximidade temporal isolada não comprova autoria.</p>}
        {detail.filesHasMore && <p className="muted">Exibindo as 100 revisões relacionadas mais recentes.</p>}
         <p className="muted">Duração da sessão e execução de IA não representam dedicação humana. Pares ausentes são limitados à última evidência, sem prolongamento indefinido.</p>
         {detail.session.projectId && <NoteEditor key={detail.session.id} targetId={detail.session.id} timezone={data?.settings.timezone ?? 'America/Sao_Paulo'} from={detail.session.startedAt} />}
      </div>}
    </dialog>
  </Shell>;
}
