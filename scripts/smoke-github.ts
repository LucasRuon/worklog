import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/core/context.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { listPullRequests, pullRequestSyncState, syncPullRequests } from '../src/providers/github.js';

const directory = await mkdtemp(join(tmpdir(), 'worklog-github-live-')); const ctx = await openStore(join(directory, 'data'));
try {
  registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, projectName: 'Piloto Worklog', path: process.cwd() });
  const repositoryId = ctx.db.get<{ repository_id: string }>('SELECT repository_id FROM project_roots WHERE repository_id IS NOT NULL')?.repository_id;
  assert.ok(repositoryId, 'Cadastre o remote GitHub do piloto antes do smoke.');
  const first = await syncPullRequests(ctx, repositoryId); const state = pullRequestSyncState(ctx, repositoryId);
  assert.equal(first.stale, false, state?.error ?? 'Sincronização GitHub indisponível');
  const rows = listPullRequests(ctx, { projectIds: [], from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z', timezone: 'UTC' });
  console.log(JSON.stringify({ passed: true, transport: 'gh-api-GET', updated: first.updated, observedPullRequests: rows.length, linksValid: rows.every((p) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(p.url)), nativePullRequestReview: rows.length ? 'snapshot-read' : 'pending-repository-has-no-pull-requests', storage: 'temporary-isolated-store', independentVerifier: 'deferred-by-user' }, null, 2));
} finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
