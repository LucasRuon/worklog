import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { createClient, listClients, removeClient, renameClient, setProjectClient } from '../../src/core/clients.js';

test('clientes: um cliente com vários projetos, troca, renome, remoção protegida e cadastro por nome', async () => {
  const f = await fixture();
  try {
    const roots = await Promise.all(['a', 'b'].map(async (name) => { const path = join(f.directory, name); await mkdir(path); return path; }));
    const [a, b] = roots.map((path, i) => registerProjectRoot(f.ctx, { projectName: `P${i}`, deviceId: f.ctx.config.deviceId, path }));
    const acme = createClient(f.ctx, '  Acme   Ltda ');
    assert.throws(() => createClient(f.ctx, 'acme ltda'), /CLIENT_EXISTS/);
    assert.throws(() => createClient(f.ctx, '   '), /INVALID_CLIENT/);
    setProjectClient(f.ctx, a!, acme); setProjectClient(f.ctx, b!, acme); setProjectClient(f.ctx, f.projectId, acme);
    assert.deepEqual(listClients(f.ctx), [{ id: acme, name: 'Acme Ltda', projectCount: 3 }]);
    assert.deepEqual(listProjects(f.ctx).filter((p) => p.clientId === acme).map((p) => p.client), ['Acme Ltda', 'Acme Ltda', 'Acme Ltda']);
    assert.throws(() => removeClient(f.ctx, acme), /CLIENT_IN_USE/);

    const beta = createClient(f.ctx, 'Beta');
    setProjectClient(f.ctx, b!, beta);
    renameClient(f.ctx, acme, 'Acme S.A.');
    assert.throws(() => renameClient(f.ctx, acme, 'beta'), /CLIENT_EXISTS/);
    assert.equal(listProjects(f.ctx).find((p) => p.id === a)!.client, 'Acme S.A.');
    assert.equal(listProjects(f.ctx).find((p) => p.id === b)!.client, 'Beta');

    setProjectClient(f.ctx, b!, null);
    assert.equal(listProjects(f.ctx).find((p) => p.id === b)!.clientId, null);
    removeClient(f.ctx, beta);
    assert.equal(listClients(f.ctx).length, 1);

    // Cadastro de raiz com nome reaproveita o cliente existente sem diferenciar maiúsculas/minúsculas.
    const c = join(f.directory, 'c'); await mkdir(c);
    const projectC = registerProjectRoot(f.ctx, { projectName: 'P2', client: 'acme s.a.', deviceId: f.ctx.config.deviceId, path: c });
    assert.equal(listProjects(f.ctx).find((p) => p.id === projectC)!.clientId, acme);
    assert.throws(() => setProjectClient(f.ctx, a!, '00000000-0000-4000-8000-000000000000'), /CLIENT_NOT_FOUND/);
  } finally { await f.close(); }
});

test('migração 016: texto livre legado vira cliente único por nome (sem diferenciar caixa)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFile } = await import('node:fs/promises');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT) STRICT');
  db.exec("INSERT INTO projects VALUES ('p1', 'Um', 'Acme'), ('p2', 'Dois', ' acme '), ('p3', 'Três', NULL), ('p4', 'Quatro', 'Beta')");
  db.exec(await readFile('db/migrations/016_clients.sql', 'utf8'));
  const clients = db.prepare('SELECT id, name FROM clients ORDER BY name').all() as { id: string; name: string }[];
  assert.equal(clients.length, 2);
  assert.match(clients[0]!.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const links = db.prepare('SELECT pc.project_id, c.name FROM project_clients pc JOIN clients c ON c.id = pc.client_id ORDER BY pc.project_id').all();
  assert.deepEqual(links.map((row) => [row.project_id, String(row.name).toLowerCase()]), [['p1', 'acme'], ['p2', 'acme'], ['p4', 'beta']]);
  db.close();
});
