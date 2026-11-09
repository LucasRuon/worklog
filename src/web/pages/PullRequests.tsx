import type { PullRequestSnapshot } from '../../core/contracts.js';
import { timestamp } from '../api.js';

export const prStates = { open: 'Aberto', closed: 'Fechado sem merge', merged: 'Mesclado' };
export function PullRequestDetails({ item, timezone }: { item: PullRequestSnapshot; timezone: string }) {
  return <div className="detail-body"><h3>PR #{item.number} · {item.title}</h3>
    <p><span className="badge">{prStates[item.state]}{item.draft && ' · Rascunho'}</span>{item.stale && <span className="badge badge-warning">Snapshot desatualizado</span>}</p>
    <p>{item.author} · {item.headBranch} → {item.baseBranch}</p><p>Atualizado no provedor em {timestamp(item.updatedAt, timezone)}</p>
    <a href={item.url} target="_blank" rel="noreferrer">Abrir PR #{item.number} no GitHub</a>
    <h3>Verificações do provedor</h3>{item.checks.state === 'unavailable' ? <p>Checks indisponíveis; não presumir aprovação.</p> : item.checks.state === 'none' ? <p>Sem checks registrados.</p> : <ul>{item.checks.items.map((check) => <li key={check.id}>{check.name}: {check.status} · {check.conclusion ?? 'resultado ausente'}</li>)}</ul>}
    <h3>Revisões</h3>{item.reviews.state === 'unavailable' ? <p>Revisões indisponíveis.</p> : !item.reviews.items.length ? <p>Nenhuma revisão registrada.</p> : <ul>{item.reviews.items.map((review) => <li key={review.id}>{review.author}: {review.state}</li>)}</ul>}
    <h3>Commits explicitamente vinculados</h3>{item.commitsState === 'unavailable' ? <p>Lista de commits indisponível.</p> : <ul>{item.commits.map((sha) => <li key={sha}><code>{sha}</code></li>)}</ul>}
    <p className="muted">Estado do último snapshot de leitura. Check ausente não é aprovação; PR aberto não é trabalho concluído.</p>
  </div>;
}
export function PullRequestRows({ items, open, timezone }: { items: PullRequestSnapshot[]; open: (item: PullRequestSnapshot) => void; timezone: string }) {
  return items.length ? <div className="table-scroll"><table><thead><tr><th>Pull request</th><th>Estado</th><th>Última atualização</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
    <td><button className="session-link" aria-label={`Abrir PR #${item.number}`} onClick={() => open(item)}>#{item.number} · {item.title}</button><small>{item.author} · {item.headBranch} → {item.baseBranch}</small></td>
    <td><span className="badge">{prStates[item.state]}{item.draft && ' · Rascunho'}</span>{item.stale && <small>Snapshot desatualizado</small>}</td><td>{timestamp(item.updatedAt, timezone)}</td>
  </tr>)}</tbody></table></div> : <div className="empty-state"><p>Nenhum PR para estes filtros.</p></div>;
}
