import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { backupData, restoreData, storageUsage } from '../dist/core/maintenance.js';
import { openStore } from '../dist/core/context.js';
import { queryReport } from '../dist/reports/query.js';
import { renderCsv, timeMeasures } from '../dist/reports/csv.js';
import { renderPdf } from '../dist/reports/pdf.js';
import { adjustmentRevision, applyAdjustment, saveNote, undoAdjustment } from '../dist/core/adjustments.js';
import { serviceStatus } from '../dist/cli/service.js';
import { drainQueue } from '../dist/collectors/claude.js';
import { projectSessions } from '../dist/core/sessions.js';

const from = '2026-11-09T02:03:00.000Z';
const selected = [
  ['Worklog', join(homedir(), 'Downloads/Sistemas/Worklog')],
  ['Posicionadas', join(homedir(), 'Developer/Posicionadas')],
];
const sourceDir = join(homedir(), 'Library/Application Support/Worklog');
const tables = ['events', 'sessions', 'file_revisions', 'file_contents', 'time_adjustments', 'note_versions'];
const counts = db => Object.fromEntries(tables.map(table => [table, db.get(`SELECT count(*) n FROM ${table}`).n]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function eventDigest(db, maxRow) {
  const digest = createHash('sha256');
  for (const r of db.all('SELECT document FROM events WHERE rowid <= ? ORDER BY rowid', maxRow)) digest.update(r.document + '\n');
  return digest.digest('hex');
}
function union(spans) {
  let end = -Infinity, total = 0;
  for (const [left, right] of spans.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, right - Math.max(left, end)); end = Math.max(end, right);
  }
  return total;
}
function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  assert.equal(quoted, false); return rows;
}
async function exportAndCheck(report, directory, stem) {
  const csv = renderCsv(report), pdf = await renderPdf(report);
  const rows = csvRows(Buffer.from(csv).toString('utf8'));
  assert.deepEqual(rows[0].slice(0, 2), ['tipo', 'projeto']);
  for (const [key, label] of timeMeasures) {
    const row = rows.find(r => r[0] === 'tempo' && r[1] === 'TOTAL DA SELEÇÃO' && r[8] === label);
    assert.ok(row, 'csv-summary'); assert.equal(Number(row[9]), report.summary[key], 'csv-summary');
  }
  assert.ok(rows.slice(1).every(r => ['', 'TOTAL DA SELEÇÃO', report.projects[0].name].includes(r[1])), 'report-scope');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(pdf) }); let pages;
  try {
    const doc = await task.promise; pages = doc.numPages; assert.ok(pages > 0);
    let text = '';
    for (let n = 1; n <= pages; n++) text += (await (await doc.getPage(n)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ') + ' ';
    text = text.replace(/\s+/g, ' ');
    assert.ok(text.includes(`Projetos: ${report.projects[0].name}`), 'pdf-summary');
    for (const [key, label] of timeMeasures) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const measure = text.match(new RegExp(`${escaped}:\\s*[^()]*\\(\\s*(\\d+)\\s+ms;`));
      assert.ok(measure, 'pdf-summary'); assert.equal(Number(measure[1]), report.summary[key], 'pdf-summary');
    }
  } finally { await task.destroy(); }
  await writeFile(join(directory, `${stem}.csv`), csv, { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, `${stem}.pdf`), pdf, { mode: 0o600, flag: 'wx' });
  return { csvBytes: csv.length, pdfBytes: pdf.length, pages, summary: report.summary, sessions: report.sessions.length, revisions: report.revisions.length, commits: report.commits.length, prs: report.prs.length, notes: report.notes.length };
}

async function main() {
  const to = new Date(Date.now() - 20000).toISOString(); assert.ok(to > from);
  const connection = new DatabaseSync(join(sourceDir, 'worklog.sqlite'), { readOnly: true });
  connection.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000');
  // No source-side run/exec/transaction method: maintenance only gets readonly queries + SQLite backup.
  const db = {
    get: (sql, ...args) => connection.prepare(sql).get(...args),
    all: (sql, ...args) => connection.prepare(sql).all(...args),
    backup: destination => backup(connection, destination),
  };
  const value = key => db.get('SELECT value FROM settings WHERE key=?', key).value;
  const origin = { db, config: { dataDir: sourceDir, deviceId: value('deviceId'), installationId: value('installationId'), timezone: value('timezone'), port: 0, origin: '' } };
  const originalLedger = { notes: db.get('SELECT count(*) n FROM note_versions').n, adjustments: db.get('SELECT count(*) n FROM time_adjustments').n };
  let restored;
  try {
    const projects = selected.map(([name, path]) => {
      const p = db.get('SELECT p.id,p.name,r.enabled FROM project_roots r JOIN projects p ON p.id=r.project_id WHERE r.path=? AND r.device_id=?', path, origin.config.deviceId);
      assert.ok(p); assert.equal(p.name, name); assert.equal(p.enabled, 1);
      const rows = db.all(`SELECT e.type,count(*) n FROM events e JOIN event_projects ep ON ep.event_id=e.event_id JOIN sources s ON s.id=e.source_id WHERE ep.project_id=? AND s.tool='opencode' AND s.version='2.2.6' AND s.enabled=1 AND e.occurred_at>=? AND e.occurred_at<? GROUP BY e.type`, p.id, from, to);
      for (const type of ['session.start', 'turn.submit', 'turn.start', 'turn.end', 'tool.start', 'tool.end']) assert.ok(rows.some(r => r.type === type && r.n > 0), 'capture');
      return { ...p, path, eventTypes: rows };
    });
    assert.notEqual(projects[0].id, projects[1].id);
    const match = db.all(`SELECT DISTINCT ep.project_id FROM events e LEFT JOIN event_projects ep ON ep.event_id=e.event_id WHERE json_extract(e.document,'$.nativeSessionId')=?`, 'ses_e41d38cbcffeHUOj6Xr0bYJFdq');
    assert.deepEqual(match.map(r => r.project_id), [projects[1].id], 'native-match');
    const temporaryBase = '/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode';
    const directory = await realpath(await mkdtemp(join(temporaryBase, 'worklog-pilot-safe-')));
    const backupDir = join(directory, 'backup'), target = join(directory, 'restored'), reportsDir = join(directory, 'reports');
    await mkdir(reportsDir, { mode: 0o700 });
    assert.equal((await backupData(origin, backupDir)).code, 'BACKUP_OK');
    const manifest = JSON.parse(await readFile(join(backupDir, 'manifest.json'), 'utf8'));
    assert.equal(existsSync(join(backupDir, 'bootstrap.token')), false, 'no-token');
    assert.equal((await restoreData({ backup: backupDir, dataDir: target })).code, 'RESTORE_OK');
    assert.equal(existsSync(join(target, 'bootstrap.token')), false, 'no-token');
    restored = await openStore(target);
    assert.equal(restored.config.deviceId, origin.config.deviceId); assert.equal(restored.config.installationId, origin.config.installationId);
    assert.deepEqual(counts(restored.db), manifest.counts, 'restore-counts');
    const maxRow = restored.db.get('SELECT max(rowid) n FROM events').n;
    assert.equal(eventDigest(restored.db, maxRow), eventDigest(db, maxRow), 'event-digest');
    for (const item of manifest.pending) assert.equal(hash(await readFile(join(target, item.path))), item.sha256, 'pending-hashes');
    const queued = await Promise.all(manifest.pending.filter(p => p.path.startsWith('queue/')).map(async p => ({ path: p.path, bytes: await readFile(join(backupDir, p.path)) })));
    const queuedEvents = queued.flatMap(p => JSON.parse(p.bytes.toString('utf8')).events);
    const firstDrain = drainQueue(restored);
    assert.equal(firstDrain.rejected, 0); assert.equal(firstDrain.pending, 0);
    assert.equal(firstDrain.inserted + firstDrain.duplicates, queuedEvents.length);
    const recovered = queuedEvents.map(event => {
      const row = restored.db.get('SELECT document FROM events WHERE event_id=?', event.eventId); assert.ok(row);
      const { originSeq, receivedAt, ...input } = JSON.parse(row.document);
      assert.deepEqual(input, event, 'pending-hashes'); return JSON.parse(row.document);
    });
    projectSessions(restored, recovered);
    for (const item of queued) await writeFile(join(target, item.path), item.bytes, { mode: 0o600, flag: 'wx' });
    const replayDrain = drainQueue(restored);
    assert.equal(replayDrain.inserted, 0); assert.equal(replayDrain.duplicates, queuedEvents.length); assert.equal(replayDrain.rejected, 0); assert.equal(replayDrain.pending, 0);
    const filter = { from, to, timezone: 'America/Sao_Paulo', deviceIds: [origin.config.deviceId] };
    const options = { sessions: true, notes: true, files: true, commits: true, prs: true, fullDiff: false };
    const reportFor = p => queryReport(restored, { ...filter, projectIds: [p.id] }, options);
    const beforeReports = projects.map(reportFor); const exports = [];
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i], report = beforeReports[i];
      assert.deepEqual(report.projects.map(r => r.id), [p.id], 'report-scope');
      for (const list of [report.sessions, report.revisions, report.notes, report.adjustments]) assert.ok(list.every(row => row.projectId === p.id), 'report-scope');
      assert.ok(report.sessions.every(row => row.deviceId === origin.config.deviceId));
      assert.ok(report.revisions.every(row => row.occurredAt >= from && row.occurredAt < to && row.deviceId === origin.config.deviceId));
      assert.ok(report.prs.every(row => row.projectIds.every(id => id === p.id)));
      assert.ok(report.commits.every(row => row.origins.every(o => o.projectId === p.id && o.deviceId === origin.config.deviceId)));
      assert.ok(report.sessions.length > 0);
      exports.push({ project: p.name, ...(await exportAndCheck(report, reportsDir, p.name.toLowerCase() + '-before')) });
    }
    const both = queryReport(restored, { ...filter, projectIds: projects.map(p => p.id) }, options);
    const spans = restored.db.all(`SELECT se.session_id,s.project_id,se.start_at,se.end_at FROM session_executions se JOIN sessions s ON s.id=se.session_id WHERE s.project_id IN (?,?) AND s.device_id=? AND se.start_at<? AND se.end_at>?`, projects[0].id, projects[1].id, origin.config.deviceId, to, from).map(r => ({ ...r, span: [Math.max(Date.parse(from), Date.parse(r.start_at)), Math.min(Date.parse(to), Date.parse(r.end_at))] }));
    const bySession = new Map();
    for (const r of spans) { const list = bySession.get(r.session_id) ?? []; list.push(r.span); bySession.set(r.session_id, list); }
    const accumulated = [...bySession.values()].reduce((n, list) => n + union(list), 0), wall = union(spans.map(r => r.span));
    assert.equal(both.summary.agentAccumulatedMs, accumulated, 'time-bounds'); assert.equal(both.summary.agentWallMs, wall, 'time-bounds');
    assert.ok(accumulated >= wall); assert.ok(wall <= Date.parse(to) - Date.parse(from));
    const crossProjectOverlapMs = projects.reduce((n, p) => n + union(spans.filter(r => r.project_id === p.id).map(r => r.span)), 0) - wall;
    assert.ok(crossProjectOverlapMs >= 0);
    const before = beforeReports[0], frozenCsv = hash(renderCsv(before));
    const note = 'Ensaio T24 somente na copia restaurada; nao representa atividade ou dedicacao declarada pelo usuario.';
    saveNote(restored, projects[0].id, note, { classification: 'context', occurredAt: new Date(Date.parse(to) - 1000).toISOString() });
    assert.ok(reportFor(projects[0]).notes.some(n => n.text === note), 'clone-note');
    const start = new Date(Date.parse(to) - 120000).toISOString(), end = new Date(Date.parse(to) - 60000).toISOString();
    const id = applyAdjustment(restored, { projectId: projects[0].id, start, end, nextMs: 30000, reason: note, revision: adjustmentRevision(restored) });
    const after = reportFor(projects[0]);
    assert.equal(after.summary.humanAdjustedMs, before.summary.humanAdjustedMs + 30000, 'clone-adjustment');
    assert.equal(hash(renderCsv(before)), frozenCsv, 'clone-adjustment');
    const afterExport = await exportAndCheck(after, reportsDir, 'worklog-after-clone-adjustment');
    undoAdjustment(restored, id, { revision: adjustmentRevision(restored), reason: 'Compensacao do ensaio isolado T24' });
    assert.deepEqual(reportFor(projects[0]).summary, before.summary, 'undo');
    const currentLedger = { notes: db.get('SELECT count(*) n FROM note_versions').n, adjustments: db.get('SELECT count(*) n FROM time_adjustments').n };
    assert.deepEqual(currentLedger, originalLedger, 'origin-ledger-unchanged');
    assert.equal(eventDigest(restored.db, maxRow), eventDigest(db, maxRow), 'event-digest');
    let health;
    try { const response = await fetch('http://127.0.0.1:4320/api/health', { signal: AbortSignal.timeout(3000), redirect: 'error' }); health = { status: response.status }; }
    catch { health = { status: 'unavailable' }; }
    const remote = db.all('SELECT host,last_sync_at,failures,last_error IS NOT NULL hasError,clock_skew_ms FROM remote_hosts WHERE host=?', 'macmini');
    const claude = db.all("SELECT s.profile,d.os,max(e.occurred_at) lastEvent FROM sources s JOIN devices d ON d.id=s.device_id LEFT JOIN events e ON e.source_id=s.id WHERE s.tool='claude' AND s.enabled=1 GROUP BY s.id");
    const storage = storageUsage(origin);
    const report = { passed: true, at: new Date().toISOString(), from, to, scope: 'personal-snapshot-private-clone-no-production-ledger-writes', capture: projects.map(p => ({ project: p.name, eventTypes: p.eventTypes })), nativePosicionadasMatched: true, snapshot: { counts: manifest.counts, eventDigest: eventDigest(restored.db, maxRow), pendingFiles: queued.length, receipts: manifest.pending.filter(p => p.path.startsWith('codex-receipts/')).length, identityPreserved: true, tokenCopied: false, queueRecovery: { events: queuedEvents.length, firstDrain, replayDrain } }, exports, cloneAdjustment: { nextMs: 30000, undone: true, originalLedgerUnchanged: true, afterExport }, parallel: { accumulatedMs: accumulated, wallMs: wall, crossProjectOverlapMs, humanDedicationNotProvenByAgentOverlap: true }, operation: { localService: await serviceStatus(sourceDir), health, persistedRemoteStatus: remote, claude }, storage: { ...storage, baselineBytes: 145495130, deltaBytes: storage.bytes - 145495130, dailyGrowthProven: false }, privateDirectory: directory, unproven: ['physical-lock-sleep', 'closed-terminal-observation', 'real-ssh-outage-backlog-recovery', 'human-dedication-ground-truth', 'full-day-storage-growth', 'visual-pdf-review', 'production-user-note-adjustment', 'real-file-session-commit-pr-chain'] };
    const output = resolve('artifacts/t24-safe'); await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await restored?.shutdown(); connection.close(); }
}

void main().catch(error => { console.error(JSON.stringify({ passed: false, code: error?.code ?? 'T24_SAFE_PROOF_FAILED', assertion: error?.operator ?? null })); process.exitCode = 1; });
