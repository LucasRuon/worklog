import { type AppContext, type ReportFilter, type WorkEvent, DomainError } from './contracts.js';
import { selectedProjects, validateFilter } from './filters.js';
import { stableId } from './policy.js';
import { listSessions } from './sessions.js';
import { listFileChanges } from '../collectors/revisions.js';
import { listCommits } from '../collectors/git.js';
import { listPullRequests } from '../providers/github.js';

export const summaryRuleVersion = 'evidence-summary-v1';
export function buildWorkSummary(ctx: AppContext, filter: ReportFilter): { text: string; evidenceIds: string[]; ruleVersion: string } {
  validateFilter(filter);
  const projects = [...selectedProjects(ctx, filter)].sort();
  const clauses = ['e.occurred_at >= ?', 'e.occurred_at < ?']; const params: (string | number)[] = [filter.from, filter.to];
  const scope = projects.length ? `p.project_id IN (${projects.map(() => '?').join(',')})` : '0';
  clauses.push(filter.includeUnassigned ? `(${scope} OR p.project_id IS NULL)` : scope); params.push(...projects);
  for (const [column, values] of [['e.source_id', filter.sourceIds], ['e.device_id', filter.deviceIds], ['s.tool', filter.tools]] as const) {
    if (values?.length) { clauses.push(`${column} IN (${values.map(() => '?').join(',')})`); params.push(...values); }
  }
  const rows = ctx.db.all<{ document: string }>(`SELECT e.document FROM events e JOIN sources s ON s.id = e.source_id LEFT JOIN event_projects p ON p.event_id = e.event_id WHERE ${clauses.join(' AND ')} ORDER BY e.occurred_at, e.event_id LIMIT 501`, ...params);
  const events = rows.slice(0, 500).map((row) => JSON.parse(row.document) as WorkEvent);
  const files = listFileChanges(ctx, filter, 101); const commits = listCommits(ctx, filter, 101); const prs = listPullRequests(ctx, filter).sort((a, b) => a.id.localeCompare(b.id));
  const sessions = listSessions(ctx, filter);
  const evidence = new Set<string>();
  const actions: string[] = []; const verified: string[] = []; const pending: string[] = [];
  const fact = (target: string[], value: string, id: string) => { evidence.add(id); target.push(`- Fato: ${value} [evidência: ${id}]`); };
  for (const event of events) {
    if (event.type === 'tool.end') {
      fact(actions, `${event.payload.toolName}: ${event.payload.outcome === 'failed' ? 'falhou' : event.payload.outcome === 'interrupted' ? 'interrompida' : 'chamada concluída; não comprova teste aprovado'}.`, event.eventId);
    } else if (event.type === 'tool.start') fact(actions, `${event.payload.toolName}: chamada iniciada.`, event.eventId);
    else if (event.type === 'session.interrupt') fact(pending, `Sessão ${event.nativeSessionId ?? 'sem ID'} interrompida (${event.payload.reason}).`, event.eventId);
    else if (event.type === 'session.start') fact(actions, `Sessão ${event.nativeSessionId ?? 'sem ID'} iniciada/retomada (${event.payload.reason}).`, event.eventId);
    else if (event.type === 'turn.start') fact(actions, `Turno ${event.payload.turnId ?? 'sem ID'} iniciado.`, event.eventId);
    else if (event.type === 'turn.end') fact(actions, `Turno ${event.payload.turnId ?? 'sem ID'}: ${event.payload.outcome}.`, event.eventId);
  }
  for (const file of files.slice(0, 100)) fact(actions, `Arquivo ${file.path}: ${file.operation}; conteúdo ${file.unavailableReason ? `indisponível (${file.unavailableReason})` : 'elegível pela política'}. Autoria do agente não comprovada.`, file.id);
  for (const commit of commits.slice(0, 100)) fact(actions, `Commit ${commit.sha}: mensagem ${JSON.stringify(commit.message.trim())}. Commit não comprova tempo humano ou êxito de testes.`, commit.id);
  for (const pr of prs.slice(0, 100)) {
    const state = pr.state === 'merged' ? 'mesclado' : pr.state === 'closed' ? 'fechado sem merge' : 'aberto';
    fact(actions, `Snapshot de PR #${pr.number}: ${state}${pr.draft ? ' (rascunho)' : ''}; ${pr.title}.`, pr.id);
    if (pr.checks.state === 'unavailable') fact(pending, `PR #${pr.number}: verificações indisponíveis; não presumir aprovação.`, pr.id);
    else if (pr.checks.state === 'none') fact(pending, `PR #${pr.number}: sem checks registrados.`, pr.id);
    else for (const check of pr.checks.items) fact(verified, `Check GitHub ${check.name}: ${check.status} / ${check.conclusion ?? 'resultado ausente'} (último snapshot).`, pr.id);
    if (pr.reviews.state === 'unavailable') fact(pending, `PR #${pr.number}: revisões indisponíveis.`, pr.id);
  }
  if (sessions.some((session) => !ctx.db.get<{ complete: number }>('SELECT complete FROM sessions WHERE id = ?', session.id)?.complete)) pending.push('- Há histórico incompleto ou pares ausentes. Não extrapolar duração nem inventar fechamento de sessão.');
  if (rows.length > 500 || files.length > 100 || commits.length > 100 || prs.length > 100) pending.push('- Resumo parcial: limite de 500 eventos e 100 arquivos/commits/PRs por seção. Reduza o período para detalhar.');
  const text = [`Resumo de trabalho · ${filter.from} → ${filter.to} · ${filter.timezone}`, '', 'Solicitado', 'O conteúdo dos pedidos não é armazenado. Não é possível reconstruir o pedido a partir de nomes de ferramentas ou commits.', '', 'Realizado — evidências registradas', ...(actions.length ? actions : ['Nenhuma ação com evidência nesta seleção.']), '', 'Verificado — resultados disponíveis', ...(verified.length ? verified : ['Nenhum resultado de teste comprovado nas fontes selecionadas.']), '', 'Pendências e limites', ...(pending.length ? pending : ['Não há pendência explícita registrada nesta seleção; isso não comprova a conclusão do trabalho.']), 'Snapshots, chamadas concluídas e commits não substituem a validação do resultado.'].join('\n');
  if (Buffer.byteLength(text) > 1024 * 1024) throw new DomainError('SUMMARY_TOO_LARGE', 413);
  const result = { text, evidenceIds: [...evidence].sort(), ruleVersion: summaryRuleVersion };
  const canonical = JSON.stringify({ ...filter, projectIds: projects, sourceIds: filter.sourceIds ? [...new Set(filter.sourceIds)].sort() : undefined, deviceIds: filter.deviceIds ? [...new Set(filter.deviceIds)].sort() : undefined, tools: filter.tools ? [...new Set(filter.tools)].sort() : undefined });
  const id = stableId(summaryRuleVersion, canonical, text, JSON.stringify(result.evidenceIds));
  ctx.db.run('INSERT OR IGNORE INTO work_summaries VALUES (?, ?, ?, ?, ?, ?)', id, canonical, text, JSON.stringify(result.evidenceIds), summaryRuleVersion, new Date().toISOString());
  return result;
}
