import { useEffect, useState } from 'react';
import type { BacklogCounts, BacklogItem, BacklogQuestion, BacklogState, BacklogStatus, ProjectBacklog } from '../../core/backlog.js';
import { api, errorMessage, timestamp } from '../api.js';

export const backlogStatusLabels: Record<BacklogStatus, string> = { implemented: 'Implementada', failed: 'Verificação reprovada', in_progress: 'Em implementação', pending: 'Pendente' };
const groupTitles: Record<BacklogStatus, string> = { failed: 'Verificação reprovada', in_progress: 'Em implementação', pending: 'Pendentes de implementação', implemented: 'Implementadas' };
const order: BacklogStatus[] = ['failed', 'in_progress', 'pending', 'implemented'];
type Filter = 'all' | 'open-work' | 'issues' | 'blocking';
const filters: { id: Filter; label: string; match: (item: BacklogItem) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'open-work', label: 'A implementar', match: (item) => item.status !== 'implemented' },
  { id: 'issues', label: 'Com pendências', match: (item) => item.open.length + item.blocking.length + item.goLive.length > 0 },
  { id: 'blocking', label: 'Bloqueantes', match: (item) => item.blocking.length + item.goLive.length > 0 },
];

/** Carrega o backlog dos projetos; `every` refaz a leitura em intervalo (o servidor guarda cache curto). */
export function useBacklog(projectIds: string[] = [], every = 0, revision = '') {
  const [state, setState] = useState<BacklogState | null>(null); const [error, setError] = useState('');
  const key = projectIds.join(',');
  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout> | undefined; const controller = new AbortController();
    async function load() {
      try { const value = await api<BacklogState>(`/api/backlog${key ? `?projectIds=${encodeURIComponent(key)}` : ''}`, { signal: controller.signal }); if (alive) { setState(value); setError(''); } }
      catch (e) { if (alive && !controller.signal.aborted) setError(errorMessage(e)); }
      if (alive && every) timer = setTimeout(() => void load(), every);
    }
    void load();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [key, every, revision]);
  return { state, error };
}

/** Resumo em selos: o que falta implementar e o que está pendente ou bloqueado. */
export function BacklogBadges({ counts, compact = false }: { counts: BacklogCounts; compact?: boolean }) {
  const todo = counts.pending + counts.inProgress + counts.failed;
  const blocked = counts.withBlocking + counts.withGoLive;
  return <span className={`backlog-badges${compact ? ' is-compact' : ''}`}>
    <span className="badge" title="Tasks com verificação independente PASS">{counts.implemented}/{counts.total} implementadas</span>
    {counts.pending > 0 && <span className="badge">{counts.pending} {counts.pending === 1 ? 'pendente' : 'pendentes'}</span>}
    {counts.inProgress > 0 && <span className="badge badge-progress">{counts.inProgress} em implementação</span>}
    {counts.failed > 0 && <span className="badge badge-danger">{counts.failed} {counts.failed === 1 ? 'reprovada' : 'reprovadas'}</span>}
    {!compact && counts.withOpen > 0 && <span className="badge" title="Tasks com perguntas em aberto (Unresolved: open)">{counts.withOpen} com pendências</span>}
    {counts.withBlocking > 0 && <span className="badge badge-warning" title="Tasks com Unresolved: blocks">{counts.withBlocking} com bloqueante{counts.withBlocking === 1 ? '' : 's'}</span>}
    {counts.withGoLive > 0 && <span className="badge badge-warning" title="Tasks com Unresolved: blocks go-live">{counts.withGoLive} sem liberação para o ar</span>}
    {todo === 0 && blocked === 0 && <span className="badge">nada pendente</span>}
  </span>;
}

function Questions({ title, items, tone }: { title: string; items: BacklogQuestion[]; tone?: 'warning' }) {
  if (!items.length) return null;
  return <div className={`backlog-questions${tone ? ` is-${tone}` : ''}`}><h5>{title}</h5><ul>{items.map((item, index) => <li key={`${item.n}-${index}`}>{item.n && <span className="tabular">{item.n}.</span>} {item.question}</li>)}</ul></div>;
}
function BacklogRow({ item, timezone }: { item: BacklogItem; timezone: string }) {
  const issues = item.open.length + item.blocking.length + item.goLive.length;
  return <li className={`backlog-item is-${item.status}`}>
    <details>
      <summary>
        <span className="backlog-title"><strong>{item.title}</strong><small><code>{item.file}</code>{item.criteria !== null && ` · ${item.criteria} critérios`}</small></span>
        <span className="backlog-flags">
          <span className={`backlog-status is-${item.status}`}>{backlogStatusLabels[item.status]}</span>
          {item.blocking.length > 0 && <span className="badge badge-warning">{item.blocking.length} bloqueante{item.blocking.length === 1 ? '' : 's'}</span>}
          {item.goLive.length > 0 && <span className="badge badge-warning">{item.goLive.length} bloqueia{item.goLive.length === 1 ? '' : 'm'} entrada no ar</span>}
          {item.open.length > 0 && <span className="badge">{item.open.length} em aberto</span>}
        </span>
      </summary>
      <div className="backlog-detail">
        <p className="muted">{item.check
          ? <>Checklist <code>{item.check.feature}</code>{item.check.location ? ` no worktree ${item.check.location} (ainda fora da raiz)` : ''}{item.check.verdict ? ` · verificação ${item.check.verdict}${item.check.verifiedAt ? ` em ${timestamp(item.check.verifiedAt, timezone)}` : ''}` : ' · sem verificação independente ainda'}</>
          : 'Nenhum checklist em .checks/ para esta task.'} · task alterada em {timestamp(item.updatedAt, timezone)}</p>
        <Questions title="Bloqueantes" items={item.blocking} tone="warning" />
        <Questions title="Bloqueiam a entrada no ar" items={item.goLive} tone="warning" />
        <Questions title="Em aberto (decisão assumida até resposta)" items={item.open} />
        {!issues && <p className="muted">Sem pendências na tabela Unresolved.</p>}
      </div>
    </details>
  </li>;
}

/** Lista agrupada por status com filtro; `limit` corta cada grupo (painel ao vivo). */
export function BacklogList({ backlog, timezone, limit, initialFilter = 'all' }: { backlog: ProjectBacklog; timezone: string; limit?: number; initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const match = filters.find((item) => item.id === filter)!.match;
  const visible = backlog.items.filter(match);
  return <div className="backlog">
    <div className="backlog-filters" role="group" aria-label="Filtrar tasks">{filters.map((item) => <button key={item.id} type="button" className="button-flat compact" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} <span className="tabular">{backlog.items.filter(item.match).length}</span></button>)}</div>
    {visible.length ? order.map((status) => {
      const items = visible.filter((item) => item.status === status); if (!items.length) return null;
      const shown = limit ? items.slice(0, limit) : items;
      const list = <ul className="backlog-items">{shown.map((item) => <BacklogRow key={item.id} item={item} timezone={timezone} />)}</ul>;
      const more = limit && items.length > limit ? <p className="muted">+ {items.length - limit} nesta categoria</p> : null;
      // Implementadas são a maioria e o que menos pede atenção: ficam recolhidas quando há outras categorias.
      return status === 'implemented' && filter === 'all' && visible.length > items.length
        ? <details key={status} className="backlog-group"><summary><h4>{groupTitles[status]} <span className="tabular">{items.length}</span></h4></summary>{list}{more}</details>
        : <section key={status} className="backlog-group"><h4>{groupTitles[status]} <span className="tabular">{items.length}</span></h4>{list}{more}</section>;
    }) : <p className="muted">Nenhuma task neste filtro.</p>}
    {backlog.truncated && <p className="muted">Mais de 400 arquivos em .tasks/: a lista mostra os primeiros em ordem alfabética.</p>}
  </div>;
}

const rootStates: Record<string, string> = { remote: 'raiz em outra máquina: tasks lidas só da máquina local', paused: 'raiz pausada', unavailable: 'pasta indisponível', excluded: '.tasks excluída nas configurações' };
export function BacklogPanel({ projectId, timezone, updated }: { projectId: string; timezone: string; updated: string }) {
  const { state, error } = useBacklog([projectId], 0, updated);
  const backlog = state?.projects.find((item) => item.projectId === projectId);
  const notes = backlog?.roots.filter((root) => rootStates[root.state]) ?? [];
  return <section className="panel" aria-labelledby="backlog-title">
    <div className="section-heading"><div><h2 id="backlog-title">Tasks planejadas</h2><p className="muted backlog-intro">Arquivos em <code>.tasks/</code> cruzados com os checklists em <code>.checks/</code>. Implementada = verificação independente com PASS. Pendências vêm da tabela Unresolved de cada task.</p></div>{backlog && <BacklogBadges counts={backlog.counts} />}</div>
    {error && <p role="alert" className="inline-error instructions">{error}</p>}
    {!state && !error && <p role="status" className="instructions">Lendo tasks do projeto…</p>}
    {state && !backlog && <div className="empty-state backlog-empty"><p>Nenhuma task em <code>.tasks/</code> nas raízes locais deste projeto.</p></div>}
    {backlog && <div className="instructions"><BacklogList backlog={backlog} timezone={timezone} />{notes.map((root) => <p key={root.path} className="muted backlog-root"><code>{root.path}</code>: {rootStates[root.state]}.</p>)}</div>}
  </section>;
}
