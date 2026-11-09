import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { createWorklogPlugin } from '../../src/collectors/plugins/worklog-opencode.js';
import { registerSource, listSources } from '../../src/collectors/source-config.js';
import { randomUUID } from 'node:crypto';
import { configureOpenCodePlugin } from '../../src/cli/automation.js';
import { setWorkspaces, discoverProject } from '../../src/core/automation.js';
import { captureSource, enqueueEvents } from '../../src/collectors/queue.js';
import { drainQueue } from '../../src/collectors/claude.js';
import { normalizeEvent } from '../../src/core/policy.js';
import { projectV2Event } from '../../src/collectors/plugins/opencode-projector.js';

test('automação: autoriza workspace, enfileira sem cadastrar e descobre só o repositório correto', async () => {
  const f = await fixture();
  const workspace = join(f.directory, 'workspace'); await mkdir(workspace);
  const root = join(workspace, 'projeto á'); await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  const nested = join(root, 'packages'); await mkdir(nested);
  try {
    setWorkspaces(f.ctx, [workspace]);
    const source = captureSource(f.ctx.config.dataDir, f.source.id)!;
    const events = normalizeEvent(source, { originId: 'auto-one', occurredAt: new Date().toISOString(), type: 'session.start', nativeSessionId: 'auto-session', cwd: nested, payload: { reason: 'startup' } });
    assert.equal(enqueueEvents(f.ctx.config.dataDir, events), 1);
    await rm(root, { recursive: true });
    assert.equal(drainQueue(f.ctx).inserted, 1);
    const match = f.ctx.db.get<{ project_id: string }>('SELECT project_id FROM project_roots WHERE path LIKE ?', '%/projeto á')?.project_id;
    assert.ok(match);
    assert.equal(f.ctx.db.get<{ path: string }>('SELECT path FROM project_roots WHERE project_id = ?', match)!.path.endsWith('/projeto á'), true);
    assert.equal(discoverProject(f.ctx, f.directory), null);
    assert.throws(() => setWorkspaces(f.ctx, [f.directory]), /WORKSPACE_DATA_OVERLAP/);
    assert.equal((await readFile(join(f.ctx.config.dataDir, 'capture.json'), 'utf8')).includes('workspaces'), true);
  } finally { await f.close(); }
});

test('plugin v2 captura pelo entrypoint compilado e não persiste eventos fora das raízes autorizadas', { timeout: 20_000 }, async (t) => {
  for (const version of ['2.2.5', '2.2.6']) await t.test(version, async () => {
  const f = await fixture();
  const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version, configPath: `${f.source.configPath}.v2` }; registerSource(f.ctx, source);
  const stored = new Map<string, unknown>();
  const storage = {
    async get(key: string) { return stored.get(key); }, async set(key: string, value: unknown) { stored.set(key, value); }, async remove(key: string) { stored.delete(key); },
    async scan(options: { prefix: string; limit: number }) { return { entries: [...stored.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit).map(([key, value]) => ({ key, value })) }; },
  };
  const now = Date.now();
  const events = [
    { id: 'evt_outside', created: now, type: 'session.created', data: { sessionID: 'ses_external', location: { directory: f.directory }, title: 'SECRET' } },
    { id: 'evt_created', created: now, type: 'session.created', data: { sessionID: 'ses_plugin', location: { directory: f.root }, title: 'SECRET' } },
    { id: 'evt_name', created: now + 1, type: 'session.tool.input.started', data: { sessionID: 'ses_plugin', assistantMessageID: 'msg_one', id: 'call_one', name: 'bash' } },
    { id: 'evt_called', created: now + 2, type: 'session.tool.called', data: { sessionID: 'ses_plugin', assistantMessageID: 'msg_one', id: 'call_one', input: { command: 'TOKEN=SECRET' } } },
    { id: 'evt_done', created: now + 3, type: 'session.tool.success', data: { sessionID: 'ses_plugin', assistantMessageID: 'msg_one', id: 'call_one', content: [{ text: 'SECRET' }] } },
  ];
  const plugin = createWorklogPlugin({ nodePath: process.execPath, cliPath: join(process.cwd(), 'dist/cli/index.js'), dataDir: f.ctx.config.dataDir, sourceId: source.id });
  let sent = false;
  const cleanup = await plugin.setup({ app: { version }, location: { directory: f.root }, storage, session: { async get() { return { location: { directory: f.root } }; } }, event: { async *subscribe(options) {
    for (const event of [...events, ...events]) yield event;
    sent = true;
    if (!options.signal.aborted) await new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve(), { once: true }));
  } } });
  try {
    for (let attempt = 0; !sent && attempt < 60; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sent, true);
    assert.equal(JSON.stringify([...stored]).includes('SECRET'), false);
    assert.equal(JSON.stringify([...stored]).includes('ses_external'), false);
    const result = drainQueue(f.ctx); assert.equal(result.inserted, 3);
    assert.equal(drainQueue(f.ctx).inserted, 0);
    assert.deepEqual(f.allEvents().map((event) => event.type), ['session.start', 'tool.start', 'tool.end']);
    assert.equal(JSON.stringify(f.allEvents()).includes('SECRET'), false);
  } finally { cleanup?.(); await f.close(); }
  });
});

test('plugin recusa runtime desconhecido e fonte de outra versão antes de assinar eventos', async () => {
  const f = await fixture();
  const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version: '2.2.5' }; registerSource(f.ctx, source);
  try {
    for (const [version, expected] of [['2.2.7', 'unsupported-version'], ['2.2.6', 'source-version-mismatch']]) {
      const stored = new Map<string, unknown>(); let subscribed = false;
      const cleanup = await createWorklogPlugin({ nodePath: process.execPath, cliPath: join(process.cwd(), 'dist/cli/index.js'), dataDir: f.ctx.config.dataDir, sourceId: source.id }).setup({
        app: { version: version! }, location: { directory: f.root },
        storage: { async get(key) { return stored.get(key); }, async set(key, value) { stored.set(key, value); }, async remove(key) { stored.delete(key); }, async scan() { return { entries: [] }; } },
        session: { async get() { throw new Error('must not read session'); } },
        event: { async *subscribe() { subscribed = true; } },
      });
      cleanup?.(); assert.equal(subscribed, false); assert.equal(stored.get('worklog.health'), expected);
      assert.equal(drainQueue(f.ctx).inserted, 0);
    }
  } finally { await f.close(); }
});

test('projeção OpenCode v2 descarta conteúdo antes do IPC e não confunde idle com fim de sessão', () => {
  const event = { id: 'evt_one', type: 'session.tool.success', created: 1793970000000, location: { directory: '/repo' }, data: { sessionID: 'ses_one', assistantMessageID: 'msg_one', id: 'call_one', content: [{ text: 'SECRET' }], input: { command: 'TOKEN=SECRET' } } };
  const projected = projectV2Event(event, { cwd: '/repo', toolName: 'bash' });
  assert.ok(projected);
  assert.equal(JSON.stringify(projected).includes('SECRET'), false);
  assert.equal(projected.type, 'tool.end');
  assert.equal(projectV2Event({ ...event, type: 'session.idle' }, { cwd: '/repo' }), null);
  assert.equal(projectV2Event({ ...event, type: 'session.text.delta' }, { cwd: '/repo' }), null);
});

test('instalador do plugin é idempotente e remoção preserva plugins alheios', async () => {
  const f = await fixture(); const path = join(f.directory, 'plugins/worklog.js');
  try {
    await mkdir(join(f.directory, 'plugins'));
    const other = join(f.directory, 'plugins/existing.js'); await writeFile(other, 'user plugin');
    await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.5'); const installed = await readFile(path, 'utf8');
    await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.5'); assert.equal(await readFile(path, 'utf8'), installed);
    await configureOpenCodePlugin(f.ctx, path, 'remove'); await assert.rejects(readFile(path), { code: 'ENOENT' });
    assert.equal(await readFile(other, 'utf8'), 'user plugin');
    await writeFile(path, 'foreign plugin');
    await assert.rejects(configureOpenCodePlugin(f.ctx, path, 'remove'), /PLUGIN_FILE_NOT_OWNED/);
    assert.equal(await readFile(path, 'utf8'), 'foreign plugin');
  } finally { await f.close(); }
});

test('instalador preserva identidade e versão ao atualizar e remover o plugin', async () => {
  const f = await fixture(); const path = join(f.directory, 'plugins/worklog.js');
  try {
    await mkdir(join(f.directory, 'plugins')); const other = join(f.directory, 'plugins/other.js'); await writeFile(other, 'keep');
    const first = await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.5');
    f.emit('session.start', '2026-11-05T09:00Z', { reason: 'startup' }, { sourceId: first.sourceId, tool: 'opencode' });
    const updated = await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.6');
    assert.equal(updated.sourceId, first.sourceId); assert.equal(listSources(f.ctx).find((s) => s.id === first.sourceId)!.version, '2.2.6');
    const wrapper = await readFile(path, 'utf8');
    await configureOpenCodePlugin(f.ctx, path, 'install', '2.2.6'); assert.equal(await readFile(path, 'utf8'), wrapper);
    await configureOpenCodePlugin(f.ctx, path, 'remove'); await assert.rejects(readFile(path), { code: 'ENOENT' });
    const removed = listSources(f.ctx).find((s) => s.id === first.sourceId)!;
    assert.equal(removed.version, '2.2.6'); assert.equal(removed.enabled, false); assert.equal(f.allEvents().length, 1);
    assert.equal(await readFile(other, 'utf8'), 'keep');
    const unsupported = join(f.directory, 'unknown/worklog.js');
    await assert.rejects(configureOpenCodePlugin(f.ctx, unsupported, 'install', '2.2.7'), /OPENCODE_VERSION_UNSUPPORTED/);
    await assert.rejects(readFile(unsupported), { code: 'ENOENT' });
    assert.equal(listSources(f.ctx).some((s) => s.configPath === unsupported), false);
  } finally { await f.close(); }
});

test('plugin reconhece sessão recente criada antes da ativação sem importar seu conteúdo', { timeout: 10_000 }, async () => {
  const f = await fixture();
  const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version: '2.2.5', configPath: `${f.source.configPath}.bootstrap` }; registerSource(f.ctx, source);
  const stored = new Map<string, unknown>();
  const cleanup = await createWorklogPlugin({ nodePath: process.execPath, cliPath: join(process.cwd(), 'dist/cli/index.js'), dataDir: f.ctx.config.dataDir, sourceId: source.id }).setup({
    app: { version: '2.2.5' }, location: { directory: f.root },
    storage: { async get(key) { return stored.get(key); }, async set(key, value) { stored.set(key, value); }, async remove(key) { stored.delete(key); }, async scan(options) { return { entries: [...stored].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit).map(([key, value]) => ({ key, value })) }; } },
    session: { async get() { return { location: { directory: f.root } }; }, async list() { return { data: [{ id: 'ses_recent', location: { directory: f.root }, time: { created: Date.now() - 1000, updated: Date.now() }, title: 'SECRET' }] }; } },
    event: { async *subscribe(options) { if (!options.signal.aborted) await new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve(), { once: true })); } },
  });
  try {
    for (let attempt = 0; stored.get('worklog.health') !== 'ok' && attempt < 60; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(stored.get('worklog.health'), 'ok');
    assert.equal(drainQueue(f.ctx).inserted, 1);
    assert.equal(f.allEvents()[0]!.type, 'session.start');
    assert.equal(JSON.stringify([...stored]).includes('SECRET'), false);
    assert.equal(JSON.stringify(f.allEvents()).includes('SECRET'), false);
  } finally { cleanup?.(); await f.close(); }
});
