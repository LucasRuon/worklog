import type { ReportData, TimeSummary } from '../core/contracts.js';

export const timeMeasures: [keyof TimeSummary, string, string][] = [
  ['humanEstimatedMs', 'Dedicação humana estimada', 'estimada'], ['humanAdjustedMs', 'Dedicação humana ajustada', 'ajustada'],
  ['unassignedHumanMs', 'Dedicação sem atribuição', 'estimada'], ['agentAccumulatedMs', 'Execução acumulada de agentes', 'observada'],
  ['agentWallMs', 'União de execução de relógio', 'observada'], ['sessionSpanMs', 'Duração observada das sessões (inclui pausas)', 'observada'],
];
export function renderCsv(data: ReportData): Uint8Array {
  const rows: unknown[][] = [['tipo', 'projeto', 'máquina', 'ferramenta', 'id', 'início_utc', 'fim_utc_exclusivo', 'qualidade', 'medida', 'valor', 'unidade', 'descrição', 'autor', 'email_autor', 'parents', 'refs_observadas', 'arquivos', 'fuso']];
  const add = (cells: unknown[]) => rows.push([...cells, ...Array(Math.max(0, 17 - cells.length)).fill(''), data.filter.timezone]);
  add(['relatório', data.projects.map((p) => p.name).join(' | '), '', '', '', data.filter.from, data.filter.to, '', 'gerado_em', data.generatedAt, '', `Ferramentas: ${data.filter.tools?.join(', ') || 'todas'}; máquinas: ${data.filter.deviceIds?.join(', ') || 'todas'}`]);
  for (const project of [{ name: 'TOTAL DA SELEÇÃO', id: '', summary: data.summary }, ...data.projects]) {
    for (const [key, label, quality] of timeMeasures) add(['tempo', project.name, '', '', project.id, data.filter.from, data.filter.to, quality, label, project.summary[key], 'ms']);
  }
  for (const session of data.sessions) add(['sessão', data.projects.find((p) => p.id === session.projectId)?.name, data.devices.find((d) => d.id === session.deviceId)?.name ?? session.deviceId, session.tool, session.id, session.startedAt, session.lastEventAt, session.provenance === 'imported' ? 'histórico importado' : session.provenance === 'mixed' ? 'observada + importada' : session.complete ? 'observada' : 'incompleta', 'estado', session.state, '', `Sessão ${session.nativeSessionId}; perfil ${session.profile}; ${session.complete ? 'pares disponíveis' : 'evidência incompleta'}`]);
  for (const commit of data.commits) add(['commit', [...new Set(commit.origins.map((o) => data.projects.find((p) => p.id === o.projectId)!.name))].join(' | '), [...new Set(commit.origins.map((o) => data.devices.find((d) => d.id === o.deviceId)?.name ?? o.deviceId))].join(' | '), 'git', commit.sha, commit.committedAt, '', 'histórico Git', '', '', '', commit.message, commit.authorName, commit.authorEmail, commit.parents.join(' '), commit.origins.map((o) => `${o.deviceId}: ${o.reachable ? 'alcançável' : 'preservado fora dos refs'}; ${o.refs.join(', ')}`).join('\n'), data.options.files ? commit.files.map((f) => `${f.status} ${f.previousPath ? `${f.previousPath} → ` : ''}${f.path}`).join('\n') : '']);
  const projectName = (id: string) => data.projects.find((p) => p.id === id)?.name ?? id;
  for (const note of data.notes) add(['nota', projectName(note.projectId), note.deviceId, 'focus', note.id, note.occurredAt, '', 'explícita pelo usuário', note.classification, note.revision, 'versão', note.text]);
  for (const file of data.revisions) {
    add(['revisão', projectName(file.projectId), file.deviceId, 'files', file.id, file.occurredAt, '', file.unavailableReason ?? 'observada', file.operation, file.size, 'bytes', file.path]);
    if (file.diff) add(['diff', projectName(file.projectId), file.deviceId, 'files', file.id, file.occurredAt, '', file.diff.reason ?? 'observado', '', '', '', file.diff.patch ?? `Indisponível: ${file.diff.reason}`]);
  }
  for (const pr of data.prs) add(['PR', pr.projectIds.map(projectName).join(' | '), '', 'git', pr.id, pr.createdAt, pr.updatedAt, pr.stale ? 'snapshot desatualizado' : 'snapshot do provedor', 'estado', pr.state, '', `${pr.title}\n${pr.url}\nChecks: ${pr.checks.state}; revisões: ${pr.reviews.state}`, pr.author]);
  for (const a of data.adjustments) add(['ajuste', projectName(a.projectId), a.deviceId, 'focus', a.id, a.start, a.end, a.undoOf ? 'compensação' : a.undone ? 'desfeito' : 'ajustado', `antes=${a.previousMs}`, a.nextMs, 'ms', a.reason]);
  for (const warning of data.warnings) add(['limitação', '', '', '', '', '', '', '', '', '', '', warning]);
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return Buffer.from(`\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`, 'utf8');
}
