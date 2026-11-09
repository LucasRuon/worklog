import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { listProjects, registerProjectRoot } from '../src/core/projects.js';
import { reconcileRoot } from '../src/collectors/files.js';
import { scanCommits } from '../src/collectors/git.js';
import { syncPullRequests } from '../src/providers/github.js';

export async function projectFixture() {
  const f = await fixture(); execFileSync('git', ['init', '-q', f.root]);
  execFileSync('git', ['-C', f.root, 'remote', 'add', 'origin', 'https://github.com/owner/repository.git']);
  registerProjectRoot(f.ctx, { path: f.root, projectId: f.projectId, projectName: 'Projeto teste', deviceId: f.ctx.config.deviceId });
  const root = listProjects(f.ctx).find((p) => p.id === f.projectId)!.roots[0]!;
  await writeFile(join(f.root, 'evidence.txt'), 'antes\n'); await reconcileRoot(f.ctx, root);
  const now = Date.now();
  f.emit('session.start', new Date(now - 60000).toISOString(), { reason: 'startup' }, { nativeSessionId: 'complete-session' });
  f.emit('tool.start', new Date(now - 1000).toISOString(), { toolName: 'Edit', toolUseId: 'edit-one' }, { nativeSessionId: 'complete-session' });
  await writeFile(join(f.root, 'evidence.txt'), 'depois\n'); await reconcileRoot(f.ctx, root, 'watch');
  execFileSync('git', ['-C', f.root, 'add', '.']);
  execFileSync('git', ['-C', f.root, '-c', 'user.name=Author', '-c', 'user.email=author@example.test', 'commit', '-qm', 'Commit completo'], { env: { ...process.env, GIT_AUTHOR_DATE: new Date(now + 2000).toISOString(), GIT_COMMITTER_DATE: new Date(now + 2000).toISOString() } });
  await scanCommits(f.ctx, root);
  const commit = f.ctx.db.get<{ id: string; sha: string }>('SELECT id, sha FROM git_commits')!;
  await syncPullRequests(f.ctx, root.repositoryId!, { request: async ({ path }) => ({ status: 200, headers: {}, body: path.includes('/pulls?') ? [1, 2].map((number) => ({ number, title: `Revisão ${number}`, state: 'open', draft: number === 1, user: { login: 'owner' }, head: { ref: 'feature', sha: commit.sha }, base: { ref: 'main' }, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), merged_at: null })) : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/reviews') ? [] : [{ sha: path.includes('/pulls/1/') ? commit.sha : '9'.repeat(40) }] }) });
  return { ...f, rootRecord: root, commit };
}
