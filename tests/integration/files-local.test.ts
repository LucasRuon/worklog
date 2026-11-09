import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects } from '../../src/core/projects.js';
import { reconcileRoot } from '../../src/collectors/files.js';
import { createApp, closeApp } from '../../src/server/index.js';

test('API de arquivos: lista sem conteúdo, cursor, diff, política e vínculo explícito autenticado', async () => {
  const f = await fixture(); const root = listProjects(f.ctx)[0]!.roots[0]!;
  await writeFile(join(f.root, 'código.txt'), 'versão inicial\n'); await reconcileRoot(f.ctx, root);
  const now = Date.now(); f.emit('session.start', new Date(now - 60_000).toISOString(), { reason: 'startup' });
  f.emit('tool.start', new Date(now - 1000).toISOString(), { toolName: 'Edit', toolUseId: 'edit-1' });
  await writeFile(join(f.root, 'código.txt'), 'versão alterada\n'); await reconcileRoot(f.ctx, root, 'watch');
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const call = (path: string, init?: RequestInit) => fetch(`${app.config.origin}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
    const query = new URLSearchParams({ from: new Date(now - 120_000).toISOString(), to: new Date(now + 60_000).toISOString(), timezone: 'UTC', projectIds: f.projectId });
    const first = await (await call(`/api/files?${query}&limit=1`)).json(); assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
    assert.equal(JSON.stringify(first).includes('versão alterada'), false); assert.equal(Object.hasOwn(first.items[0], 'content'), false);
    const second = await (await call(`/api/files?${query}&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json(); assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
    assert.notEqual(first.items[0].id, second.items[0].id);
    const id = f.ctx.db.get<{ id: string }>('SELECT id FROM file_revisions ORDER BY rowid DESC LIMIT 1')!.id;
    const detail = await (await call(`/api/files/${id}`)).json(); assert.match(detail.diff.patch, /-versão inicial\n\+versão alterada/); assert.equal(detail.links[0].confidence, 'inferred');
    const session = detail.links[0].targetId;
    assert.equal((await call('/api/evidence-links', { method: 'POST', body: JSON.stringify({ revisionId: id, sessionId: session }) })).status, 200);
    assert.equal((await (await call(`/api/files/${id}`)).json()).links[0].confidence, 'explicit');
    assert.equal((await (await call(`/api/sessions/${session}`)).json()).files[0].id, id);
    assert.equal((await call('/api/evidence-links', { method: 'POST', body: JSON.stringify({ revisionId: id, sessionId: randomUUID() }) })).status, 404);
    assert.equal((await fetch(`${app.config.origin}/api/files/${id}`)).status, 401);
    assert.equal((await call(`/api/files?${query}&cursor=broken`)).status, 400);
    assert.equal((await (await call(`/api/files?${query}&tools=opencode`)).json()).items.length, 0);
    assert.equal((await (await call(`/api/files?${query}&deviceIds=${randomUUID()}`)).json()).items.length, 0);
    assert.equal((await call(`/api/files/${randomUUID()}`)).status, 404);
    assert.equal((await (await call(`/api/files/history?rootId=${root.id}&path=..%2Foutside`)).json()).items.length, 0);
  } finally { await closeApp(app); await f.close(); }
});

test('export distribuído lê revisões persistidas sem iniciar uma varredura durante a requisição SSH', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'arquivo.txt'), 'ainda não observado');
    const packet = JSON.parse(execFileSync(process.execPath, ['dist/cli/index.js', 'agent', 'files', '--data-dir', f.ctx.config.dataDir, '--expected-installation', f.ctx.config.installationId], { encoding: 'utf8', timeout: 10_000 }));
    assert.deepEqual(packet.items, []); assert.equal(packet.hasMore, false);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    await reconcileRoot(f.ctx, listProjects(f.ctx)[0]!.roots[0]!);
    const observed = JSON.parse(execFileSync(process.execPath, ['dist/cli/index.js', 'agent', 'files', '--data-dir', f.ctx.config.dataDir, '--expected-installation', f.ctx.config.installationId], { encoding: 'utf8', timeout: 10_000 }));
    assert.equal(observed.items.some((item: { kind: string }) => item.kind === 'revision'), true);
  } finally { await f.close(); }
});
