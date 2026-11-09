import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { registerSource } from '../../src/collectors/source-config.js';

test('Codex v3 CLI: dynamic opt-in, período e retomada', async () => {
  const f = await fixture(); const root = randomUUID(); const at = Date.parse('2026-11-05T09:00:00.000Z');
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'dynamic with spaces.jsonl'); const config = '{"token":"PRIVATE_CREDENTIAL"}'; await writeFile(source.configPath, config);
  const run = (...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', ...args, '--data-dir', f.ctx.config.dataDir], { encoding: 'utf8', timeout: 10000 });
  try {
    const rows = [{ timestamp: '2026-11-05T12:00:00.000Z', ordinal: 0, type: 'session_meta', payload: { id: root, session_id: root, cli_version: source.version, cwd: f.root, history_mode: 'paginated', source: 'cli' } }, ...[0, 1].map((i) => ({ timestamp: '2026-11-05T12:00:00.000Z', ordinal: i + 1, type: 'event_msg', payload: { type: 'item_completed', thread_id: root, turn_id: 'turn', started_at_ms: at + 100 + i * 1000, completed_at_ms: at + 500 + i * 1000, item: { type: 'DynamicToolCall', id: `call-${i}`, tool: 'lookup', status: 'completed', success: true, arguments: { secret: 'PRIVATE_ARGS' }, content_items: [{ type: 'input_text', text: 'PRIVATE_OUTPUT' }] } } }))];
    const content = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'; await writeFile(path, content);
    assert.equal(run('history', 'configure', '--source-id', source.id, '--parser', 'codex-rollout-v3-0.167.0', '--input', path).status, 0);
    const args = ['history', 'import', '--source-id', source.id, '--from', new Date(at + 100).toISOString(), '--to', new Date(at + 1100).toISOString()];
    const first = run(...args, '--limit', '1'); assert.equal(first.status, 1); assert.equal(JSON.parse(first.stdout).imported, 1); assert.deepEqual(JSON.parse(first.stdout).warnings, ['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']);
    const next = run(...args); assert.equal(next.status, 1); assert.equal(JSON.parse(next.stdout).imported, 1); assert.equal(JSON.parse(next.stdout).complete, false);
    const replay = run(...args); assert.equal(replay.status, 1); assert.equal(JSON.parse(replay.stdout).imported, 0);
    assert.equal(f.allEvents().length, 2); assert.ok(f.allEvents().every((e) => (e.type === 'tool.start' || e.type === 'tool.end') && e.payload.toolUseId === 'call-0'));
    assert.match(run('help').stdout, /codex-rollout-v3-0\.167\.0/);
    assert.equal((first.stdout + first.stderr + next.stdout + next.stderr).includes('PRIVATE_'), false);
    assert.equal(await readFile(source.configPath, 'utf8'), config); assert.equal(await readFile(path, 'utf8'), content);
  } finally { await f.close(); }
});
