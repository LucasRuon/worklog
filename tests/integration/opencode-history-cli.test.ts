import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { nativeLog } from '../opencode-log-fixture.js';
import { registerSource } from '../../src/collectors/source-config.js';

test('histórico CLI v2: parser nativo, replay e recusa de origem', async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, 'histórico nativo com espaços.sse'); const log = nativeLog(f.root, '2.2.6'); await writeFile(path, log.bytes);
    const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version: '2.2.6', configPath: path }; registerSource(f.ctx, source);
    const run = (id: string, ...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', 'history', ...args, '--data-dir', f.ctx.config.dataDir, '--source-id', id], { encoding: 'utf8', timeout: 10000 });
    const configured = run(source.id, 'configure', '--parser', 'opencode-log-v1', '--input', path); assert.equal(configured.status, 0, configured.stderr);
    const args = ['import', '--from', '2026-11-06T09:00:00.000Z', '--to', '2026-11-06T09:01:00.000Z'];
    const first = run(source.id, ...args); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).imported, 8); assert.equal(JSON.parse(first.stdout).complete, true);
    const replay = run(source.id, ...args); assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).imported, 0);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 8); assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM event_provenance')!.n, 8);
    const wrong = run(f.source.id, 'configure', '--parser', 'opencode-log-v1', '--input', path); assert.equal(wrong.status, 1); assert.match(wrong.stderr, /HISTORY_SOURCE_MISMATCH/);
    assert.equal(`${first.stdout}${first.stderr}${wrong.stdout}${wrong.stderr}`.includes('PRIVATE_TRANSCRIPT'), false);
    assert.deepEqual(await readFile(path, 'utf8'), log.bytes);
    await writeFile(path, log.frame({ type: 'log.synced', aggregateID: 'empty', seq: 0 }));
    const empty = run(source.id, ...args); assert.equal(empty.status, 1); assert.deepEqual(JSON.parse(empty.stdout).warnings, ['HISTORY_UNAVAILABLE']);
  } finally { await f.close(); }
});
