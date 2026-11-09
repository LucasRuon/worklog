import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fixture } from '../helpers.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { projectSessions } from '../../src/core/sessions.js';
import { defaultReportOptions, queryReport, savedReport, saveReport } from '../../src/reports/query.js';
import { renderCsv } from '../../src/reports/csv.js';
import { renderPdf } from '../../src/reports/pdf.js';

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 1; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\r' && text[i + 1] === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  assert.equal(quoted, false); return rows;
}

test('relatórios: seleção explícita 2/4, fuso/corte, CSV reimportável e fórmula neutralizada', async () => {
  const f = await fixture();
  try {
    const ids = [f.projectId];
    for (let i = 1; i < 4; i++) {
      const root = join(f.directory, `project-${i}`); await mkdir(root);
      ids.push(registerProjectRoot(f.ctx, { path: root, projectName: `Excluído ${i}`, deviceId: f.ctx.config.deviceId }));
      f.emit('session.start', '2026-11-05T03:01Z', { reason: 'startup' }, { cwd: root, nativeSessionId: `other-${i}` });
      f.emit('session.end', '2026-11-05T03:02Z', { reason: 'other' }, { cwd: root, nativeSessionId: `other-${i}` });
    }
    f.ctx.db.run('UPDATE projects SET name = ? WHERE id = ?', '  =SOMA(1,2)\n"Árvore"', f.projectId);
    f.emit('session.start', '2026-11-05T02:59Z', { reason: 'startup' }, { nativeSessionId: 'before' });
    f.emit('session.end', '2026-11-05T02:59:59Z', { reason: 'other' }, { nativeSessionId: 'before' });
    f.emit('session.start', '2026-11-05T03:00Z', { reason: 'startup' });
    f.emit('turn.start', '2026-11-05T03:01Z', {});
    f.emit('turn.end', '2026-11-05T03:02Z', { outcome: 'completed' });
    f.emit('session.end', '2026-11-05T03:03Z', { reason: 'other' });
    f.emit('session.start', '2026-11-06T03:00Z', { reason: 'startup' }, { nativeSessionId: 'end-exclusive' });
    projectSessions(f.ctx, f.allEvents());
    const filter = { ...f.filter, projectIds: ids.slice(0, 2), from: '2026-11-05T03:00:00.000Z', to: '2026-11-06T03:00:00.000Z' };
    const report = queryReport(f.ctx, filter, defaultReportOptions);
    assert.equal(report.projects.length, 2); assert.equal(report.sessions.length, 2);
    assert.equal(report.summary.agentAccumulatedMs, 60_000);
    assert.equal(report.sessions.some((s) => ['before', 'end-exclusive'].includes(s.nativeSessionId)), false);
    assert.throws(() => queryReport(f.ctx, { ...filter, projectIds: [] }, defaultReportOptions), /REPORT_PROJECTS_REQUIRED/);
    assert.throws(() => queryReport(f.ctx, { ...filter, projectIds: [randomUUID()] }, defaultReportOptions), /UNKNOWN_PROJECT/);
    assert.equal(queryReport(f.ctx, filter, { ...defaultReportOptions, fullDiff: true }).options.fullDiff, true);
    assert.throws(() => queryReport(f.ctx, filter, { ...defaultReportOptions, files: false, fullDiff: true }), /REPORT_DIFF_REQUIRES_FILES/);
    const localOnly = queryReport(f.ctx, { ...filter, deviceIds: [randomUUID()] }, defaultReportOptions);
    assert.equal(localOnly.sessions.length, 0); assert.equal(localOnly.summary.agentAccumulatedMs, 0);
    const bytes = renderCsv(report); assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
    const text = Buffer.from(bytes).toString('utf8'); const rows = parseCsv(text);
    assert.equal(rows.every((row) => row.length === 18), true);
    assert.ok(rows.some((row) => row[1] === '\'  =SOMA(1,2)\n"Árvore"'));
    assert.equal(text.includes('Excluído 2'), false); assert.equal(text.includes('Excluído 3'), false);
    const id = saveReport(f.ctx, report); f.ctx.db.run('UPDATE projects SET name = ? WHERE id = ?', 'MODIFIED_AFTER_PREVIEW', f.projectId);
    assert.deepEqual(renderCsv(savedReport(f.ctx, id)), bytes);
    assert.throws(() => savedReport(f.ctx, randomUUID()), /REPORT_EXPIRED/);
    const pdf = await renderPdf(report);
    const pdfTask = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }); const document = await pdfTask.promise;
    try {
      let contents = '';
      for (let page = 1; page <= document.numPages; page++) contents += (await (await document.getPage(page)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
      assert.match(contents, /Dedicação humana estimada/); assert.match(contents, /Árvore/);
      assert.equal(contents.includes('Excluído 2'), false); assert.match(contents, /60000 ms/);
    } finally { await pdfTask.destroy(); }
    const long = { ...report, sessions: Array.from({ length: 120 }, (_, i) => ({ ...report.sessions[0]!, id: randomUUID(), nativeSessionId: `LONG_SESSION_${i}` })) };
    const longTask = getDocument({ data: new Uint8Array(await renderPdf(long)) }); const longDoc = await longTask.promise;
    try {
      assert.ok(longDoc.numPages > 3);
      const last = await (await longDoc.getPage(longDoc.numPages)).getTextContent();
      assert.ok(last.items.some((item) => 'str' in item && item.str.includes('Worklog')));
    } finally { await longTask.destroy(); }
  } finally { await f.close(); }
});
