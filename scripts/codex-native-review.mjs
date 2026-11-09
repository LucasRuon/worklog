import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { codexHooks } from '../dist/collectors/codex.js';

const home = homedir();
const hookPath = join(home, '.codex/hooks.json');
const dataDir = join(home, 'Library/Application Support/Worklog');
const roots = [join(home, 'Downloads/Sistemas/Worklog'), join(home, 'Developer/Posicionadas')];
const events = codexHooks.map(name => name[0].toLowerCase() + name.slice(1)).sort();
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function reviewedHooks(hooks, command) {
  const selected = hooks.filter(hook => hook.command?.includes('--worklog-codex-v1'));
  assert.equal(selected.length, 10, 'exactly ten Worklog hooks required');
  assert.deepEqual(selected.map(hook => hook.eventName).sort(), events);
  assert.equal(new Set(selected.map(hook => hook.key)).size, 10);
  for (const hook of selected) {
    assert.equal(hook.command, command);
    assert.equal(hook.handlerType, 'command');
    assert.equal(hook.sourcePath, hookPath);
    assert.equal(hook.source, 'user');
    assert.equal(hook.isManaged, false);
    assert.equal(hook.enabled, true);
    assert.equal(hook.timeoutSec, 2);
    assert.equal(hook.matcher, null);
    assert.equal(hook.async, false);
    assert.equal(hook.pluginId, null);
    assert.equal(hook.environmentId, null);
    assert.ok(typeof hook.key === 'string' && hook.key.length > 0);
    assert.ok(typeof hook.currentHash === 'string' && /^[a-zA-Z0-9_:-]{1,256}$/.test(hook.currentHash));
  }
  return selected;
}

if (process.argv.includes('--self-test')) {
  const command = '/local/node --worklog-codex-v1';
  const valid = events.map((eventName, index) => ({ eventName, key: `hook${index}`, command, handlerType: 'command', sourcePath: hookPath, source: 'user', isManaged: false, enabled: true, timeoutSec: 2, matcher: null, async: false, pluginId: null, environmentId: null, currentHash: 'nativehash' }));
  assert.equal(reviewedHooks(valid, command).length, 10);
  for (const patch of [{ command: `${command}; unexpected` }, { currentHash: '' }, { source: 'project' }, { enabled: false }, { timeoutSec: 600 }, { matcher: '*' }]) {
    assert.throws(() => reviewedHooks([{ ...valid[0], ...patch }, ...valid.slice(1)], command));
  }
  assert.throws(() => reviewedHooks([...valid, valid[0]], command));
  console.log('PASS exact-worklog-definitions (valid + 7 rejected variants)');
} else {
  await main().catch(error => {
    const allowed = ['CODEX_SPAWN_FAILED', 'CODEX_NATIVE_RPC_FAILED', 'CODEX_NATIVE_TIMEOUT'];
    console.error(JSON.stringify({ passed: false, code: allowed.includes(error.message) ? error.message : 'NATIVE_REVIEW_FAILED' }));
    process.exitCode = 1;
  });
}

async function main() {
  assert.equal(execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(), 'codex-cli 0.167.0');
  const beforeFile = readFileSync(hookPath);
  const db = new DatabaseSync(join(dataDir, 'worklog.sqlite'), { readOnly: true });
  let child;
  const pending = new Map();
  const completedTurns = new Map();
  let sequence = 0;
  try {
    const source = db.prepare('SELECT * FROM sources WHERE tool=? AND config_path=?').get('codex', hookPath);
    assert.ok(source);
    assert.equal(source.version, '0.167.0');
    assert.equal(source.enabled, 1);
    const command = [process.execPath, resolve('dist/cli/index.js'), 'hook', '--worklog-codex-v1', '--data-dir', dataDir, '--source-id', source.id].map(quote).join(' ');
    const projects = roots.map(path => {
      const root = db.prepare('SELECT r.project_id, r.enabled, p.name FROM project_roots r JOIN projects p ON p.id=r.project_id WHERE r.path=? AND r.device_id=?').get(path, source.device_id);
      assert.ok(root); assert.equal(root.enabled, 1);
      return root;
    });
    assert.deepEqual(projects.map(project => project.name), ['Worklog', 'Posicionadas']);
    child = spawn('codex', ['app-server', '--stdio'], { cwd: roots[0], stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.resume(); // Native environment logs are not persisted or displayed.
    child.on('error', () => { for (const { reject } of pending.values()) reject(new Error('CODEX_SPAWN_FAILED')); });
    const reader = createInterface({ input: child.stdout });
    reader.on('line', line => {
      let value; try { value = JSON.parse(line); } catch { return; }
      if (value.method === 'turn/completed' && value.params?.turn?.id) {
        completedTurns.set(value.params.turn.id, value.params.turn.status);
      }
      const waiting = pending.get(value.id);
      if (!waiting) return; // Never persist notifications with messages or hook output.
      pending.delete(value.id);
      if (value.error) waiting.reject(new Error('CODEX_NATIVE_RPC_FAILED'));
      else waiting.resolve(value.result);
    });
    async function request(method, params) {
      const id = ++sequence;
      const answer = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      const timeout = setTimeout(() => { pending.get(id)?.reject(new Error('CODEX_NATIVE_TIMEOUT')); pending.delete(id); }, 20000);
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      try { return await answer; } finally { clearTimeout(timeout); }
    }
    await request('initialize', { clientInfo: { name: 'worklog_local_review', title: 'Worklog local hook review', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    async function inventory() {
      const result = await request('hooks/list', { cwds: roots });
      assert.equal(result.data.length, 2);
      assert.ok(result.data.every(entry => entry.errors.length === 0));
      const entries = result.data;
      for (const entry of entries) reviewedHooks(entry.hooks, command);
      return entries;
    }
    const before = await inventory();
    const selected = reviewedHooks(before[0].hooks, command);
    if (!process.argv.includes('--approve')) {
      console.log(JSON.stringify({ reviewed: selected.length, nativeTrust: selected.map(hook => ({ event: hook.eventName, status: hook.trustStatus })), localOnly: true, changed: false }));
      return;
    }
    const fresh = await inventory();
    assert.deepEqual(fresh, before, 'native inventory changed before approval');
    assert.deepEqual(readFileSync(hookPath), beforeFile);
    await request('config/batchWrite', { edits: [{ keyPath: 'hooks.state', value: Object.fromEntries(selected.map(hook => [hook.key, { trusted_hash: hook.currentHash }])), mergeStrategy: 'upsert' }], reloadUserConfig: true });
    const after = await inventory();
    for (let index = 0; index < before.length; index++) {
      const ours = reviewedHooks(after[index].hooks, command);
      assert.ok(ours.every(hook => hook.trustStatus === 'trusted'));
      assert.deepEqual(ours.map(({ trustStatus, ...hook }) => hook), reviewedHooks(before[index].hooks, command).map(({ trustStatus, ...hook }) => hook));
      const unrelated = hooks => hooks.filter(hook => !hook.command?.includes('--worklog-codex-v1'));
      assert.deepEqual(unrelated(after[index].hooks), unrelated(before[index].hooks));
    }
    assert.deepEqual(readFileSync(hookPath), beforeFile);
    const live = process.argv.includes('--live-turns');
    const report = { at: new Date().toISOString(), trustProven: true, trustedHooks: 10, unrelatedUnchanged: true, hooksFileSha256: digest(beforeFile), nativeMethod: 'config/batchWrite (same as /hooks)', turnSubmissions: 0, localInstrumentationOnly: true, sessions: [] };
    const output = resolve('artifacts/codex-local-native');
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const save = () => writeFileSync(join(output, live ? 'verification-live.json' : 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    save(); // Preserve successful trust review even if the separate capture check fails.
    for (let index = 0; index < roots.length; index++) {
      const started = await request('thread/start', { cwd: roots[index], sandbox: 'read-only', approvalPolicy: 'on-request' });
      const id = started.thread.id;
      assert.ok(typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
      const row = { id, project: projects[index].name, captured: false };
      report.sessions.push(row); save();
      if (live) {
        report.turnSubmissions++; save();
        const turn = await request('turn/start', { threadId: id, input: [{ type: 'text', text: 'Responda apenas OK, sem ferramentas nem alterações.', text_elements: [] }] });
        row.turnId = turn.turn.id;
        assert.ok(typeof row.turnId === 'string');
        for (let attempt = 0; attempt < 120 && !completedTurns.has(row.turnId); attempt++) await delay(500);
        row.turnStatus = completedTurns.get(row.turnId) ?? 'timeout'; save();
        if (row.turnStatus === 'timeout') await request('turn/interrupt', { threadId: id, turnId: row.turnId });
        assert.equal(row.turnStatus, 'completed', 'native model turn must complete');
        await request('thread/name/set', { threadId: id, name: `Worklog: validação local ${row.project}` });
        await request('thread/archive', { threadId: id });
      }
      const expected = live ? ['session.start', 'turn.submit', 'turn.start', 'turn.end', 'session.end'] : ['session.start'];
      for (let attempt = 0; attempt < 40; attempt++) {
        row.types = db.prepare(`SELECT e.type,count(*) n FROM events e JOIN event_projects ep ON ep.event_id=e.event_id
          WHERE e.source_id=? AND json_extract(e.document,'$.nativeSessionId')=?
          AND json_extract(e.document,'$.cwd')=? AND ep.project_id=? GROUP BY e.type`).all(source.id, id, roots[index], projects[index].project_id);
        row.captured = expected.every(type => row.types.some(event => event.type === type && event.n > 0));
        if (row.captured) break;
        await delay(500);
      }
      save();
      assert.equal(row.captured, true, `native lifecycle missing for ${row.project}`);
      assert.ok(!row.types.some(event => event.type === 'tool.start' || event.type === 'tool.end'));
    }
    console.log(JSON.stringify({ ...report, passed: true }, null, 2));
  } finally {
    db.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      child.stdin.end(); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      timer.unref();
    }
  }
}
