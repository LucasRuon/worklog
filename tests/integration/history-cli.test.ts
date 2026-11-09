import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { normalizeEvent } from '../../src/core/policy.js';

test('histórico CLI: exportação, importação e erro acionável', { timeout: 60000 }, async () => {
  const f = await fixture();
  const path = join(f.directory, 'histórico com espaço.jsonl');
  const run = (...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', 'history', ...args, '--data-dir', f.ctx.config.dataDir, '--source-id', f.source.id], { encoding: 'utf8', timeout: 30000 });
  const period = ['--from', f.filter.from, '--to', f.filter.to];
  try {
    f.emit('session.start', '2026-11-05T09:00Z', { reason: 'startup' });
    f.emit('turn.start', '2026-11-05T09:01Z', { turnId: 'one' });
    f.emit('turn.end', '2026-11-05T09:02Z', { turnId: 'one', outcome: 'completed' });
    const exported = run('export', ...period, '--output', path); assert.equal(exported.status, 0, exported.stderr); assert.equal(JSON.parse(exported.stdout).exported, 3);
    const extra = normalizeEvent(f.source, { originId: 'old-history', type: 'session.start', occurredAt: '2026-11-05T08:00:00.000Z', nativeSessionId: 'historical-extra', cwd: f.root, payload: { reason: 'startup' } })[0]!;
    await appendFile(path, `${JSON.stringify(extra)}\n`);
    assert.equal(run('configure', '--parser', 'normalized-v1', '--input', path).status, 0);
    const imported = run('import', ...period); assert.equal(imported.status, 0, imported.stderr); assert.equal(JSON.parse(imported.stdout).imported, 1);
    assert.equal(JSON.parse(run('import', ...period).stdout).imported, 0);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 4);
    assert.equal((await readFile(path, 'utf8')).includes('receivedAt'), false);
    await writeFile(path, '{"private":"PRIVATE_TRANSCRIPT"}\n');
    const bad = run('import', ...period); assert.equal(bad.status, 1); assert.ok(JSON.parse(bad.stdout).warnings.includes('HISTORY_FORMAT_UNSUPPORTED'));
    assert.equal(`${bad.stdout}${bad.stderr}`.includes('PRIVATE_TRANSCRIPT'), false);
    const cancelPath = join(f.directory, 'cancelável.jsonl');
    const records = Array.from({ length: 1000 }, (_, index) => normalizeEvent(f.source, { originId: `cancel-${index}`, type: 'turn.submit', occurredAt: '2026-11-05T09:04:00.000Z', nativeSessionId: 'cancel-session', cwd: f.root, payload: { turnId: `turn-${index}` } })[0]!);
    await writeFile(cancelPath, `${JSON.stringify({ format: 'worklog-history', schemaVersion: 1, tool: f.source.tool, version: f.source.version })}\n${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
    assert.equal(run('configure', '--parser', 'normalized-v1', '--input', cancelPath).status, 0);
    const child = spawn(process.execPath, ['dist/cli/index.js', 'history', 'import', ...period, '--limit', '10000', '--data-dir', f.ctx.config.dataDir, '--source-id', f.source.id], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; child.stdout.on('data', (bytes) => { stdout += String(bytes); }); child.stderr.on('data', (bytes) => { stderr += String(bytes); });
    const exited = new Promise<number | null>((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
    try {
      const deadline = Date.now() + 5000;
      while (f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n === 4 && child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2));
      assert.ok(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n > 4);
      assert.equal(child.kill('SIGINT'), true); assert.equal(await exited, 130);
      const cancelled = JSON.parse(stdout); assert.equal(cancelled.complete, false); assert.deepEqual(cancelled.warnings, ['HISTORY_CANCELLED']);
      assert.ok(cancelled.imported > 0 && cancelled.imported < 1000);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 4 + cancelled.imported);
      const resumed = run('import', ...period, '--limit', '10000'); assert.equal(resumed.status, 0, JSON.stringify({ stdout: resumed.stdout, stderr: resumed.stderr, error: resumed.error?.message }));
      const result = JSON.parse(resumed.stdout); assert.equal(result.complete, true); assert.equal(result.imported + cancelled.imported, 1000);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 1004);
      assert.equal(JSON.parse(run('import', ...period).stdout).imported, 0);
      assert.equal(`${stdout}${stderr}${resumed.stdout}${resumed.stderr}`.includes('PRIVATE_TRANSCRIPT'), false);
    } finally { if (child.exitCode === null) child.kill('SIGKILL'); await exited; }
  } finally { await f.close(); }
});
