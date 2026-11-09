import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectFixture } from '../project-fixture.js';
import { projectSessions } from '../../src/core/sessions.js';
import { saveNote } from '../../src/core/adjustments.js';
import { queryReport, saveReport, savedReport, invalidateReports } from '../../src/reports/query.js';
import { renderCsv } from '../../src/reports/csv.js';
import { renderPdf } from '../../src/reports/pdf.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { setRootEnabled } from '../../src/core/configuration.js';

test('relatório completo: seleção, notas, PRs, revisões e política', async () => {
  const f = await projectFixture();
  try {
    projectSessions(f.ctx, f.allEvents()); const from = new Date(Date.now() - 3600000).toISOString(); const to = new Date(Date.now() + 3600000).toISOString();
    saveNote(f.ctx, f.projectId, '  =SOMA(1,2)\nNota á', { revision: 0, classification: 'work' });
    const options = { sessions: true, notes: true, files: true, commits: true, prs: true, fullDiff: true };
    const report = queryReport(f.ctx, { projectIds: [f.projectId], from, to, timezone: 'UTC' }, options);
    assert.equal(report.notes.length, 1); assert.equal(report.prs.length, 2); assert.equal(report.revisions.length, 2);
    assert.ok(report.revisions.some((r) => r.diff?.patch?.includes('+depois')));
    const csv = Buffer.from(renderCsv(report)).toString('utf8'); assert.ok(csv.includes("'  =SOMA(1,2)")); assert.ok(csv.includes('Revisão 1')); assert.ok(csv.includes('+depois'));
    const pdf = await renderPdf(report); assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
    const task = getDocument({ data: new Uint8Array(pdf) });
    try {
      const document = await task.promise; let text = '';
      for (let page = 1; page <= document.numPages; page++) text += (await (await document.getPage(page)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
      assert.match(text, /Nota á/); assert.match(text, /Revisão 1/); assert.match(text, /\+depois/);
    } finally { await task.destroy(); }
    const snapshot = saveReport(f.ctx, report); invalidateReports(f.ctx);
    assert.throws(() => savedReport(f.ctx, snapshot), { code: 'REPORT_EXPIRED' });
    const selected = queryReport(f.ctx, { projectIds: [f.projectId], from, to, timezone: 'UTC' }, { ...options, notes: false, files: false, fullDiff: false, prs: false });
    assert.equal(selected.notes.length, 0); assert.equal(selected.revisions.length, 0); assert.equal(selected.prs.length, 0);
    const policySnapshot = saveReport(f.ctx, report); setRootEnabled(f.ctx, f.rootRecord.id!, false);
    assert.throws(() => savedReport(f.ctx, policySnapshot), { code: 'REPORT_EXPIRED', status: 410 });
    assert.equal(queryReport(f.ctx, { projectIds: [f.projectId], from, to, timezone: 'UTC' }, options).revisions.length, 0);
  } finally { await f.close(); }
});
