import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureDecision, defaultPolicy, normalizeEvent } from '../../src/core/policy.js';

test('política: segredos, exemplos, ignores, symlink externo, traversal, binários e tamanho', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-policy-'));
  const root = join(directory, 'repo'); await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  await writeFile(join(root, '.gitignore'), 'ignored/\n');
  await mkdir(join(root, 'ignored')); await writeFile(join(root, 'ignored', 'text.txt'), 'no');
  await writeFile(join(root, '.env.example'), 'TOKEN=secret');
  await writeFile(join(root, 'code.ts'), 'export const value = 1;');
  await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]));
  await writeFile(join(root, 'large.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
  await symlink(directory, join(root, 'escape'));
  const project = { projectName: 'Test', deviceId: randomUUID(), path: root };
  try {
    for (const path of ['.env', '.env.example', 'key.pem', '.ssh/id_rsa', '../outside', 'escape/private.txt', 'ignored/text.txt', 'node_modules/pkg/a.js']) {
      assert.equal(captureDecision(project, path, defaultPolicy).metadata, false, path);
    }
    assert.equal(captureDecision(project, 'code.ts', defaultPolicy).content, true);
    assert.equal(captureDecision(project, 'binary.dat', defaultPolicy).content, false);
    assert.equal(captureDecision(project, 'large.txt', defaultPolicy).content, false);
    assert.equal(captureDecision(project, '.env.example', { ...defaultPolicy, allowExamples: ['.env.example'] }).content, true);
    const source = { id: randomUUID(), deviceId: project.deviceId, installationId: randomUUID(), tool: 'claude' as const, profile: 'test', configPath: directory, version: '2.1.318', enabled: true };
    const raw = JSON.parse(await readFile(new URL('../fixtures/events/tool.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const one = normalizeEvent(source, raw)[0]!;
    assert.equal(JSON.stringify(one).includes('secret'), false);
    assert.equal(normalizeEvent(source, raw)[0]!.eventId, one.eventId);
    assert.notEqual(normalizeEvent(source, { ...raw, originId: 'position-two' })[0]!.eventId, one.eventId);
    assert.equal(normalizeEvent(source, { ...raw, payload: { prompt: 'secret' } }).length, 0);
    assert.equal(normalizeEvent(source, { ...raw, stdout: 'x'.repeat(1024 * 1024 + 1) }).length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
