import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp, closeApp } from '../../src/server/index.js';
import { projectFixture } from '../project-fixture.js';
import { randomUUID } from 'node:crypto';

test('projeto: evidências e PR por SHA respeitam escopo', async () => {
  const f = await projectFixture(); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  try {
    assert.equal((await fetch(`${app.config.origin}/api/commits/${f.commit.id}`)).status, 401);
    const response = await fetch(`${app.config.origin}/api/commits/${f.commit.id}`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.sha, f.commit.sha); assert.deepEqual(body.pullRequests.map((p: { number: number }) => p.number), [1]);
    assert.equal(body.pullRequests[0].checks.state, 'none'); assert.equal(body.pullRequests[0].draft, true);
    const stored = f.ctx.db.get<{ id: string; document: string }>('SELECT id, document FROM pull_requests WHERE number = 1')!;
    f.ctx.db.run('UPDATE pull_requests SET document = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(stored.document), checks: { state: 'unavailable', items: [] }, reviews: { state: 'unavailable', items: [] } }), stored.id);
    f.ctx.db.run("UPDATE pr_sync SET error = 'GITHUB_OFFLINE'");
    const unavailable = await (await fetch(`${app.config.origin}/api/commits/${f.commit.id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.deepEqual(unavailable.pullRequests.map((p: { number: number }) => p.number), [1]);
    assert.equal(unavailable.pullRequests[0].stale, true); assert.equal(unavailable.pullRequests[0].checks.state, 'unavailable'); assert.equal(unavailable.pullRequests[0].reviews.state, 'unavailable');
    f.emit('session.start', new Date().toISOString(), { reason: 'startup' }, { cwd: undefined, nativeSessionId: 'unassigned-only' });
    const unassigned = await (await fetch(`${app.config.origin}/api/sessions?includeUnassigned=1&onlyUnassigned=1`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.deepEqual(unassigned.items.map((s: { nativeSessionId: string }) => s.nativeSessionId), ['unassigned-only']);
    f.ctx.db.run('UPDATE project_roots SET enabled = 0 WHERE id = ?', f.rootRecord.id!);
    assert.equal((await fetch(`${app.config.origin}/api/commits/${f.commit.id}`, { headers: { Authorization: `Bearer ${token}` } })).status, 404);
  } finally { await closeApp(app); await f.close(); }
});

test('projeto: conflitos HTTP e revogação real de download por política', async () => {
  const f = await projectFixture(); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  const call = (path: string, method = 'GET', body?: unknown) => fetch(`${app.config.origin}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const input = { projectId: f.projectId, start: '2026-11-05T09:00:00.000Z', end: '2026-11-05T09:05:00.000Z', nextMs: 60000, reason: 'Correção explícita', revision: 0 };
    assert.equal((await call('/api/adjustments', 'POST', input)).status, 201);
    const overlap = await call('/api/adjustments', 'POST', { ...input, revision: 1 });
    assert.equal(overlap.status, 409); assert.equal((await overlap.json()).error, 'ADJUSTMENT_OVERLAP');
    const stale = await call('/api/adjustments', 'POST', { ...input, start: '2026-11-05T10:00:00.000Z', end: '2026-11-05T10:05:00.000Z' });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).error, 'ADJUSTMENT_CHANGED');
    const note = await call('/api/notes', 'POST', { targetId: randomUUID(), text: 'Não autorizada', revision: 0 });
    assert.equal(note.status, 404); assert.equal((await note.json()).error, 'NOTE_TARGET_UNAVAILABLE');
    const query = new URLSearchParams({ projectIds: f.projectId, from: new Date(Date.now() - 3600000).toISOString(), to: new Date(Date.now() + 3600000).toISOString(), timezone: 'UTC' });
    const preview = await call(`/api/reports?${query}`, 'POST', { options: { sessions: true, notes: false, files: true, commits: true, prs: true, fullDiff: true } });
    assert.equal(preview.status, 201); const saved = await preview.json(); assert.ok(saved.report.revisions.some((r: { diff?: { patch: string } }) => r.diff?.patch.includes('+depois')));
    assert.equal((await call(`/api/reports/${saved.id}.csv`)).status, 200);
    assert.equal((await call(`/api/projects/roots/${f.rootRecord.id}`, 'PATCH', { enabled: false })).status, 200);
    for (const format of ['csv', 'pdf']) {
      const download = await call(`/api/reports/${saved.id}.${format}`); assert.equal(download.status, 410); assert.equal((await download.json()).error, 'REPORT_EXPIRED');
    }
  } finally { await closeApp(app); await f.close(); }
});
