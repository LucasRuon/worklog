import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { openDatabase } from '../../src/core/sqlite.js';
import { connectOpenCode } from '../../src/collectors/opencode.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { synchronize } from '../../src/server/routes.js';

test('API OpenCode: observa metadados, sinaliza versão incompatível e recupera preservando histórico', async () => {
  const f = await fixture();
  const path = join(f.directory, 'native-source.db');
  const native = openDatabase(path); const now = Date.now() - 60_000;
  native.exec(`CREATE TABLE session(id TEXT PRIMARY KEY, directory TEXT, parent_id TEXT, version TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE message(id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    CREATE TABLE part(id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);`);
  native.run('INSERT INTO session VALUES (?, ?, NULL, ?, ?, ?)', 'ses_api', f.root, '1.19.5', now - 1000, now);
  native.run('INSERT INTO message VALUES (?, ?, ?, ?, ?)', 'msg_api', 'ses_api', now, now, JSON.stringify({ role: 'user', time: { created: now }, text: 'NATIVE_CONTENT_MUST_NOT_BE_EXPOSED' }));
  native.close();
  connectOpenCode(f.ctx, { databasePath: path, rootPath: f.root, sessionId: 'ses_api' });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  const get = (route: string) => fetch(`${app.config.origin}${route}`, { headers: { Authorization: `Bearer ${token}` } });
  try {
    const before = await (await get('/api/sources')).json();
    const source = before.items.find((item: { tool: string }) => item.tool === 'opencode');
    assert.equal(source.state, 'observed');
    assert.equal(source.observation.transport, 'native-db-readonly');
    assert.equal(JSON.stringify(before).includes(path), false);
    assert.equal(JSON.stringify(before).includes('NATIVE_CONTENT'), false);
    const count = app.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n;
    const update = openDatabase(path);
    update.run('UPDATE session SET version = ?', '2.0.0'); update.close();
    synchronize(app, { forceObservers: true });
    const invalid = await (await get('/api/sources')).json();
    assert.equal(invalid.items.find((item: { tool: string }) => item.tool === 'opencode').state, 'error');
    assert.equal(invalid.collectorStatus, 'observer-error');
    assert.equal(app.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, count);
    const restore = openDatabase(path);
    restore.run('UPDATE session SET version = ?', '1.19.5'); restore.close();
    synchronize(app, { forceObservers: true });
    const recovered = await (await get('/api/sources')).json();
    assert.equal(recovered.items.find((item: { tool: string }) => item.tool === 'opencode').state, 'observed');
    assert.equal(recovered.collectorStatus, 'ok');
    assert.equal(app.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, count);
  } finally { await closeApp(app); await f.close(); }
});
