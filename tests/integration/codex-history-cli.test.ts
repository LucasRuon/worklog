import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { drainQueue } from '../../src/collectors/claude.js';

test('Codex: processos concorrentes compartilham recibo offline', async () => {
  const f = await fixture(); const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  try {
    const input = { hook_event_name: 'UserPromptSubmit', session_id: 'parallel-session', turn_id: 'one', cwd: f.root, prompt: 'PRIVATE_PROMPT' };
    const results = await Promise.all(Array.from({ length: 4 }, () => new Promise<{ status: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['dist/cli/index.js', 'hook', '--worklog-codex-v1', '--source-id', source.id, '--data-dir', f.ctx.config.dataDir], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
      let out = '', err = ''; child.stdout.on('data', (v) => { out += v; }); child.stderr.on('data', (v) => { err += v; }); child.once('error', reject); child.once('close', (status) => resolve({ status, out, err })); child.stdin.end(JSON.stringify(input));
    })));
    assert.ok(results.every((r) => r.status === 0 && r.out === '{}\n' && r.err === ''));
    const queued = await readdir(join(f.ctx.config.dataDir, 'queue')); assert.equal(queued.length, 4);
    const documents = await Promise.all(queued.map(async (name) => JSON.parse(await readFile(join(f.ctx.config.dataDir, 'queue', name), 'utf8')).events as { eventId: string; occurredAt: string }[]));
    for (const id of new Set(documents.flat().map((e) => e.eventId))) assert.equal(new Set(documents.flat().filter((e) => e.eventId === id).map((e) => e.occurredAt)).size, 1);
    const drained = drainQueue(f.ctx); assert.equal(drained.inserted, 2); assert.equal(drained.duplicates, 6); assert.equal(drained.rejected, 0);
    assert.equal((await readdir(join(f.ctx.config.dataDir, 'queue'))).some((name) => name.endsWith('.rejected')), false);
  } finally { await f.close(); }
});

test('Codex rollout CLI: configuração, importação, replay e diagnóstico privado', async () => {
  const f = await fixture(); const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'native.jsonl');
  const cli = (...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', ...args, '--data-dir', f.ctx.config.dataDir], { encoding: 'utf8', timeout: 10000 });
  try {
    const id = randomUUID(); const at = Date.parse('2026-11-05T09:00:00.000Z') / 1000;
    const line = (type: string, payload: object) => JSON.stringify({ timestamp: '2026-11-05T12:00:00.000Z', type, payload });
    const bytes = [line('session_meta', { id, session_id: id, cwd: f.root, cli_version: '0.167.0', timestamp: '2026-11-05T08:00:00.000Z' }), line('event_msg', { type: 'task_started', turn_id: 'one', started_at: at, prompt: 'PRIVATE_PROMPT' }), line('event_msg', { type: 'task_complete', turn_id: 'one', completed_at: at + 60, last_agent_message: 'PRIVATE_RESPONSE' })].join('\n') + '\n';
    await writeFile(path, bytes);
    assert.equal(cli('history', 'configure', '--source-id', source.id, '--parser', 'codex-rollout-0.167.0', '--input', path).status, 0);
    const args = ['history', 'import', '--source-id', source.id, '--from', '2026-11-05T00:00:00.000Z', '--to', '2026-11-06T00:00:00.000Z'];
    const limited = cli(...args, '--limit', '1'); const partial = JSON.parse(limited.stdout);
    assert.equal(limited.status, 1); assert.equal(partial.imported, 1); assert.equal(partial.complete, false);
    assert.deepEqual(partial.warnings, ['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']);
    const resumed = cli(...args); assert.equal(resumed.status, 1); assert.equal(JSON.parse(resumed.stdout).imported, 1);
    // Recreate only this test's Worklog events in another source to also prove an unbounded first import.
    const second = { ...source, id: randomUUID(), configPath: `${source.configPath}.second` }; registerSource(f.ctx, second);
    assert.equal(cli('history', 'configure', '--source-id', second.id, '--parser', 'codex-rollout-0.167.0', '--input', path).status, 0);
    const fullArgs = ['history', 'import', '--source-id', second.id, '--from', '2026-11-05T00:00:00.000Z', '--to', '2026-11-06T00:00:00.000Z'];
    const imported = cli(...fullArgs); const result = JSON.parse(imported.stdout);
    assert.equal(imported.status, 1); assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);
    assert.equal(JSON.parse(cli(...args).stdout).imported, 0);
    assert.match(cli('help').stdout, /codex-rollout-0\.167\.0/);
    await writeFile(path, bytes + line('PRIVATE_FUTURE', { token: 'PRIVATE_CREDENTIAL' }) + '\n');
    const invalid = cli(...args); assert.equal(invalid.status, 1); assert.ok(JSON.parse(invalid.stdout).warnings.includes('HISTORY_FORMAT_UNSUPPORTED'));
    assert.equal((invalid.stdout + invalid.stderr).includes('PRIVATE_'), false);
    assert.equal(await readFile(path, 'utf8'), bytes + line('PRIVATE_FUTURE', { token: 'PRIVATE_CREDENTIAL' }) + '\n');
  } finally { await f.close(); }
});
