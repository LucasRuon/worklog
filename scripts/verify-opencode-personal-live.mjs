import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), 'Downloads/Sistemas/Worklog');
const sourceId = '4c30691f-a389-5098-86a7-12636c8e4e33';
const since = '2026-11-09T00:45:00.000Z';
const response = JSON.parse(execFileSync('opencode', ['api', 'GET', `/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(root)}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 }));
const plugin = response.data.find(item => item.id === 'worklog');
assert.ok(plugin);
assert.equal(plugin.state.status, 'active');
const db = new DatabaseSync(join(homedir(), 'Library/Application Support/Worklog/worklog.sqlite'), { readOnly: true });
try {
  const source = db.prepare('SELECT version, enabled FROM sources WHERE id=?').get(sourceId);
  assert.ok(source);
  assert.equal(source.version, '2.2.6');
  assert.equal(source.enabled, 1);
  const rows = db.prepare(`SELECT e.type, count(DISTINCT e.event_id) n, max(e.received_at) lastReceived
    FROM events e JOIN event_projects ep ON ep.event_id=e.event_id
    JOIN projects p ON p.id=ep.project_id JOIN project_roots r ON r.project_id=p.id AND r.device_id=e.device_id
    WHERE e.source_id=? AND e.received_at>=? AND p.name='Worklog' AND r.path=? AND json_extract(e.document, '$.cwd')=?
    GROUP BY e.type`).all(sourceId, since, root, root);
  for (const type of ['session.start', 'turn.start', 'turn.end', 'tool.start', 'tool.end', 'turn.submit']) {
    assert.ok(rows.some(row => row.type === type && row.n > 0), `Missing real event: ${type}`);
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), checks: { C1: 'PASS', C2: 'PASS' }, plugin: 'active', version: source.version, sourceId, since, events: rows, scope: 'personal-worklog-only-readonly' }, null, 2));
} finally { db.close(); }
