import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Read-only acceptance probe for the two explicitly authorized personal pilot roots.
const dataDir = join(homedir(), 'Library/Application Support/Worklog');
const db = new DatabaseSync(join(dataDir, 'worklog.sqlite'), { readOnly: true });
try {
  const roots = [
    [join(homedir(), 'Downloads/Sistemas/Worklog'), 'Worklog'],
    [join(homedir(), 'Developer/Posicionadas'), 'Posicionadas'],
  ].map(([path, name]) => {
    const row = db.prepare('SELECT r.project_id, r.enabled, p.name FROM project_roots r JOIN projects p ON p.id=r.project_id WHERE r.path=?').get(path);
    assert.ok(row, `Missing pilot root: ${name}`);
    assert.equal(row.enabled, 1);
    assert.equal(row.name, name);
    return row;
  });
  assert.notEqual(roots[0].project_id, roots[1].project_id);
  const sourceId = '4c30691f-a389-5098-86a7-12636c8e4e33';
  const source = db.prepare('SELECT version, enabled FROM sources WHERE id=?').get(sourceId);
  const version = execFileSync('opencode', ['--version'], { encoding: 'utf8', timeout: 10000 }).match(/\d+\.\d+\.\d+/)?.[0];
  assert.ok(['2.2.5', '2.2.6'].includes(version));
  assert.ok(source);
  assert.equal(source.version, version);
  assert.equal(source.enabled, 1);
  const wrapper = readFileSync(join(homedir(), '.config/opencode/plugins/worklog.js'), 'utf8');
  assert.ok(wrapper.startsWith('// worklog-managed-opencode-v2'));
  assert.ok(wrapper.includes(`"sourceId":${JSON.stringify(sourceId)}`));
  assert.ok(wrapper.includes(`"dataDir":${JSON.stringify(dataDir)}`));
  console.log(JSON.stringify({ checks: { C1: 'PASS', C2: 'PASS' }, projects: roots.map(r => ({ id: r.project_id, name: r.name })), sourceId, version, captureProven: false }));
} finally { db.close(); }
