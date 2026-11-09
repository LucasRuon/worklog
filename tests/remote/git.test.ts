import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { gitScans, listCommits, scanCommits } from '../../src/collectors/git.js';
import { describeAgent, exportBatch, importEnvelope } from '../../src/remote/protocol.js';
import { exportGitPacket, importGitPacket, syncRemoteGit } from '../../src/remote/git.js';
import { stableId } from '../../src/core/policy.js';

test('Git remoto: snapshot paginado, replay, origem, deduplicação e pacote inválido sem escrita parcial', async () => {
  const local = await fixture(); const remote = await fixture();
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', remote.root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Remote', GIT_AUTHOR_EMAIL: 'r@example.test', GIT_COMMITTER_NAME: 'Remote', GIT_COMMITTER_EMAIL: 'r@example.test', GIT_AUTHOR_DATE: '2026-11-05T09:00Z', GIT_COMMITTER_DATE: '2026-11-05T09:00Z' } }).trim();
    git('init', '-q'); git('remote', 'add', 'origin', 'https://example.test/remote/work.git');
    await writeFile(join(remote.root, 'ação.txt'), 'remote'); git('add', '.'); git('commit', '-qm', 'Entrega remota');
    registerProjectRoot(remote.ctx, { path: remote.root, projectName: 'Remoto', deviceId: remote.ctx.config.deviceId });
    const root = listProjects(remote.ctx).flatMap((p) => p.roots)[0]!;
    await scanCommits(remote.ctx, root);
    const original = remote.ctx.db.get<{ document: string }>('SELECT document FROM git_commits')!;
    const metadata = JSON.parse(original.document);
    remote.ctx.db.transaction(() => {
      for (let i = 0; i < 60; i++) {
        const sha = createHash('sha1').update(`commit-${i}`).digest('hex'); const id = stableId(root.repositoryId!, sha);
        remote.ctx.db.run('INSERT INTO git_commits VALUES (?, ?, ?, ?, ?)', id, root.repositoryId!, sha, metadata.committedAt, JSON.stringify({ ...metadata, sha, id }));
        remote.ctx.db.run('INSERT INTO git_observations VALUES (?, ?, 0, ?)', root.id!, id, '2026-11-05T09:01:00.000Z');
      }
    });
    importEnvelope(local.ctx, exportBatch(remote.ctx, 0));
    const description = describeAgent(remote.ctx);
    const run = async (_command: string, args: string[] = []) => {
      const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
      return JSON.stringify(exportGitPacket(remote.ctx, Number(option('--after') ?? 0), option('--snapshot'), option('--known')));
    };
    await syncRemoteGit(local.ctx, description, run);
    let commits = listCommits(local.ctx, local.filter);
    assert.equal(commits.length, 61); assert.equal(commits[0]!.origins[0]!.deviceId, remote.ctx.config.deviceId);
    assert.equal(commits.some((c) => c.files.some((f) => f.path === 'ação.txt')), true);
    assert.equal(gitScans(local.ctx, local.filter).find((s) => s.deviceId === remote.ctx.config.deviceId)!.error, null);
    await syncRemoteGit(local.ctx, description, run); assert.equal(listCommits(local.ctx, local.filter).length, 61);
    const packet = exportGitPacket(remote.ctx); const bad = structuredClone(packet);
    remote.ctx.db.run('UPDATE git_scans SET scanned_at = ?', '2026-11-05T10:00:00.000Z');
    assert.equal(exportGitPacket(remote.ctx, 50, packet.snapshot).snapshot, packet.snapshot);
    bad.items[0]!.files.push({ path: '.env', status: 'A', previousPath: null });
    assert.throws(() => importGitPacket(local.ctx, description, bad, 0), /GIT_PACKET_INVALID/);
    assert.equal(listCommits(local.ctx, local.filter).length, 61);
    assert.throws(() => exportGitPacket(remote.ctx, 50, 'old'), /GIT_SNAPSHOT_CHANGED/);
    local.ctx.db.run('DELETE FROM git_remote_sync');
    await syncRemoteGit(local.ctx, description, async (command, args = []) => {
      const value = JSON.parse(await run(command, args));
      if (value.offset > 0) value.snapshot = '0'.repeat(64);
      return JSON.stringify(value);
    });
    assert.equal(gitScans(local.ctx, local.filter).find((s) => s.deviceId === remote.ctx.config.deviceId)!.error, 'GIT_REMOTE_SYNC_FAILED');
    await syncRemoteGit(local.ctx, description, run);
    await syncRemoteGit(local.ctx, description, async () => '{');
    assert.equal(gitScans(local.ctx, local.filter).find((s) => s.deviceId === remote.ctx.config.deviceId)!.error, 'GIT_REMOTE_SYNC_FAILED');
    await syncRemoteGit(local.ctx, description, run);
    commits = listCommits(local.ctx, { ...local.filter, deviceIds: [local.ctx.config.deviceId] }); assert.equal(commits.length, 0);
  } finally { await local.close(); await remote.close(); }
});
