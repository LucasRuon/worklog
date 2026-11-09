import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listPullRequests, syncPullRequests, pullRequestSyncState, waitForPullRequests, type GithubRequest } from '../../src/providers/github.js';

export function pull(number: number, merged = false, closed = false) {
  return { number, title: `PR ${number}`, state: closed || merged ? 'closed' : 'open', draft: number === 1, merged_at: merged ? '2026-11-05T09:30:00Z' : null, closed_at: closed || merged ? '2026-11-05T09:30:00Z' : null, created_at: '2026-11-05T08:00:00Z', updated_at: '2026-11-05T09:30:00Z', user: { login: 'owner' }, head: { ref: `feature-${number}`, sha: String(number).repeat(40) }, base: { ref: 'main' } };
}
export async function repositoryFixture() {
  const f = await fixture(); const repositoryId = randomUUID();
  f.ctx.db.run('INSERT INTO repositories VALUES (?, ?, ?)', repositoryId, 'github.com/owner/repository', f.projectId);
  f.ctx.db.run('UPDATE project_roots SET repository_id = ? WHERE project_id = ?', repositoryId, f.projectId);
  return { ...f, repositoryId };
}
const now = Date.parse('2026-11-05T10:00:00.000Z');

test('GitHub: páginas, estados e enriquecimento sem falsa aprovação', async () => {
  const f = await repositoryFixture(); const methods: string[] = [];
  const request: GithubRequest = async ({ path, method }) => {
    methods.push(method);
    if (path.includes('/pulls?')) return path.endsWith('page=1') ? { status: 200, headers: { link: '<https://api.github.com/repos/owner/repository/pulls?page=2>; rel="next"' }, body: [pull(1), pull(2, true)] } : { status: 200, headers: {}, body: [pull(3, false, true)] };
    if (path.includes('/pulls/2/reviews') || path.includes(`/commits/${'2'.repeat(40)}/check-runs`)) return { status: 403, headers: {}, body: { message: 'PRIVATE_RESPONSE' } };
    if (path.includes('/reviews')) return { status: 200, headers: {}, body: [{ id: 42, user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-11-05T09:00:00Z', body: 'PRIVATE_REVIEW_BODY' }] };
    if (path.includes('/check-runs')) return { status: 200, headers: {}, body: { check_runs: path.includes('1'.repeat(40)) ? [{ id: 11, name: 'test', status: 'completed', conclusion: 'failure' }] : [] } };
    return { status: 200, headers: {}, body: [{ sha: 'a'.repeat(40) }] };
  };
  try {
    const result = await syncPullRequests(f.ctx, f.repositoryId, { request, now }); assert.equal(result.updated, 3); assert.equal(result.stale, false);
    const rows = listPullRequests(f.ctx, f.filter, now); assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((p) => [p.number, p.state]).sort((a, b) => Number(a[0]) - Number(b[0])), [[1, 'open'], [2, 'merged'], [3, 'closed']]);
    const draft = rows.find((p) => p.number === 1)!; assert.equal(draft.draft, true); assert.equal(draft.author, 'owner'); assert.equal(draft.baseBranch, 'main'); assert.equal(draft.headBranch, 'feature-1');
    assert.deepEqual(draft.commits, ['a'.repeat(40)]); assert.equal(draft.checks.items[0]?.conclusion, 'failure');
    const denied = rows.find((p) => p.number === 2)!; assert.equal(denied.reviews.state, 'unavailable'); assert.equal(denied.checks.state, 'unavailable');
    assert.equal(rows.find((p) => p.number === 3)!.checks.state, 'none');
    assert.equal(draft.createdAt, '2026-11-05T08:00:00.000Z'); assert.equal(draft.updatedAt, '2026-11-05T09:30:00.000Z'); assert.equal(draft.closedAt, null); assert.equal(draft.mergedAt, null);
    assert.equal(denied.closedAt, '2026-11-05T09:30:00.000Z'); assert.equal(denied.mergedAt, '2026-11-05T09:30:00.000Z');
    assert.equal(rows.find((p) => p.number === 3)!.closedAt, '2026-11-05T09:30:00.000Z'); assert.equal(rows.find((p) => p.number === 3)!.mergedAt, null);
    assert.ok(methods.length > 4 && methods.every((method) => method === 'GET'));
    assert.equal(JSON.stringify(rows).includes('PRIVATE_'), false);
    assert.equal(listPullRequests(f.ctx, { ...f.filter, projectIds: [randomUUID()] }, now).length, 0);
    await syncPullRequests(f.ctx, f.repositoryId, { now: now + 300000, request: async ({ path }) => ({ status: 200, headers: {}, body: path.includes('/pulls?') ? [pull(4)] : path.includes('/reviews') ? [{ id: 1, user: { login: 'reviewer' }, state: 'FUTURE_UNKNOWN', submitted_at: null }] : path.includes('/check-runs') ? { check_runs: [{ id: 1, name: 'test', status: 'FUTURE_UNKNOWN', conclusion: 'success' }] } : [] }) });
    const unknown = listPullRequests(f.ctx, f.filter, now + 300000).find((p) => p.number === 4)!;
    assert.equal(unknown.reviews.state, 'unavailable'); assert.deepEqual(unknown.reviews.items, []);
    assert.equal(unknown.checks.state, 'unavailable'); assert.deepEqual(unknown.checks.items, []);
  } finally { await f.close(); }
});

test('GitHub: cache 304, falhas e rate limit respeitado', async () => {
  const f = await repositoryFixture(); let mode: number | 'offline' = 200; let calls = 0; let conditional = false;
  const request: GithubRequest = async ({ path, headers }) => {
    calls++;
    if (mode === 'offline') throw new Error('PRIVATE_TOKEN');
    if (path.includes('/pulls?')) {
      conditional ||= headers['If-None-Match'] === '"version-1"';
      return { status: mode, headers: mode === 200 ? { etag: '"version-1"' } : mode === 429 ? { 'retry-after': '900' } : {}, body: mode === 200 ? [pull(1)] : { message: 'PRIVATE_TOKEN' } };
    }
    return { status: 200, headers: {}, body: path.includes('/check-runs') ? { check_runs: [] } : [] };
  };
  try {
    await syncPullRequests(f.ctx, f.repositoryId, { request, now });
    mode = 304; const cached = await syncPullRequests(f.ctx, f.repositoryId, { request, now: now + 300000 });
    assert.equal(cached.stale, false); assert.equal(cached.updated, 0); assert.equal(conditional, true);
    let clock = now + 600000;
    for (const failure of [401, 403, 'offline', 429] as const) {
      mode = failure;
      const result = await syncPullRequests(f.ctx, f.repositoryId, { request, now: clock, force: true }); assert.equal(result.stale, true);
      assert.equal(listPullRequests(f.ctx, f.filter, clock).length, 1); assert.equal(listPullRequests(f.ctx, f.filter, clock)[0]!.stale, true);
      const state = pullRequestSyncState(f.ctx, f.repositoryId)!; assert.equal(JSON.stringify(state).includes('PRIVATE_TOKEN'), false);
      const before = calls; await syncPullRequests(f.ctx, f.repositoryId, { request, now: clock + 1, force: true }); assert.equal(calls, before);
      if (failure === 429) assert.ok(state.nextSyncAt >= clock + 900000);
      clock = state.nextSyncAt + 1;
    }
  } finally { await f.close(); }
});

test('GitHub: encerramento cancela requisição e preserva diagnóstico seguro', { timeout: 5000 }, async () => {
  const f = await repositoryFixture(); let ready!: () => void; const started = new Promise<void>((resolve) => { ready = resolve; });
  const request: GithubRequest = ({ signal }) => new Promise((_, reject) => { signal!.addEventListener('abort', () => reject(new Error('PRIVATE_ERROR')), { once: true }); ready(); });
  try {
    const sync = syncPullRequests(f.ctx, f.repositoryId, { request }); await started;
    await waitForPullRequests(f.ctx);
    assert.equal((await sync).stale, true); assert.equal(pullRequestSyncState(f.ctx, f.repositoryId)!.error, 'GITHUB_CANCELLED');
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM pull_requests')!.n, 0);
  } finally { await f.close(); }
});
