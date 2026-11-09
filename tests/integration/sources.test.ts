import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { registerSource, listSources } from '../../src/collectors/source-config.js';
import { queueClaude } from '../../src/collectors/claude.js';
import { configureClaudeHooks } from '../../src/cli/hooks.js';
import { importBatch, registerInstallation } from '../../src/core/events.js';
import { controlSource } from '../../src/collectors/source-config.js';
import { normalizeEvent } from '../../src/core/policy.js';
import { configureOpenCodePlugin } from '../../src/cli/automation.js';

async function setup() {
  const f = await fixture(); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  const call = (path: string, method = 'GET', body?: unknown) => fetch(`${app.config.origin}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const query = new URLSearchParams({ ...f.filter, projectIds: f.projectId } as Record<string, string>);
  return { ...f, app, call, query, closeAll: async () => { await closeApp(app); await f.close(); } };
}

test('fontes: cadastro, isolamento de contas e filtros consistentes', async () => {
  const f = await setup();
  try {
    const ids: string[] = [];
    for (const profile of ['conta-a', 'conta-b']) {
      const response = await f.call('/api/sources', 'POST', { tool: 'claude', profile, configPath: join(f.directory, profile, 'settings.json'), version: '2.1.318' });
      assert.equal(response.status, 201); const { id } = await response.json(); ids.push(id);
      assert.equal((await (await f.call('/api/sources', 'POST', { tool: 'claude', profile, configPath: join(f.directory, profile, 'settings.json'), version: '2.1.318' })).json()).id, id);
      for (const [index, [hook_event_name, timestamp]] of [['SessionStart', '09:00'], ['UserPromptSubmit', '09:01'], ['Stop', '09:02']].entries()) {
        queueClaude(f.ctx.config.dataDir, id, { cwd: f.root, session_id: 'same-native', event_id: `${profile}-${index}`, hook_event_name, timestamp: `2026-11-05T${timestamp}:00.000Z`, source: 'startup', prompt_id: 'turn' });
      }
    }
    const all = await (await f.call(`/api/sessions?${f.query}`)).json(); assert.equal(all.items.length, 2);
    assert.notEqual(all.items[0].id, all.items[1].id);
    const filtered = `${f.query}&sourceIds=${ids[0]}`;
    const sessions = await (await f.call(`/api/sessions?${filtered}`)).json();
    assert.equal(sessions.items.length, 1); assert.equal(sessions.items[0].sourceId, ids[0]);
    const activity = await (await f.call(`/api/activity?${filtered}`)).json(); assert.equal(activity.items.length, 4);
    assert.ok(activity.items.every((item: { sourceId: string }) => item.sourceId === ids[0]));
    const summary = await (await f.call(`/api/summary?${filtered}`)).json();
    assert.equal(summary.sessionCount, 1); assert.equal(summary.summary.agentAccumulatedMs, 60_000); assert.equal(summary.activityCount, 4);
    assert.equal((await f.call(`/api/sessions?${f.query}&sourceIds=invalid`)).status, 400);
    const unauth = await fetch(`${f.app.config.origin}/api/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(unauth.status, 401);
  } finally { await f.closeAll(); }
});

test('fontes: diagnóstico sem credenciais ou falsa conexão', async () => {
  const f = await setup();
  try {
    const configPath = join(f.directory, 'settings.json'); await writeFile(configPath, '{"token":"PRIVATE_CREDENTIAL"}');
    registerSource(f.ctx, { ...f.source, configPath: f.source.configPath });
    const { id } = await (await f.call('/api/sources', 'POST', { tool: 'codex', profile: 'unknown', configPath, version: '99.0.0' })).json();
    let response = await (await f.call('/api/sources')).json();
    const unsupported = response.items.find((item: { id: string }) => item.id === id);
    assert.equal(unsupported.compatibility, 'unsupported'); assert.equal(unsupported.state, 'unsupported');
    assert.equal(unsupported.availability, 'present'); assert.equal(unsupported.lastActivity, null);
    assert.equal(JSON.stringify(response).includes('configPath'), false); assert.equal(JSON.stringify(response).includes(configPath), false); assert.equal(JSON.stringify(response).includes('PRIVATE_CREDENTIAL'), false);
    await unlink(configPath); response = await (await f.call('/api/sources')).json();
    assert.equal(response.items.find((item: { id: string }) => item.id === id).availability, 'missing');
    assert.equal(response.items.find((item: { id: string }) => item.id === f.source.id).state, 'no-data');
  } finally { await f.closeAll(); }
});

test('fontes: pausa persistente, retomada e concorrência', async () => {
  const f = await setup();
  try {
    f.emit('session.start', '2026-11-05T09:00Z', { reason: 'startup' });
    const before = await (await f.call('/api/sources')).json();
    assert.equal(before.items.find((s: { id: string }) => s.id === f.source.id).lastActivity, '2026-11-05T09:00:00.000Z');
    assert.equal((await f.call(`/api/sources/${f.source.id}`, 'PATCH', { enabled: false, revision: 0 })).status, 200);
    registerSource(f.ctx, f.source); // A fresh source manifest must not undo the central pause.
    assert.equal(listSources(f.ctx).find((s) => s.id === f.source.id)?.enabled, false);
    assert.equal(queueClaude(f.ctx.config.dataDir, f.source.id, { cwd: f.root, session_id: 'paused', hook_event_name: 'SessionStart' }), 0);
    assert.equal((await f.call(`/api/sources/${f.source.id}`, 'PATCH', { enabled: true, revision: 0 })).status, 409);
    assert.equal((await f.call(`/api/sources/${f.source.id}`, 'PATCH', { enabled: true, revision: 1 })).status, 200);
    const manifest = JSON.parse(await readFile(join(f.ctx.config.dataDir, 'capture.json'), 'utf8'));
    assert.equal(manifest.sources.find((s: { id: string }) => s.id === f.source.id).enabled, true);
    assert.equal((await (await f.call(`/api/sessions?${f.query}`)).json()).items.length, 1);
  } finally { await f.closeAll(); }
});

test('fontes: remoção seletiva preserva histórico', async () => {
  const f = await setup();
  try {
    await mkdir(join(f.directory, 'profile')); const configPath = join(f.directory, 'profile', 'settings.json');
    await writeFile(configPath, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-other-hook' }] }] } }));
    await configureClaudeHooks(configPath, 'install', { ctx: f.ctx });
    const source = listSources(f.ctx).find((s) => s.configPath === configPath)!;
    queueClaude(f.ctx.config.dataDir, source.id, { cwd: f.root, session_id: 'preserved', hook_event_name: 'SessionStart', source: 'startup' });
    await f.call('/api/sources');
    const count = f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n;
    const response = await f.call(`/api/sources/${source.id}/remove`, 'POST', { revision: 0 }); assert.equal(response.status, 200);
    assert.equal(JSON.stringify(JSON.parse(await readFile(configPath, 'utf8'))), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-other-hook' }] }] } }));
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, count);
    const sources = await (await f.call('/api/sources')).json(); const removed = sources.items.find((s: { id: string }) => s.id === source.id);
    assert.equal(removed.state, 'removed'); assert.equal(removed.enabled, false);
    assert.equal((await f.call(`/api/sources/${source.id}`, 'PATCH', { enabled: true, revision: removed.revision })).status, 409);
    // A source belonging to another collector cannot mutate local instrumentation.
    const foreign = randomUUID(); const device = randomUUID();
    f.ctx.db.run('INSERT INTO devices VALUES (?, ?, ?, ?)', device, 'remote', 'linux', 'UTC');
    f.ctx.db.run('INSERT INTO installations(id, device_id) VALUES (?, ?)', foreign, device);
    const remoteSource = { ...source, id: randomUUID(), deviceId: device, installationId: foreign };
    registerSource(f.ctx, remoteSource);
    assert.equal((await f.call(`/api/sources/${remoteSource.id}/remove`, 'POST', { revision: 0 })).status, 409);
  } finally { await f.closeAll(); }
});

test('fontes: pausa central preserva backlog e cursor remoto', async () => {
  const f = await setup();
  try {
    const source = { ...f.source, id: randomUUID(), deviceId: randomUUID(), installationId: randomUUID() };
    registerInstallation(f.ctx, { deviceId: source.deviceId, installationId: source.installationId, name: 'remote', os: 'linux', timezone: 'UTC' }); registerSource(f.ctx, source);
    const event = { ...normalizeEvent(source, { originId: 'remote-pause', type: 'session.start', occurredAt: '2026-11-05T09:00:00.000Z', nativeSessionId: 'remote-session', cwd: '/remote/repo', payload: { reason: 'startup' } })[0]!, originSeq: 1, receivedAt: '2026-11-05T09:00:00.000Z' };
    const batch = { schemaVersion: 1 as const, installationId: source.installationId, events: [event], nextCursor: { installationId: source.installationId, seq: 1 }, hasMore: false };
    controlSource(f.ctx, source.id, false, 0);
    assert.throws(() => importBatch(f.ctx, batch), { code: 'SOURCE_PAUSED' }); assert.equal(f.ctx.db.get('SELECT * FROM sync_cursors WHERE installation_id = ?', source.installationId), undefined);
    controlSource(f.ctx, source.id, true, 1); assert.equal(importBatch(f.ctx, batch).inserted, 1);
  } finally { await f.closeAll(); }
});

test('fontes: plugin 2.2.6 tem diagnóstico e remoção seletiva pela API', async () => {
  const f = await setup(); const path = join(f.directory, 'plugins/worklog.js');
  try {
    const { sourceId } = await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.6');
    const other = join(f.directory, 'plugins/other.js'); await writeFile(other, 'keep');
    const response = await f.call('/api/sources'); assert.equal(response.status, 200);
    const status = (await response.json()).items.find((s: { id: string }) => s.id === sourceId);
    assert.equal(status.compatibility, 'supported'); assert.equal(status.observation.transport, 'plugin-v2');
    assert.equal(status.state, 'no-data'); assert.equal(status.lastActivity, null);
    f.emit('session.start', '2026-11-05T09:00Z', { reason: 'startup' }, { sourceId, tool: 'opencode' });
    assert.equal((await f.call(`/api/sources/${sourceId}/remove`, 'POST', { revision: status.revision })).status, 200);
    await assert.rejects(readFile(path), { code: 'ENOENT' }); assert.equal(await readFile(other, 'utf8'), 'keep');
    const removed = (await (await f.call('/api/sources')).json()).items.find((s: { id: string }) => s.id === sourceId);
    assert.equal(removed.version, '2.2.6'); assert.equal(removed.state, 'removed');
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events WHERE source_id = ?', sourceId)!.n, 1);
  } finally { await f.closeAll(); }
});
