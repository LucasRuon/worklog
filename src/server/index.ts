import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../core/context.js';
import type { AppContext } from '../core/contracts.js';
export type { AppContext } from '../core/contracts.js';
import { createAuth, ensureBootstrapToken, isLocalRequest } from './auth.js';
import { handleRoutes, synchronize } from './routes.js';
import { startFocusObserver } from '../collectors/focus.js';
import { pollGit, waitForGit } from '../collectors/git.js';
import { pollFiles, stopFiles } from '../collectors/files.js';
import { pollPullRequests, waitForPullRequests } from '../providers/github.js';
import { scheduledRetention } from '../core/maintenance.js';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function serveWeb(req: IncomingMessage, res: ServerResponse) {
  const pathname = new URL(req.url ?? '/', 'http://local').pathname;
  if (pathname !== '/' && !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)) return json(res, 404, { error: 'Rota não encontrada.' });
  const path = join(appRoot, 'dist/web', pathname === '/' ? 'index.html' : pathname);
  try {
    const bytes = await readFile(path);
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    json(res, 404, { error: 'Interface não compilada. Execute npm run build.' });
  }
}

/** `collect: false` deixa a captura (sincronização, git, arquivos) com o serviço em segundo plano; o servidor só serve o painel. */
export async function createApp(options: { dataDir: string; port: number; dev?: boolean; observeMachine?: boolean; collect?: boolean }): Promise<AppContext> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('Porta inválida.');
  const store = await openStore(options.dataDir);
  const { db } = store;
  let auth: ReturnType<typeof createAuth>;
  try { auth = createAuth(await ensureBootstrapToken(store.config.dataDir)); }
  catch (error) { await store.shutdown(); throw error; }
  let web: Awaited<ReturnType<typeof import('vite')['createServer']>> | undefined;
  let origin = '';
  let shutdownPromise: Promise<void> | undefined;
  let collectorTimer: ReturnType<typeof setInterval> | undefined;
  let stopFocus: (() => Promise<void>) | undefined;
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'Falha interna. Consulte o diagnóstico local.' });
      else res.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${options.dev ? " 'unsafe-inline'" : ''}; style-src 'self'${options.dev ? " 'unsafe-inline'" : ''}; connect-src 'self'${options.dev ? ` ws://${new URL(origin).host}` : ''}; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    if (!isLocalRequest(req, origin)) return json(res, 403, { error: 'Origem local obrigatória.' });
    const path = new URL(req.url ?? '/', origin).pathname;
    const method = req.method ?? 'GET';
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (mutating && path !== '/api/auth/bootstrap' && !auth.authorized(req)) return json(res, 401, { error: 'Autenticação obrigatória.' });
    if (mutating && !auth.hasToken(req) && req.headers.origin !== origin && path !== '/api/auth/bootstrap') {
      return json(res, 403, { error: 'Origin obrigatório para sessão do navegador.' });
    }
    if (path === '/api/health' && method === 'GET') {
      db.get('SELECT 1');
      return json(res, 200, { status: 'ok', database: 'ok' });
    }
    if (path === '/api/auth/bootstrap' && method === 'POST') {
      if (!auth.hasToken(req)) return json(res, 401, { error: 'Token local inválido.' });
      res.setHeader('Set-Cookie', auth.newSession());
      res.writeHead(204); res.end(); return;
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', auth.logout(req));
      res.writeHead(204); res.end(); return;
    }
    if (path.startsWith('/api/')) {
      if (!auth.authorized(req)) return json(res, 401, { error: 'Autenticação obrigatória.' });
      if (path === '/api/auth/session' && method === 'GET') return json(res, 200, { authenticated: true });
      return handleRoutes(store, req, res);
    }
    if (!['GET', 'HEAD'].includes(method)) return json(res, 405, { error: 'Método não permitido.' });
    if (web) web.middlewares(req, res, () => json(res, 404, { error: 'Rota não encontrada.' }));
    else await serveWeb(req, res);
  }

  function shutdown() {
    return shutdownPromise ??= (async () => {
      try {
        if (collectorTimer) clearInterval(collectorTimer);
        await waitForGit(store);
        await waitForPullRequests(store);
        await stopFiles(store);
        await stopFocus?.();
        await web?.close();
      } finally {
        try {
          if (server.listening) {
            const stopped = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
            server.closeAllConnections();
            await stopped;
          }
        } finally { db.close(); }
      }
    })();
  }

  try {
    if (options.dev) {
      const { createServer: createViteServer } = await import('vite');
      web = await createViteServer({ server: { middlewareMode: true, hmr: { server } } });
    }
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Endereço local indisponível.');
    origin = `http://127.0.0.1:${address.port}`;
    store.config.port = address.port; store.config.origin = origin;
    const collect = options.collect !== false;
    if (collect) synchronize(store);
    collectorTimer = setInterval(() => { try { if (collect) { synchronize(store); scheduledRetention(store); void pollGit(store).catch(() => {}); void pollFiles(store).catch(() => {}); } void pollPullRequests(store).catch(() => {}); } catch { /* A API mantém o último estado consultável. */ } }, 1000);
    collectorTimer.unref();
    if (options.observeMachine) stopFocus = startFocusObserver(store);
    return { db, config: store.config, shutdown };
  } catch (error) { await shutdown(); throw error; }
}

export async function closeApp(ctx: AppContext): Promise<void> { await ctx.shutdown(); }
