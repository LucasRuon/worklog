import { useEffect, useRef, useState } from 'react';
import type { FileChange, FileDetail, FileScan, CommitDetail, PullRequestSnapshot } from '../../core/contracts.js';
import { PullRequestDetails } from './PullRequests.js';
import { api, errorMessage, machineName, timestamp, type DashboardData, type Page } from '../api.js';

export const fileOperations = { baseline: 'Estado inicial observado', create: 'Criação observada', edit: 'Edição observada', delete: 'Exclusão observada', rename: 'Renome comprovado' };
export const unavailable: Record<string, string> = { binary: 'Arquivo binário: somente metadados.', 'too-large': 'Acima de 2 MiB: somente metadados.', 'invalid-utf8': 'Codificação textual não suportada.', deleted: 'Arquivo excluído; o diff usa a revisão anterior quando disponível.', retention: 'Conteúdo de uma revisão não está mais disponível.', policy: 'Conteúdo indisponível pela política atual ou pela indisponibilidade da raiz.', baseline: 'Este é o primeiro estado observado; não há revisão anterior capturada.', 'diff-limit': 'Diff excede o limite de tempo ou de tamanho; consulte as revisões preservadas.' };
interface History extends Page<FileChange> { scans: FileScan[] }
export function FileCoverage({ scans, data }: { scans: FileScan[]; data: DashboardData }) {
  const names = new Map(data.projects.items.map((p) => [p.id, p.name]));
  return <section className="panel" aria-labelledby="file-coverage-title"><div className="section-heading"><h2 id="file-coverage-title">Cobertura do monitoramento</h2><span className="muted">Debounce 500 ms · reconciliação 30 s</span></div><div className="instructions">{!scans.length && <p>Nenhuma raiz nesta seleção.</p>}{scans.map((scan) => <p key={scan.rootId}><strong>{names.get(scan.projectId) ?? 'Projeto'}</strong> · {machineName(data.settings, scan.deviceId)}<br /><span className="git-path">{scan.path}</span><br />{scan.error === 'FILES_REMOTE_UNAVAILABLE' ? 'Aguardando coletor remoto com suporte a revisões.' : scan.error ? `Lacuna de observação: ${scan.error}. Último histórico preservado.` : scan.pending ? 'Captura parcial em andamento; próximas rodadas continuam.' : scan.scannedAt ? `Última reconciliação: ${timestamp(scan.scannedAt, data.settings.timezone)}` : 'Aguardando primeira observação.'}{scan.monitoringSince && <><br />Monitoramento iniciado em {timestamp(scan.monitoringSince, data.settings.timezone)}</>}{scan.lastGapAt && <><br />Última lacuna registrada em {timestamp(scan.lastGapAt, data.settings.timezone)}. Não há garantia de estados intermediários.</>}</p>)}</div></section>;
}
export function Files({ data, query, updated, initialRevision, clearTarget, openSession }: { data: DashboardData; query: string; updated: string; initialRevision: string | null; clearTarget: () => void; openSession: (id: string) => void }) {
  const [history, setHistory] = useState<History | null>(null); const [error, setError] = useState(''); const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<FileDetail | null>(null); const [commit, setCommit] = useState<CommitDetail | null>(null); const [pr, setPr] = useState<PullRequestSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const [session, setSession] = useState('');
  const modal = useRef<HTMLDialogElement>(null); const detailRequest = useRef<AbortController | null>(null);
  const names = new Map(data.projects.items.map((p) => [p.id, p.name]));
  useEffect(() => {
    if (expanded) return;
    const controller = new AbortController();
    void api<History>(`/api/files?${query}`, { signal: controller.signal }).then((value) => { setHistory(value); setError(''); }).catch((e) => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [query, updated, expanded, revision]);
  useEffect(() => { if (initialRevision) void show(initialRevision); }, [initialRevision]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  async function show(id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setDetail(null); setCommit(null); setPr(null); setDetailError(''); setSession(''); modal.current?.showModal();
    try { setDetail(await api<FileDetail>(`/api/files/${id}`, { signal: controller.signal })); if (modal.current) modal.current.scrollTop = 0; }
    catch (e) { if (!controller.signal.aborted) setDetailError(errorMessage(e)); }
  }
  async function showCommit(id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller; setBusy(true); setDetailError('');
    try { setCommit(await api<CommitDetail>(`/api/commits/${id}`, { signal: controller.signal })); setPr(null); if (modal.current) modal.current.scrollTop = 0; }
    catch (e) { if (!controller.signal.aborted) setDetailError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function more() {
    if (!history?.nextCursor) return; setBusy(true);
    try { const next = await api<History>(`/api/files?${query}&cursor=${encodeURIComponent(history.nextCursor)}`); setHistory({ ...next, items: [...history.items, ...next.items] }); setExpanded(true); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function associate() {
    if (!detail || !session) return; setBusy(true); setDetailError('');
    try { await api('/api/evidence-links', { method: 'POST', body: JSON.stringify({ revisionId: detail.revision.id, sessionId: session }) }); setDetail(await api<FileDetail>(`/api/files/${detail.revision.id}`)); }
    catch (e) { setDetailError(errorMessage(e)); } finally { setBusy(false); }
  }
  function close() { detailRequest.current?.abort(); modal.current?.close(); clearTarget(); }
  return <>
    <section className="panel" aria-labelledby="files-title"><div className="section-heading"><div><h2 id="files-title">Histórico de arquivos</h2><p className="muted">Revisões a partir do monitoramento · texto até 2 MiB · horários de observação</p></div><button className="button-flat compact" onClick={() => { setExpanded(false); setRevision((r) => r + 1); }}>Atualizar arquivos</button></div>
      {error && <p role="alert" className="error-banner">{error}</p>}{!history && !error && <p role="status" className="instructions">Carregando arquivos…</p>}
      {history && (history.items.length ? <div className="table-scroll"><table><thead><tr><th>Arquivo / operação</th><th>Projeto / máquina</th><th>Observado em</th><th>Conteúdo</th></tr></thead><tbody>{history.items.map((file) => <tr key={file.id}><td><button className="session-link git-path" onClick={() => void show(file.id)} aria-label={`Abrir revisão de ${file.path}`}>{file.path}</button><small>{fileOperations[file.operation]}{file.previousPath && ` · antes: ${file.previousPath}`}</small></td><td>{names.get(file.projectId) ?? 'Projeto'}<small>{machineName(data.settings, file.deviceId)}</small></td><td className="tabular">{timestamp(file.occurredAt, data.settings.timezone)}<small>{file.observation === 'baseline' ? 'Estado inicial; criação original desconhecida' : file.observation === 'watch' ? 'Gravação detectada; horário exato desconhecido' : 'Reconciliação; mudança pode ter ocorrido na lacuna'}</small></td><td>{file.unavailableReason ? <span className="badge badge-warning">{file.unavailableReason === 'deleted' ? 'Excluído' : 'Só metadados'}</span> : <span className="badge">Revisão textual</span>}<small>{file.size.toLocaleString('pt-BR')} bytes</small></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>Nenhuma revisão para estes filtros.</h3><p>Use a ferramenta Todas ou Arquivos. A primeira observação cria o estado inicial; revisões seguintes aparecem conforme as gravações elegíveis são detectadas.</p></div>)}
      {history?.nextCursor && <div className="panel-bottom"><button disabled={busy} onClick={() => void more()}>Carregar mais revisões</button></div>}{expanded && <p className="panel-bottom muted">Paginação expandida. Use Atualizar arquivos para buscar mudanças novas.</p>}
    </section>
    <FileCoverage scans={history?.scans ?? []} data={data} />
    <dialog ref={modal} className="session-dialog file-dialog" aria-labelledby="file-detail-title" onCancel={() => { detailRequest.current?.abort(); clearTarget(); }}><div className="section-heading"><h2 id="file-detail-title">{commit ? 'Commit relacionado' : 'Revisão do arquivo'}</h2><button className="button-flat" onClick={close} aria-label="Fechar revisão">Fechar</button></div>
      {detailError && <p role="alert" className="inline-error">{detailError}</p>}{!detail && !detailError && <p role="status">Carregando revisão…</p>}
      {commit && !pr && <div className="detail-body"><button className="button-flat compact" onClick={() => setCommit(null)}>Voltar à revisão</button><h3 className="commit-title">{commit.message.split('\n')[0]}</h3><code>{commit.sha}</code><p>{commit.authorName} · {timestamp(commit.committedAt, data.settings.timezone)}</p><pre className="revision-content">{commit.message}</pre><ul>{commit.files.map((f, i) => <li key={i} className="git-path">{f.status} · {f.path}</li>)}</ul><h3>PRs comprovados por SHA</h3>{commit.pullRequests?.length ? commit.pullRequests.map((item) => <p key={item.id}><button className="session-link" onClick={() => setPr(item)}>Abrir PR #{item.number}</button></p>) : <p>Nenhum PR comprovado para este commit.</p>}<p className="muted">A relação com a revisão é uma inferência temporal. Não comprova autoria nem que esta versão exata foi incluída no commit.</p></div>}
      {pr && <><button className="button-flat" onClick={() => setPr(null)}>Voltar ao commit</button><PullRequestDetails item={pr} timezone={data.settings.timezone} /></>}
      {detail && !commit && <div className="detail-body"><h3 className="git-path">{detail.revision.path}</h3><p className="muted">{fileOperations[detail.revision.operation]} · {timestamp(detail.revision.occurredAt, data.settings.timezone)} · {machineName(data.settings, detail.revision.deviceId)}</p>
        <h3>Diff para a revisão anterior</h3>{detail.diff.patch ? <pre className="diff-code" tabIndex={0} aria-label="Diff da revisão">{detail.diff.patch.split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('@@') ? 'diff-hunk' : ''}>{line}{'\n'}</span>)}</pre> : <p className="muted">{unavailable[detail.diff.reason ?? 'unavailable'] ?? 'Diff indisponível para esta revisão.'}</p>}
        {detail.content !== null && <details className="revision-text"><summary>Conteúdo desta revisão</summary><pre className="revision-content" tabIndex={0}>{detail.content}</pre></details>}
        <h3>Evidências relacionadas</h3>{!detail.links.length && <p className="muted">Sem vínculo comprovado. A gravação pode ter vindo do editor ou de outra ferramenta.</p>}{detail.links.map((link) => <div className="evidence-link" key={link.targetId}><span className={`badge ${link.confidence === 'explicit' ? '' : 'badge-warning'}`}>{link.confidence === 'explicit' ? 'Associação explícita' : 'Inferência'}</span> <button className="session-link" disabled={busy} onClick={() => { if (link.kind === 'session') { close(); openSession(link.targetId); } else void showCommit(link.targetId); }}>{link.kind === 'session' ? 'Abrir sessão' : 'Abrir commit'} {link.label}</button><p className="muted">{link.reason}</p></div>)}
        {detail.sessionCandidates.length > 0 && <div className="file-association"><label>Associar explicitamente à sessão<select value={session} onChange={(e) => setSession(e.target.value)} aria-label="Sessão para associação"><option value="">Escolha uma sessão deste projeto e máquina</option>{detail.sessionCandidates.map((s) => <option key={s.id} value={s.id}>{s.tool} · {s.nativeSessionId}</option>)}</select></label><button disabled={!session || busy} onClick={() => void associate()}>Associar sessão</button><p className="muted">Sua associação prevalece sobre hipóteses temporais.</p></div>}
        <h3>Revisões observadas deste arquivo</h3><ul className="file-history">{detail.history.map((file) => <li key={file.id}><button className="session-link" aria-current={file.id === detail.revision.id ? 'true' : undefined} onClick={() => void show(file.id)}>{timestamp(file.occurredAt, data.settings.timezone)} · {fileOperations[file.operation]}</button><small className="git-path">{file.path}</small></li>)}</ul>{detail.historyHasMore && <p className="muted">Mostrando as 100 revisões mais recentes. Consulte períodos menores na lista para revisões anteriores.</p>}
      </div>}
    </dialog>
  </>;
}
