import { useState } from 'react';
import type { ReportData, ReportOptions } from '../../core/contracts.js';
import { api, ApiError, duration, errorMessage, timestamp, type DashboardData } from '../api.js';

export function Exports({ data, query, moreProjects, loading }: { data: DashboardData; query: string; moreProjects: () => void; loading: boolean }) {
  const [options, setOptions] = useState<ReportOptions>({ sessions: true, commits: true, files: true, notes: false, prs: false, fullDiff: false });
  const [preview, setPreview] = useState<{ id: string; report: ReportData } | null>(null);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const selected = new URLSearchParams(query).get('projectIds')?.split(',').filter(Boolean) ?? [];
  async function generate() {
    setBusy('preview'); setError(''); setMessage(''); setPreview(null);
    try { setPreview(await api(`/api/reports?${query}`, { method: 'POST', body: JSON.stringify({ options }) })); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  }
  async function download(format: 'csv' | 'pdf') {
    if (!preview) return;
    setBusy(format); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/reports/${preview.id}.${format}`, { credentials: 'same-origin' });
      if (!response.ok) { const body = await response.json() as { error: string }; throw new ApiError(response.status, body.error); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `worklog-${preview.report.filter.from.slice(0, 10)}.${format}`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Download ${format.toUpperCase()} iniciado com os dados desta prévia.`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  }
  function change(next: ReportOptions) { setOptions(next); setPreview(null); setMessage(''); }
  return <>
    <section className="panel" aria-labelledby="export-options-title"><div className="section-heading"><div><h2 id="export-options-title">Preparar relatório</h2><p className="muted">CSV para planilhas · PDF para leitura e compartilhamento</p></div><span className="badge">{selected.length} projeto(s) selecionado(s)</span></div>
      <div className="instructions"><p>Use os filtros acima para escolher explicitamente os projetos, período, máquina e ferramenta. Sem seleção de projetos, nenhum relatório é gerado.</p>{!selected.length && <p role="status">Abra <strong>Todos os projetos</strong> e marque os projetos que deseja exportar.</p>}{data.projects.nextCursor && <button className="button-flat" disabled={loading} onClick={moreProjects}>Carregar mais projetos para seleção</button>}
        <fieldset className="export-options"><legend>Conteúdo do relatório</legend>
          <label className="checkbox-label"><input type="checkbox" checked={options.sessions} onChange={(e) => change({ ...options, sessions: e.target.checked })} />Sessões observadas</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.commits} onChange={(e) => change({ ...options, commits: e.target.checked })} />Commits Git</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.files} onChange={(e) => change({ ...options, files: e.target.checked, fullDiff: e.target.checked && options.fullDiff })} />Revisões e arquivos dos commits</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.notes} onChange={(e) => change({ ...options, notes: e.target.checked })} />Notas do usuário</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.prs} onChange={(e) => change({ ...options, prs: e.target.checked })} />Pull requests</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.fullDiff} disabled={!options.files} onChange={(e) => change({ ...options, fullDiff: e.target.checked })} />Diffs completos elegíveis</label>
        </fieldset>
        <p className="muted">Tempos e auditoria de ajustes acompanham o relatório. Notas usam sua data declarada e origem manual (focus). Diffs dependem de política/retenção, até 100 revisões por prévia; nenhuma transcrição de agente é incluída.</p>
        <button disabled={!selected.length || Boolean(busy)} onClick={() => void generate()}>{busy === 'preview' ? 'Gerando prévia…' : 'Gerar prévia'}</button>
      </div>
    </section>
    {error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status" className="inline-message">{message}</p>}
    {preview && <section className="panel" aria-labelledby="report-preview-title"><div className="section-heading"><div><h2 id="report-preview-title">Prévia do relatório</h2><p className="muted">Dados congelados em {timestamp(preview.report.generatedAt, preview.report.filter.timezone)} · downloads disponíveis por 15 min</p></div><div className="button-row"><button disabled={Boolean(busy)} onClick={() => void download('csv')}>{busy === 'csv' ? 'Gerando CSV…' : 'Baixar CSV'}</button><button className="button-flat" disabled={Boolean(busy)} onClick={() => void download('pdf')}>{busy === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}</button></div></div>
      <div className="instructions"><p><strong>{preview.report.projects.map((p) => p.name).join(', ')}</strong><br />{timestamp(preview.report.filter.from, preview.report.filter.timezone)} → {timestamp(preview.report.filter.to, preview.report.filter.timezone)} (fim exclusivo) · {preview.report.filter.timezone}</p><p>{preview.report.sessions.length} sessão(ões) incluída(s) · {preview.report.commits.length} commit(s) incluído(s)</p></div>
      <div className="instructions"><p>{preview.report.notes.length} nota(s) · {preview.report.revisions.length} revisão(ões) · {preview.report.prs.length} PR(s) · revisão de ajustes {preview.report.adjustmentRevision}</p></div>
      <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Dedicação estimada</th><th>Agentes acumulados</th><th>União de relógio</th><th>Dedicação ajustada</th></tr></thead><tbody>{[{ id: 'total', name: 'Total da seleção', summary: preview.report.summary }, ...preview.report.projects].map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{duration(p.summary.humanEstimatedMs)}</td><td>{duration(p.summary.agentAccumulatedMs)}</td><td>{duration(p.summary.agentWallMs)}</td><td>{duration(p.summary.humanAdjustedMs)}</td></tr>)}</tbody></table></div>
      <div className="instructions">{preview.report.notes.map((note) => <details key={note.id}><summary>Nota · {note.classification} · versão {note.revision}</summary><pre className="work-summary">{note.text}</pre></details>)}{preview.report.revisions.filter((file) => file.diff).map((file) => <details key={file.id}><summary>Diff · {file.path}</summary><pre className="diff-code">{file.diff?.patch ?? `Indisponível: ${file.diff?.reason}`}</pre></details>)}</div>
      <div className="instructions"><h3>Qualidade e limitações</h3>{preview.report.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div>
    </section>}
  </>;
}
