import { useEffect, useRef, useState } from 'react';
import type { CommitDetail, FileChange, FileScan, GitCommit, PullRequestSnapshot } from '../../core/contracts.js';
import { api, errorMessage, timestamp, machineName, type DashboardData, type Page } from '../api.js';
import { SessionTable } from './Overview.js';
import { PullRequestDetails, PullRequestRows } from './PullRequests.js';
import { NoteEditor } from './Notes.js';
import { Adjustments } from './Adjustments.js';
import { FileCoverage, fileOperations, unavailable } from './Files.js';

interface Repository { id: string; canonical: string; sync: { lastSyncedAt: string | null; error: string | null; nextSyncAt: number } | null }
interface DetailData { summary: { text: string; evidenceIds: string[]; ruleVersion: string }; files: Page<FileChange> & { scans: FileScan[] }; commits: Page<GitCommit>; prs: Page<PullRequestSnapshot> & { repositories: Repository[] } }
export function ProjectDetail({ id, data, query, updated, back, openSession, openRevision, moreSessions, sessionsLoading, pauseRefresh, refresh }: { id: string; data: DashboardData; query: string; updated: string; back: () => void; openSession: (id: string) => void; openRevision: (id: string) => void; moreSessions: () => void; sessionsLoading: boolean; pauseRefresh: () => void; refresh: () => void }) {
  const project = data.projects.items.find((p) => p.id === id);
  const [detail, setDetail] = useState<DetailData | null>(null); const [error, setError] = useState(''); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false);
  const [pr, setPr] = useState<PullRequestSnapshot | null>(null); const [commit, setCommit] = useState<CommitDetail | null>(null); const dialog = useRef<HTMLDialogElement>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const commitRequest = useRef<AbortController | null>(null);
  useEffect(() => () => commitRequest.current?.abort(), []);
  useEffect(() => {
    pageRequest.current?.abort();
    const controller = new AbortController(); const options = { signal: controller.signal };
    void Promise.all([api<DetailData['summary']>(`/api/work-summary?${query}`, options), api<DetailData['files']>(`/api/files?${query}&limit=20`, options), api<Page<GitCommit>>(`/api/commits?${query}&limit=20`, options), api<DetailData['prs']>(`/api/prs?${query}&limit=20`, options)]).then(([summary, files, commits, prs]) => { if (!controller.signal.aborted) { setDetail({ summary, files, commits, prs }); setError(''); } }).catch((e) => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => { controller.abort(); pageRequest.current?.abort(); };
  }, [query, updated, revision]);
  async function more(kind: 'files' | 'commits' | 'prs') {
    const cursor = detail?.[kind].nextCursor; if (!cursor || busy) return;
    const controller = new AbortController(); pageRequest.current = controller; setBusy(true); setError(''); pauseRefresh();
    try {
      const next = await api<Page<FileChange | GitCommit | PullRequestSnapshot>>(`/api/${kind}?${query}&limit=20&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal });
      if (!controller.signal.aborted) setDetail((current) => current ? { ...current, [kind]: { ...current[kind], ...next, items: [...current[kind].items, ...next.items] } } as DetailData : current);
    } catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function closeEvidence() { commitRequest.current?.abort(); dialog.current?.close(); setBusy(false); }
  function showPr(item: PullRequestSnapshot) { commitRequest.current?.abort(); setPr(item); setCommit(null); dialog.current?.showModal(); }
  async function showCommit(id: string) {
    commitRequest.current?.abort(); const controller = new AbortController(); commitRequest.current = controller;
    setBusy(true); setError(''); setPr(null); setCommit(null); dialog.current?.showModal();
    try { const value = await api<CommitDetail>(`/api/commits/${id}`, { signal: controller.signal }); if (!controller.signal.aborted) setCommit(value); }
    catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function sync(repositoryId: string) { setBusy(true); try { await api('/api/prs/sync', { method: 'POST', body: JSON.stringify({ repositoryId }) }); setRevision((n) => n + 1); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <>
    <section className="panel"><div className="section-heading"><div><h2>Histórico do projeto</h2><p>{project?.name ?? 'Projeto'} · {project?.client ?? 'Sem cliente associado'}</p></div><button className="button-flat" onClick={back}>Voltar aos projetos</button></div>
      <div className="instructions">{project?.roots.map((root) => <p key={root.id}><code>{root.path}</code> · {machineName(data.settings, root.deviceId)}{!root.enabled && ' · raiz pausada'}</p>)}<p className="muted">Todos os blocos usam os filtros acima. Links explícitos podem abrir evidências relacionadas fora do recorte, com origem identificada.</p></div>
    </section>
    <section className="panel"><div className="instructions"><NoteEditor targetId={id} timezone={data.settings.timezone} from={new URLSearchParams(query).get('from')!} changed={refresh} /></div></section>
    <Adjustments projectId={id} query={query} changed={refresh} />
    {error && <p role="alert" className="error-banner">{error} {detail && 'As evidências abaixo podem estar desatualizadas.'}<button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</button></p>}
    {!detail && !error && <p role="status">Carregando evidências do projeto…</p>}
    <SessionTable data={data} open={openSession} more={moreSessions} loading={sessionsLoading} />
    {detail && <>
      <section className="panel"><div className="section-heading"><h2>Resumo com evidências</h2><span className="badge">{detail.summary.ruleVersion}</span></div><div className="instructions"><pre className="work-summary">{detail.summary.text}</pre><p className="muted">{detail.summary.evidenceIds.length} evidência(s) referenciada(s). Nenhuma síntese por IA externa.</p></div></section>
      <section className="panel"><div className="section-heading"><h2>Revisões do projeto</h2></div>{detail.files.items.length ? <ul className="file-history instructions">{detail.files.items.map((file) => <li key={file.id}><button className="session-link git-path" onClick={() => openRevision(file.id)}>{file.path}</button><small>{timestamp(file.occurredAt, data.settings.timezone)} · {fileOperations[file.operation]} · {file.unavailableReason ? unavailable[file.unavailableReason] ?? 'Conteúdo indisponível.' : 'Conteúdo elegível'}</small></li>)}</ul> : <div className="empty-state"><p>Nenhuma revisão para estes filtros.</p></div>}{detail.files.nextCursor && <div className="panel-bottom"><button disabled={busy} onClick={() => void more('files')}>Carregar mais revisões</button></div>}</section>
      <section className="panel"><div className="section-heading"><h2>Commits do projeto</h2></div>{detail.commits.items.length ? <ul className="file-history instructions">{detail.commits.items.map((item) => <li key={item.id}><button className="session-link" disabled={busy} aria-label={`Abrir commit ${item.sha.slice(0, 12)}`} onClick={() => void showCommit(item.id)}>{item.message.split('\n')[0]}</button><small>{item.sha.slice(0, 12)} · {timestamp(item.committedAt, data.settings.timezone)}</small></li>)}</ul> : <div className="empty-state"><p>Nenhum commit para estes filtros.</p></div>}{detail.commits.nextCursor && <div className="panel-bottom"><button disabled={busy} onClick={() => void more('commits')}>Carregar mais commits</button></div>}</section>
      <section className="panel"><div className="section-heading"><h2>Pull requests do projeto</h2></div><PullRequestRows items={detail.prs.items} open={showPr} timezone={data.settings.timezone} /><div className="instructions">{detail.prs.repositories.map((repo) => <p key={repo.id}><strong>{repo.canonical}</strong> · {repo.sync?.error && <>Falha na leitura: {repo.sync.error}. Histórico preservado. </>}{repo.sync?.lastSyncedAt ? `Última leitura: ${timestamp(repo.sync.lastSyncedAt, data.settings.timezone)}` : 'Ainda não sincronizado'} <button className="button-flat compact" disabled={busy} onClick={() => void sync(repo.id)}>Sincronizar PRs</button></p>)}</div>{detail.prs.nextCursor && <div className="panel-bottom"><button disabled={busy} onClick={() => void more('prs')}>Carregar mais PRs</button></div>}</section>
      <FileCoverage scans={detail.files.scans} data={data} />
    </>}
    <section className="panel"><div className="section-heading"><h2>Origens e lacunas</h2></div><div className="instructions">{data.sources.items.filter((s) => project?.roots.some((r) => r.deviceId === s.deviceId)).map((s) => <div key={s.id}><p>{s.tool} · {s.profile} · {machineName(data.settings, s.deviceId)} — {{ observed: 'Eventos recebidos', 'no-data': 'Sem dados', paused: 'Pausada', removed: 'Removida', unsupported: 'Versão não suportada', delayed: 'Sincronização atrasada', error: 'Requer atenção' }[s.state]}{s.availability === 'missing' && ' · configuração ausente'}{s.diagnostic && ` · ${s.diagnostic}`}</p>{s.remote?.last_error && <p>Fonte offline; histórico preservado.</p>}{s.lagMs !== null && s.lagMs > 60000 && <p>Sincronização atrasada.</p>}<p className="muted">{s.lastActivity ? `Último evento: ${timestamp(s.lastActivity, data.settings.timezone)}` : 'Nenhum evento recebido.'}{s.remote?.last_sync_at && ` · Última sincronização: ${timestamp(s.remote.last_sync_at, data.settings.timezone)}`}</p></div>)}<p className="muted">Fontes das máquinas cadastradas; ter uma fonte na máquina não comprova autoria de todas as mudanças do projeto.</p></div></section>
    <dialog className="session-dialog" ref={dialog} aria-label={pr ? 'Pull request' : 'Commit do projeto'} onCancel={closeEvidence}><div className="section-heading"><h2>{pr ? 'Pull request' : 'Commit do projeto'}</h2><button className="button-flat" onClick={closeEvidence}>Fechar evidência</button></div>{!pr && !commit && busy && <p role="status" className="instructions">Carregando commit…</p>}{error && <p role="alert" className="inline-error">{error}</p>}{pr && <PullRequestDetails item={pr} timezone={data.settings.timezone} />}{commit && <div className="detail-body"><h3>{commit.message.split('\n')[0]}</h3><code>{commit.sha}</code><pre className="revision-content">{commit.message}</pre><h3>PRs comprovados por SHA</h3>{commit.pullRequests.length ? commit.pullRequests.map((item) => <button className="session-link" key={item.id} onClick={() => showPr(item)}>Abrir PR #{item.number}</button>) : <p>Nenhum PR comprovado para este commit.</p>}</div>}</dialog>
  </>;
}
