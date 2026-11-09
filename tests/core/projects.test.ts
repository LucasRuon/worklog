import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openStore } from '../../src/core/context.js';
import { normalizeRemote, registerProjectRoot, resolveProject, listProjects } from '../../src/core/projects.js';
import { registerInstallation } from '../../src/core/events.js';

test('projetos: clones, worktrees, raízes aninhadas, unicode e identidade entre máquinas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-projects-'));
  const ctx = await openStore(join(directory, 'data'));
  const root = join(directory, 'projeto á com espaço');
  await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'https://user:secret@github.com/owner/repo.git']);
  try {
    assert.equal(normalizeRemote('git@github.com:owner/repo.git'), 'github.com/owner/repo');
    assert.equal(normalizeRemote('ssh://git@github.com:22/owner/repo.git'), 'github.com/owner/repo');
    assert.equal(normalizeRemote('https://user:secret@github.com/owner/repo.git?token=secret'), 'github.com/owner/repo');
    assert.notEqual(normalizeRemote('git@other.example:owner/repo.git'), normalizeRemote('git@github.com:owner/repo.git'));
    const projectId = registerProjectRoot(ctx, { projectName: 'Projeto real', deviceId: ctx.config.deviceId, path: root });
    const first = resolveProject(ctx, ctx.config.deviceId, root);
    assert.equal(first.state, 'matched');
    assert.equal(registerProjectRoot(ctx, { projectName: 'Repetido', deviceId: ctx.config.deviceId, path: root }), projectId);
    const remoteDevice = randomUUID();
    registerInstallation(ctx, { deviceId: remoteDevice, installationId: randomUUID(), name: 'remote', os: 'linux', timezone: 'UTC' });
    assert.equal(registerProjectRoot(ctx, { projectName: 'Clone', deviceId: remoteDevice, path: '/workspace/repo', remote: 'git@github.com:owner/repo.git' }), projectId);
    assert.notEqual(registerProjectRoot(ctx, { projectName: 'Outro', deviceId: remoteDevice, path: '/other/repo', remote: 'git@github.com:another/repo.git' }), projectId);
    const nested = join(root, 'pacote'); await mkdir(nested);
    const nestedProject = registerProjectRoot(ctx, { projectId: randomUUID(), projectName: 'Pacote', deviceId: ctx.config.deviceId, path: nested });
    assert.equal((resolveProject(ctx, ctx.config.deviceId, nested) as { projectId: string }).projectId, nestedProject);
    assert.equal(resolveProject(ctx, ctx.config.deviceId, directory).state, 'unassigned');
    const linked = join(root, 'external'); await symlink(directory, linked);
    assert.equal(resolveProject(ctx, ctx.config.deviceId, linked).state, 'unassigned');
    assert.throws(() => registerProjectRoot(ctx, { projectName: 'Tudo', deviceId: ctx.config.deviceId, path: directory }), /DATA_ROOT_OVERLAP/);
    const worktree = join(directory, 'worktree á');
    execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Worklog Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']);
    execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '-q', '-b', 'fixture-worktree', worktree]);
    assert.equal(registerProjectRoot(ctx, { projectName: 'Worktree', deviceId: ctx.config.deviceId, path: worktree }), projectId);
    const removed = join(root, 'removed'); await mkdir(removed); await rm(removed, { recursive: true });
    assert.equal((resolveProject(ctx, ctx.config.deviceId, removed) as { projectId: string }).projectId, projectId);
    assert.equal(JSON.stringify(listProjects(ctx)).includes('secret'), false);
  } finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
});
