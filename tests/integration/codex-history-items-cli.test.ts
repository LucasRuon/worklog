import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { registerSource } from '../../src/collectors/source-config.js';

test('Codex v2 CLI: opt-in explícito, período, retomada e v1 preservado', async () => {
  const f = await fixture(); const root = randomUUID(), child = randomUUID(); const at = Date.parse('2026-11-05T09:00:00.000Z');
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'child.jsonl'); const config = '{"token":"PRIVATE_CREDENTIAL"}'; await writeFile(source.configPath, config, { mode: 0o600 });
  const run = (...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', ...args, '--data-dir', f.ctx.config.dataDir], { encoding: 'utf8', timeout: 10000 });
  try {
    const rows = [{ timestamp: '2026-11-05T09:00:00.000Z', ordinal: 0, type: 'session_meta', payload: { id: child, session_id: root, parent_thread_id: root, cli_version: '0.167.0', cwd: f.root, history_mode: 'paginated', subagent_history_start_ordinal: 1, source: { subagent: { thread_spawn: { parent_thread_id: root, depth: 1 } } } } }, { timestamp: '2026-11-05T12:00:00.000Z', ordinal: 1, type: 'event_msg', payload: { type: 'item_completed', thread_id: child, turn_id: 'one', started_at_ms: at + 100, completed_at_ms: at + 500, item: { type: 'CommandExecution', id: 'call-one', source: 'unified_exec_startup', status: 'completed', command: ['PRIVATE_COMMAND'], aggregated_output: 'PRIVATE_OUTPUT' } } }];
    const content = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'; await writeFile(path, content);
    const configure = (parser: string) => run('history', 'configure', '--source-id', source.id, '--parser', parser, '--input', path);
    const args = ['history', 'import', '--source-id', source.id, '--from', new Date(at + 100).toISOString(), '--to', new Date(at + 500).toISOString()];
    assert.equal(configure('codex-rollout-0.167.0').status, 0); const old = run(...args);
    assert.equal(JSON.parse(old.stdout).imported, 0); assert.ok(JSON.parse(old.stdout).warnings.includes('HISTORY_LINEAGE_UNSUPPORTED'));
    assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);
    assert.equal(configure('codex-rollout-v2-0.167.0').status, 0);
    const first = run(...args, '--limit', '1'); assert.equal(first.status, 1); assert.equal(JSON.parse(first.stdout).imported, 1); assert.deepEqual(JSON.parse(first.stdout).warnings, ['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']);
    const replay = run(...args); assert.equal(replay.status, 1); assert.equal(JSON.parse(replay.stdout).imported, 0);
    const wider = run('history', 'import', '--source-id', source.id, '--from', new Date(at + 100).toISOString(), '--to', new Date(at + 501).toISOString()); assert.equal(JSON.parse(wider.stdout).imported, 1);
    assert.match(run('help').stdout, /codex-rollout-v2-0\.167\.0/);
    assert.equal((first.stdout + first.stderr + wider.stdout + wider.stderr).includes('PRIVATE_'), false);
    assert.equal(await readFile(source.configPath, 'utf8'), config); assert.equal(await readFile(path, 'utf8'), content);
    const docs = f.allEvents(); assert.equal(docs.length, 2); assert.ok(docs.every((e) => e.nativeSessionId === root && e.nativeAgentId === child));
  } finally { await f.close(); }
});
