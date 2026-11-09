import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openStore } from '../../src/core/context.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { stableId } from '../../src/core/policy.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { configureCodexHooks } from '../../src/cli/hooks.js';

test('Codex: entrypoint compilado fail-open e offline', async () => {
  const directory = await mkdtemp(join(tmpdir(), "worklog-codex ' $-"));
  const root = join(directory, 'repo'); await mkdir(root);
  const dataDir = join(directory, 'data');
  let ctx = await openStore(dataDir);
  const configPath = join(directory, 'profile', 'hooks.json');
  const sourceId = stableId(ctx.config.installationId, 'codex', configPath);
  registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'codex', profile: 'test', configPath, version: '0.167.0', enabled: true });
  registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, path: root, projectName: 'Codex offline' });
  try {
    await configureCodexHooks(configPath, 'install', { ctx, sourceId });
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const command = config.hooks.UserPromptSubmit[0].hooks[0].command as string;
    await ctx.shutdown();
    const input = { hook_event_name: 'UserPromptSubmit', session_id: 'native-offline', turn_id: 'one', cwd: root, prompt: 'PRIVATE_PROMPT' };
    const native = spawnSync('/bin/sh', ['-c', command], { input: JSON.stringify(input), encoding: 'utf8', timeout: 5000 });
    assert.equal(native.status, 0); assert.equal(native.stdout, '{}\n'); assert.equal(native.stderr, '');
    assert.equal((await readdir(join(dataDir, 'queue'))).length, 1);
    for (const body of ['{invalid', JSON.stringify({ ...input, prompt: 'x'.repeat(1024 * 1024) })]) {
      const result = spawnSync('/bin/sh', ['-c', command], { input: body, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 0); assert.equal(result.stdout, '{}\n'); assert.equal(result.stderr, '');
    }
    const unavailable = spawnSync(process.execPath, ['dist/cli/index.js', 'hook', '--worklog-codex-v1', '--data-dir', join(directory, 'missing'), '--source-id', sourceId], { input: JSON.stringify(input), encoding: 'utf8', timeout: 5000 });
    assert.equal(unavailable.status, 0); assert.equal(unavailable.stdout, '{}\n'); assert.equal(unavailable.stderr, '');
    ctx = await openStore(dataDir);
    assert.equal(drainQueue(ctx).inserted, 2);
    assert.equal(JSON.stringify(ctx.db.all('SELECT document FROM events')).includes('PRIVATE_PROMPT'), false);
  } finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
});
