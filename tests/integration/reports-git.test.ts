import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { defaultReportOptions } from '../../src/reports/query.js';

test('API autenticada: commits paginados, filtros, prévia congelada e downloads reais CSV/PDF', async () => {
  const f = await fixture();
  execFileSync('git', ['init', '-q', f.root]);
  await writeFile(join(f.root, 'ação.txt'), 'arquivo');
  const git = (...args: string[]) => execFileSync('git', ['-C', f.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-05T09:00Z', GIT_COMMITTER_DATE: '2026-11-05T09:00Z' }, stdio: 'pipe' });
  git('add', '.'); git('commit', '-qm', 'Commit incluído'); git('commit', '--allow-empty', '-qm', 'Outro commit');
  registerProjectRoot(f.ctx, { path: f.root, projectName: 'Projeto teste', deviceId: f.ctx.config.deviceId });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    const query = new URLSearchParams({ ...f.filter, projectIds: f.projectId });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const call = (path: string, init?: RequestInit) => fetch(`${app.config.origin}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
    const one = await (await call(`/api/commits?${query}&limit=1`)).json(); assert.equal(one.items.length, 1); assert.ok(one.nextCursor);
    const two = await (await call(`/api/commits?${query}&limit=1&cursor=${encodeURIComponent(one.nextCursor)}`)).json();
    assert.equal(two.items.length, 1); assert.notEqual(one.items[0].id, two.items[0].id); assert.equal(two.nextCursor, null);
    assert.equal((await call(`/api/commits?${query}&deviceIds=${randomUUID()}`)).status, 200);
    assert.equal((await (await call(`/api/commits?${query}&tools=opencode`)).json()).items.length, 0);
    assert.equal((await call('/api/reports', { method: 'POST', body: JSON.stringify({ options: defaultReportOptions }) })).status, 400);
    const response = await call(`/api/reports?${query}`, { method: 'POST', body: JSON.stringify({ options: defaultReportOptions }) }); assert.equal(response.status, 201);
    const preview = await response.json(); assert.equal(preview.report.commits.length, 2);
    f.ctx.db.run('UPDATE projects SET name = ? WHERE id = ?', 'Nome posterior', f.projectId);
    const csv = await call(`/api/reports/${preview.id}.csv`); assert.equal(csv.status, 200); assert.match(csv.headers.get('content-disposition')!, /attachment/);
    const csvText = await csv.text(); assert.match(csvText, /Commit incluído/); assert.match(csvText, /Projeto teste/); assert.equal(csvText.includes('Nome posterior'), false);
    const pdf = await call(`/api/reports/${preview.id}.pdf`); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    assert.equal((await fetch(`${app.config.origin}/api/reports/${preview.id}.csv`)).status, 401);
    assert.equal((await call(`/api/reports/${randomUUID()}.csv`)).status, 410);
    assert.equal((await call('/api/commits/scan', { method: 'POST', body: JSON.stringify({ projectIds: [f.projectId] }) })).status, 200);
  } finally { await closeApp(app); await f.close(); }
});
