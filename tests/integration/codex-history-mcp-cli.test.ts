import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { registerSource } from '../../src/collectors/source-config.js';

test('Codex v4 CLI: MCP opt-in e retomada privada', async () => {
  const f = await fixture(); const root = randomUUID(); const at = Date.parse('2026-11-05T09:00:00.000Z');
  const source = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0' }; registerSource(f.ctx, source);
  const path = join(f.directory, 'mcp with spaces.jsonl'); const config = '{"token":"PRIVATE_CREDENTIAL"}'; await writeFile(source.configPath, config);
  const run = (...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', ...args, '--data-dir', f.ctx.config.dataDir], { encoding: 'utf8', timeout: 10000 });
  const row = (type: string, payload: object, ordinal: number) => ({ timestamp: '2026-11-05T12:00:00.000Z', type, payload, ordinal });
  try {
    const rows = [row('session_meta', { id: root, session_id: root, cli_version: source.version, cwd: f.root, history_mode: 'paginated', source: 'cli' }, 0), ...[0, 1].flatMap((i) => [
      row('response_item', { type: 'function_call', namespace: 'mcp__catalog', name: 'lookup', call_id: `call-${i}`, arguments: 'PRIVATE_ARGS' }, 1 + i * 2),
      row('event_msg', { type: 'item_completed', thread_id: root, turn_id: 'turn', started_at_ms: at + 100 + i * 1000, completed_at_ms: at + 500 + i * 1000, item: { type: 'McpToolCall', id: `call-${i}`, server: 'PRIVATE_SERVER', tool: 'PRIVATE_TOOL', status: 'completed', result: { content: ['PRIVATE_OUTPUT'] } } }, 2 + i * 2),
    ])];
    const content = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'; await writeFile(path, content);
    assert.equal(run('history', 'configure', '--source-id', source.id, '--parser', 'codex-rollout-v4-0.167.0', '--input', path).status, 0);
    const args = ['history', 'import', '--source-id', source.id, '--from', new Date(at + 100).toISOString(), '--to', new Date(at + 1100).toISOString()];
    const first = run(...args, '--limit', '1'); assert.equal(first.status, 1); assert.equal(JSON.parse(first.stdout).imported, 1); assert.deepEqual(JSON.parse(first.stdout).warnings, ['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']);
    const next = run(...args); assert.equal(next.status, 1); assert.equal(JSON.parse(next.stdout).imported, 1); assert.equal(JSON.parse(next.stdout).complete, false);
    const replay = run(...args); assert.equal(replay.status, 1); assert.equal(JSON.parse(replay.stdout).imported, 0);
    assert.deepEqual(f.allEvents().map((e) => [e.type, e.payload]), [['tool.start', { toolName: 'mcp__catalog__lookup', toolUseId: 'call-0' }], ['tool.end', { toolName: 'mcp__catalog__lookup', toolUseId: 'call-0', outcome: 'completed' }]]);
    assert.match(run('help').stdout, /codex-rollout-v4-0\.167\.0/);
    assert.equal((first.stdout + first.stderr + next.stdout + next.stderr).includes('PRIVATE_'), false);
    assert.equal(await readFile(source.configPath, 'utf8'), config); assert.equal(await readFile(path, 'utf8'), content);
  } finally { await f.close(); }
});
