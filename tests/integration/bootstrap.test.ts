import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { test } from 'node:test';
import { createApp, closeApp } from '../../src/server/index.js';

test('bootstrap local: SQLite, autenticação, Host/Origin, reinício e shutdown', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'worklog-bootstrap-'));
  const ctx = await createApp({ dataDir, port: 0 });
  const url = ctx.config.origin;
  try {
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { status: 'ok', database: 'ok' });
    assert.equal((await fetch(`${url}/api/auth/session`)).status, 401);
    assert.equal((await fetch(`${url}/api/auth/bootstrap`, { method: 'POST' })).status, 401);

    const token = (await readFile(join(dataDir, 'bootstrap.token'), 'utf8')).trim();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(dataDir, 'bootstrap.token'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(dataDir, 'worklog.sqlite'))).mode & 0o777, 0o600);
    const bootstrap = (origin: string, bearer = token) => fetch(`${url}/api/auth/bootstrap`, {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${bearer}` },
    });
    assert.equal((await bootstrap('https://outside.example')).status, 403);
    assert.equal((await bootstrap(url, 'invalid')).status, 401);
    assert.equal((await fetch(`${url}/api/health`, { headers: { Origin: 'https://outside.example' } })).status, 403);
    assert.equal((await fetch(`${url}/api/health`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/api/health`, { headers: { Host: 'outside.example' } }, (res) => {
        res.resume(); resolve(res.statusCode);
      });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHost, 403);

    const accepted = await bootstrap(url);
    assert.equal(accepted.status, 204);
    const setCookie = accepted.headers.get('set-cookie')!;
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0]!;
    assert.equal((await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 403);
    assert.equal((await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie, Origin: url } })).status, 204);
    assert.equal((await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(`${url}/api/not-implemented`, { method: 'POST', headers: { Origin: url } })).status, 401);
    assert.equal(ctx.db.get<{ result: number }>('SELECT 1 AS result')?.result, 1);

    await closeApp(ctx);
    await assert.rejects(fetch(`${url}/api/health`));
    const restarted = await createApp({ dataDir, port: Number(new URL(url).port) });
    try {
      assert.equal((await fetch(`${restarted.config.origin}/api/health`)).status, 200);
      assert.equal((await readFile(join(dataDir, 'bootstrap.token'), 'utf8')).trim(), token);
    } finally { await closeApp(restarted); }
    await closeApp(ctx);
  } finally {
    await closeApp(ctx);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('falha ao ocupar porta libera banco e recursos da inicialização', async () => {
  const firstDir = await mkdtemp(join(tmpdir(), 'worklog-first-'));
  const secondDir = await mkdtemp(join(tmpdir(), 'worklog-second-'));
  const first = await createApp({ dataDir: firstDir, port: 0 });
  const port = Number(new URL(first.config.origin).port);
  try {
    await assert.rejects(createApp({ dataDir: secondDir, port }), { code: 'EADDRINUSE' });
    await closeApp(first);
    const second = await createApp({ dataDir: secondDir, port });
    await closeApp(second);
  } finally {
    await closeApp(first);
    await rm(firstDir, { recursive: true, force: true });
    await rm(secondDir, { recursive: true, force: true });
  }
});

test('recusa configuração inválida, dados no repositório e token por symlink', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-invalid-'));
  try {
    await assert.rejects(createApp({ dataDir: directory, port: -1 }), /Porta inválida/);
    await assert.rejects(createApp({ dataDir: 'relative', port: 0 }), /absoluto/);
    await assert.rejects(createApp({ dataDir: process.cwd(), port: 0 }), /fora do repositório/);
    const target = join(directory, 'target');
    await writeFile(target, 'a'.repeat(64), { mode: 0o600 });
    await symlink(target, join(directory, 'bootstrap.token'));
    await assert.rejects(createApp({ dataDir: directory, port: 0 }));
    assert.equal(await readFile(target, 'utf8'), 'a'.repeat(64));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
