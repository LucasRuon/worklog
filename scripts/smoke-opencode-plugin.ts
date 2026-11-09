import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { openStore } from '../src/core/context.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { configureOpenCodePlugin } from '../src/cli/automation.js';
import { drainQueue } from '../src/collectors/claude.js';
import { shortId, type WorkEvent } from '../src/core/contracts.js';
import { sourceStatuses } from '../src/collectors/source-status.js';
import { projectSessions } from '../src/core/sessions.js';

let phase = 'version';
// Opt-in native smoke: only this temporary root, store, wrapper and sessions are changed.
const run = (...args: string[]) => execFileSync('opencode', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const api = (method: string, path: string, body?: unknown) => {
  const text = run('api', method, path, ...(body ? ['--data', JSON.stringify(body)] : []));
  return text.trim() ? JSON.parse(text) : null;
};

async function main() {
  const version = run('--version').match(/\d+\.\d+\.\d+/)?.[0]; assert.equal(version, '2.2.6');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'worklog-native-plugin-')));
  const root = join(directory, 'repo'); await mkdir(root);
  const ctx = await openStore(join(directory, 'data')); const sessions: string[] = [];
  let report: Record<string, unknown> | undefined;
  const pluginPath = join(root, '.opencode/plugins/worklog.js');
  try {
    phase = 'install-temporary-wrapper';
    const projectId = registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, projectName: 'Smoke nativo 2.2.6', path: root });
    const { sourceId } = await configureOpenCodePlugin(ctx, pluginPath, 'install', version);
    // A unique plugin ID avoids overriding the person's global Worklog instance.
    const wrapper = await readFile(pluginPath, 'utf8');
    await writeFile(pluginPath, wrapper.replace('export default createWorklogPlugin(', 'const plugin = createWorklogPlugin(') + '\nexport default { ...plugin, id: "worklog-native-smoke" };\n', { mode: 0o600 });
    for (let index = 0; index < 2; index++) {
      phase = `create-session-${index + 1}`;
      const created = api('POST', '/api/session', { title: 'Worklog isolated native smoke', location: { directory: root } });
      shortId(created.data.id); sessions.push(created.data.id);
      const route = `/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(root)}`;
      let active = false, observed = false;
      phase = `capture-session-${index + 1}`;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (attempt % 5 === 0) {
          const plugins = api('GET', route);
          active = plugins.data.some((plugin: { id: string; state: { status: string } }) => plugin.id === 'worklog-native-smoke' && plugin.state.status === 'active');
        }
        drainQueue(ctx);
        observed = Boolean(ctx.db.get('SELECT event_id FROM events WHERE source_id = ? AND json_extract(document, ?) = ?', sourceId, '$.nativeSessionId', created.data.id));
        if (active && observed) break;
        await setTimeout(250);
      }
      assert.equal(active, true, 'native plugin must be active'); assert.equal(observed, true, 'native session must reach the durable queue');
    }
    assert.equal(drainQueue(ctx).inserted, 0);
    phase = 'assert-origin-and-project';
    const events = ctx.db.all<{ document: string }>('SELECT document FROM events').map((row) => JSON.parse(row.document) as WorkEvent);
    assert.equal(new Set(events.map((event) => event.nativeSessionId)).size, 2);
    assert.ok(events.every((event) => event.sourceId === sourceId && event.deviceId === ctx.config.deviceId && event.installationId === ctx.config.installationId && event.cwd === root && event.type === 'session.start'));
    assert.ok(events.some((event) => event.nativeSessionId === sessions[1] && event.type === 'session.start' && event.payload.reason === 'startup'), 'second session must arrive from the native stream, not only bootstrap');
    projectSessions(ctx, events);
    assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) n FROM event_projects WHERE project_id = ?', projectId)!.n, events.length);
    assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    const status = sourceStatuses(ctx).find((source) => source.id === sourceId)!;
    assert.equal(status.version, '2.2.6'); assert.equal(status.state, 'observed'); assert.equal(status.observation?.transport, 'plugin-v2');
    report = { passed: true, at: new Date().toISOString(), version, nativePluginActive: true, nativeSessions: 2, events: events.length, queueReplayInserted: 0, originAndProjectVerified: true, humanEvents: 0, fileRevisions: 0, modelRequests: 0, scope: 'temporary-root-store-wrapper-and-owned-sessions', personalInstrumentationChanged: false };
  } finally {
    let cleanupFailures = 0;
    for (const session of sessions) { try { api('DELETE', `/api/session/${session}`); } catch { cleanupFailures++; } }
    try { await ctx.shutdown(); } finally { await rm(directory, { recursive: true, force: true }); }
    assert.equal(cleanupFailures, 0, 'owned native sessions must be removed');
  }
  const output = resolve('artifacts/opencode-226'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'verification.json'), `${JSON.stringify({ ...report, ownedSessionsRemoved: sessions.length }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...report, ownedSessionsRemoved: sessions.length }, null, 2));
}
void main().catch((error: unknown) => { console.error(JSON.stringify({ code: 'OPENCODE_NATIVE_SMOKE_FAILED', phase, ...(error instanceof assert.AssertionError ? { assertion: error.message } : {}) })); process.exitCode = 1; });
