import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import type { ReportData } from '../core/contracts.js';
import { timeMeasures } from './csv.js';

const require = createRequire(import.meta.url);
export async function renderPdf(data: ReportData): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 55, left: 48, right: 48 }, bufferPages: true, info: { Title: 'Worklog — Relatório de trabalho', Author: 'Worklog', CreationDate: new Date(data.generatedAt) } });
  const chunks: Buffer[] = [];
  const result = new Promise<Uint8Array>((resolve, reject) => { doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks))); });
  try {
    doc.registerFont('regular', require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'));
    doc.registerFont('bold', require.resolve('@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff'));
    const text = (value: string) => { doc.font('regular').fontSize(9).fillColor('#454b54').text(value, { paragraphGap: 5 }); };
    const title = (value: string) => { if (doc.y > doc.page.height - 120) doc.addPage(); doc.moveDown(.6).font('bold').fontSize(13).fillColor('#252930').text(value); doc.moveDown(.4); };
    const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: data.filter.timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
    const names = (ids: string[]) => [...new Set(ids.map((id) => data.projects.find((p) => p.id === id)!.name))].join(', ');
    doc.font('bold').fontSize(24).fillColor('#252930').text('Worklog');
    doc.font('regular').fontSize(12).text('Relatório de trabalho'); doc.moveDown();
    text(`Período: ${date(data.filter.from)} até ${date(data.filter.to)} (fim exclusivo)\nFuso: ${data.filter.timezone}\nGerado em: ${date(data.generatedAt)}\nProjetos: ${data.projects.map((p) => p.name).join(', ')}\nFerramentas: ${data.filter.tools?.join(', ') || 'todas'}\nMáquinas: ${data.filter.deviceIds?.map((id) => data.devices.find((d) => d.id === id)?.name ?? id).join(', ') || 'todas'}`);
    for (const project of [{ name: 'Total da seleção', summary: data.summary, client: null }, ...data.projects]) {
      title(project.name); if (project.client) text(`Cliente: ${project.client}`);
      for (const [key, label, quality] of timeMeasures) {
        const ms = Number(project.summary[key]); const minutes = Math.floor(ms / 60_000);
        text(`${label}: ${ms > 0 && ms < 60_000 ? '<1 min' : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`} (${ms} ms; ${quality})`);
      }
      text(`Sessões incompletas: ${project.summary.incompleteSessions} · Regra: ${project.summary.ruleVersion}`);
    }
    if (data.options.sessions) {
      title(`Sessões (${data.sessions.length})`);
      if (!data.sessions.length) text('Nenhuma sessão para esta seleção.');
      const states = { running: 'Em execução', waiting: 'Aguardando usuário', interrupted: 'Interrompida', closed: 'Encerrada', incomplete: 'Incompleta' };
      for (const session of data.sessions) text(`${names([session.projectId!])} · ${session.tool} / ${session.profile} · ${data.devices.find((d) => d.id === session.deviceId)?.name ?? session.deviceId}\n${date(session.startedAt)} até ${date(session.lastEventAt)} · ${states[session.state]}${session.complete ? '' : ' · evidência incompleta'}\nSessão: ${session.nativeSessionId}\nProveniência: ${session.provenance === 'imported' ? 'histórico importado' : session.provenance === 'mixed' ? 'observada + importada' : 'observada'}`);
    }
    if (data.options.commits) {
      title(`Commits (${data.commits.length})`);
      if (!data.commits.length) text('Nenhum commit para esta seleção.');
      for (const commit of data.commits) {
        title(`${commit.sha.slice(0, 12)} · ${names(commit.origins.map((o) => o.projectId))}`);
        text(`${commit.authorName} <${commit.authorEmail}> · autoria ${date(commit.authoredAt)}\nCommitter: ${commit.committerName} <${commit.committerEmail}> · ${date(commit.committedAt)}\n${commit.message.trim()}\nSHA: ${commit.sha}\nParents: ${commit.parents.join(', ') || 'Commit inicial'}`);
        if (commit.url) doc.font('regular').fontSize(9).fillColor('#303740').text(commit.url, { link: commit.url, underline: true, paragraphGap: 5 });
        for (const origin of commit.origins) text(`${data.devices.find((d) => d.id === origin.deviceId)?.name ?? origin.deviceId}: ${origin.reachable ? 'alcançável na última varredura' : 'preservado; fora dos refs observados'}; refs apontando para o SHA: ${origin.refs.join(', ') || 'nenhum'}`);
        if (data.options.files) for (const file of commit.files) text(`${file.status} · ${file.previousPath ? `${file.previousPath} -> ` : ''}${file.path}`);
      }
    }
    if (data.options.notes) {
      title(`Notas (${data.notes.length})`);
      for (const note of data.notes) { title(`${names([note.projectId])} · ${note.classification}`); text(`${date(note.occurredAt)} · versão ${note.revision}\n${note.text}`); }
    }
    if (data.options.files) {
      title(`Revisões observadas (${data.revisions.length})`);
      for (const file of data.revisions) {
        title(`${names([file.projectId])} · ${file.path}`); text(`${date(file.occurredAt)} · ${file.operation} · ${file.unavailableReason ?? 'conteúdo elegível'} · ${file.size} bytes`);
        if (file.diff) text(file.diff.patch ?? `Diff indisponível: ${file.diff.reason}`);
      }
    }
    if (data.options.prs) {
      title(`Pull requests (${data.prs.length})`);
      for (const pr of data.prs) {
        title(`#${pr.number} · ${pr.title}`); text(`${pr.state}${pr.draft ? ' · rascunho' : ''}${pr.stale ? ' · snapshot desatualizado' : ''}\n${pr.author} · ${pr.headBranch} → ${pr.baseBranch}\n${pr.url}\nChecks: ${pr.checks.state}; revisões: ${pr.reviews.state}`);
        for (const check of pr.checks.items) text(`${check.name}: ${check.status} / ${check.conclusion ?? 'sem resultado'}`);
      }
    }
    if (data.adjustments.length) {
      title(`Ajustes auditáveis (${data.adjustments.length})`);
      for (const a of data.adjustments) text(`${names([a.projectId])} · ${date(a.start)} → ${date(a.end)}\n${a.undoOf ? 'Compensação' : a.undone ? 'Desfeito' : 'Ajustado'}: ${a.previousMs} ms → ${a.nextMs} ms · ${a.reason}`);
    }
    title('Qualidade e limitações'); data.warnings.forEach(text);
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i); doc.font('regular').fontSize(8).fillColor('#606771').text(`Worklog · ${i + 1} / ${pages.count}`, 48, doc.page.height - 35, { lineBreak: false });
    }
    doc.end();
  } catch (error) { doc.destroy(); throw error; }
  return result;
}
