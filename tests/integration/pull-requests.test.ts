import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { syncPullRequests } from '../../src/providers/github.js';

test('PRs: API autenticada, escopo e snapshots persistidos', async () => {
  const f = await fixture(); const repositoryId = randomUUID();
  f.ctx.db.run('INSERT INTO repositories VALUES (?, ?, ?)', repositoryId, 'github.com/owner/repository', f.projectId);
  f.ctx.db.run('UPDATE project_roots SET repository_id = ? WHERE project_id = ?', repositoryId, f.projectId);
  await syncPullRequests(f.ctx, repositoryId, { now: Date.now(), request: async ({ path }) => ({ status: 200, headers: {}, body: path.includes('/pulls?') ? [{ number: 1, title: 'PR real fixture', state: 'open', draft: false, user: { login: 'owner' }, head: { ref: 'feature', sha: 'a'.repeat(40) }, base: { ref: 'main' }, created_at: '2026-11-05T08:00:00Z', updated_at: '2026-11-05T09:00:00Z', merged_at: null, closed_at: null }] : path.includes('/check-runs') ? { check_runs: [] } : [] }) });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 }); const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; const query = new URLSearchParams({ from: f.filter.from, to: f.filter.to, timezone: 'UTC', projectIds: f.projectId });
  try {
    assert.equal((await fetch(`${app.config.origin}/api/prs`)).status, 401);
    const response = await fetch(`${app.config.origin}/api/prs?${query}&limit=1`, { headers }); assert.equal(response.status, 200);
    const page = await response.json(); assert.equal(page.items.length, 1); assert.equal(page.items[0].url, 'https://github.com/owner/repository/pull/1'); assert.equal(page.items[0].checks.state, 'none');
    const excluded = new URLSearchParams(query); excluded.set('projectIds', randomUUID());
    assert.equal((await (await fetch(`${app.config.origin}/api/prs?${excluded}`, { headers })).json()).items.length, 0);
    const unknown = await fetch(`${app.config.origin}/api/prs/sync`, { method: 'POST', headers, body: JSON.stringify({ repositoryId: randomUUID() }) }); assert.equal(unknown.status, 400);
    f.ctx.db.run('UPDATE pr_sync SET error = ?, retry_after_ms = ?, next_sync_ms = ? WHERE repository_id = ?', 'GITHUB_FORBIDDEN', Date.now() + 900000, Date.now() + 900000, repositoryId);
    const delayed = await (await fetch(`${app.config.origin}/api/prs/sync`, { method: 'POST', headers, body: JSON.stringify({ repositoryId }) })).json();
    assert.equal(delayed.stale, true); assert.equal(delayed.sync.error, 'GITHUB_FORBIDDEN');
    assert.equal((await (await fetch(`${app.config.origin}/api/prs?${query}`, { headers })).json()).items[0].stale, true);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM pull_requests')!.n, 1);
  } finally { await closeApp(app); await f.close(); }
});
