import { useEffect, useState } from 'react';
import type { GitCommit, GitScan } from '../../core/contracts.js';
import { api, errorMessage, machineName, timestamp, type DashboardData, type Page } from '../api.js';

interface History extends Page<GitCommit> { scans: GitScan[] }
export function Commits({ data, query, updated }: { data: DashboardData; query: string; updated: string }) {
  const [history, setHistory] = useState<History | null>(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [expanded, setExpanded] = useState(false); const [revision, setRevision] = useState(0);
  const names = new Map(data.projects.items.map((p) => [p.id, p.name]));
  useEffect(() => {
    if (expanded) return;
    const controller = new AbortController();
    void api<History>(`/api/commits?${query}`, { signal: controller.signal }).then((value) => { setHistory(value); setError(''); }).catch((e) => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [query, updated, revision, expanded]);
  async function scan() {
    setBusy(true); setError('');
    try {
      const projectIds = new URLSearchParams(query).get('projectIds')?.split(',').filter(Boolean) ?? [];
      await api('/api/commits/scan', { method: 'POST', body: JSON.stringify({ projectIds }) });
      setExpanded(false); setRevision((r) => r + 1);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function more() {
    if (!history?.nextCursor) return;
    setBusy(true);
    try {
      const value = await api<History>(`/api/commits?${query}&cursor=${encodeURIComponent(history.nextCursor)}`);
      setHistory({ ...value, items: [...history.items, ...value.items] }); setExpanded(true);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <>
    <section className="panel" aria-labelledby="commits-title">
      <div className="section-heading"><div><h2 id="commits-title">Histórico de commits</h2><p className="muted">Data do committer · arquivos comparados ao primeiro parent · histórico Git não gera horas.</p></div><button className="button-flat compact" onClick={() => void scan()} disabled={busy}>{busy ? 'Consultando Git…' : 'Reindexar Git'}</button></div>
      {error && <p role="alert" className="error-banner">{error}<button className="button-flat" onClick={() => setRevision((r) => r + 1)}>Tentar novamente</button></p>}
      {!history && !error && <p role="status" className="instructions">Carregando commits…</p>}
      {history && (history.items.length ? <div className="table-scroll"><table><thead><tr><th>Commit / mensagem</th><th>Projeto / origem</th><th>Autoria / data</th></tr></thead><tbody>{history.items.map((commit) => <tr key={commit.id}>
        <td><code className="commit-sha">{commit.sha.slice(0, 12)}</code><strong className="commit-title">{commit.message.split('\n')[0]}</strong><details className="commit-details"><summary>Mensagem e {commit.files.length} arquivo(s)</summary><pre>{commit.message}</pre><p>SHA: {commit.sha}</p><p>Parents: {commit.parents.join(', ') || 'Commit inicial'}</p><ul>{commit.files.map((file, i) => <li key={i}><span className="badge">{file.status}</span> <span className="git-path">{file.previousPath ? `${file.previousPath} → ` : ''}{file.path}</span></li>)}</ul>{!commit.files.length && <p>Sem arquivos elegíveis nesta raiz. Exclusões da política são respeitadas.</p>}</details></td>
        <td>{[...new Set(commit.origins.map((o) => names.get(o.projectId) ?? 'Projeto'))].join(', ')}{commit.origins.map((o) => <small key={o.rootId}>{machineName(data.settings, o.deviceId)} · {o.reachable ? 'Alcançável na última varredura' : 'Preservado; fora dos refs observados'}{o.refs.length > 0 && ` · refs apontando para este SHA: ${o.refs.join(', ')}`}</small>)}</td>
        <td>{commit.authorName}<small>{commit.authorEmail}</small><small>{timestamp(commit.committedAt, data.settings.timezone)}</small><small>Committer: {commit.committerName}</small></td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><h3>Nenhum commit para estes filtros.</h3><p>Amplie o período ou selecione a ferramenta Git. Reindexar busca os commits das raízes cadastradas; o botão não cria commits.</p></div>)}
      {history?.nextCursor && <div className="panel-bottom"><button disabled={busy} onClick={() => void more()}>Carregar mais commits</button></div>}
    </section>
    <section className="panel" aria-labelledby="git-status-title"><div className="section-heading"><h2 id="git-status-title">Cobertura da coleta Git</h2><span className="muted">Varredura local a cada 30 s</span></div><div className="instructions">{!history?.scans.length && <p>Nenhuma raiz Git cadastrada nesta seleção.</p>}{history?.scans.map((scan) => <p key={scan.rootId}><strong>{names.get(scan.projectId) ?? 'Projeto'}</strong> · {machineName(data.settings, scan.deviceId)}<br /><span className="git-path">{scan.path}</span><br />{scan.error === 'GIT_REMOTE_UNAVAILABLE' ? 'Histórico remoto ainda indisponível: atualize o coletor remoto para sincronizar commits.' : scan.error ? 'Git indisponível. Histórico anterior preservado; tente reindexar quando a pasta estiver disponível.' : scan.pending ? 'Importando histórico em lotes; novas rodadas continuam automaticamente.' : scan.scannedAt ? `Última varredura: ${timestamp(scan.scannedAt, data.settings.timezone)}` : 'Aguardando primeira varredura.'}</p>)}</div></section>
  </>;
}
