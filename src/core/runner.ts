import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { synchronize } from '../server/routes.js';
import { drainQueue } from '../collectors/claude.js';
import { syncScheduledHosts } from '../remote/ssh.js';
import { DomainError, type AppContext } from './contracts.js';
import { startFocusObserver } from '../collectors/focus.js';
import { pollGit } from '../collectors/git.js';
import { pollFiles, stopFiles } from '../collectors/files.js';
import { scheduledRetention } from './maintenance.js';

function log(ctx: AppContext, message: string) {
  const path = join(ctx.config.dataDir, 'agent.log');
  try {
    if (existsSync(path) && statSync(path).size > 1024 * 1024) renameSync(path, `${path}.1`);
    appendFileSync(path, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  } catch { /* Não produzir payloads em stdout/stderr como fallback. */ }
}
export async function runAgent(ctx: AppContext, central: boolean, signal: AbortSignal) {
  log(ctx, 'started'); let lastError = '';
  const stopFocus = central ? startFocusObserver(ctx) : undefined;
  while (!signal.aborted) {
    try {
      if (central) { synchronize(ctx); await syncScheduledHosts(ctx, signal); }
      else drainQueue(ctx);
      await pollGit(ctx);
      await pollFiles(ctx);
      scheduledRetention(ctx);
      if (lastError) log(ctx, 'recovered'); lastError = '';
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'COLLECTOR_UNAVAILABLE';
      if (code !== lastError) log(ctx, code); lastError = code;
    }
    if (!signal.aborted) await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, 1000); signal.addEventListener('abort', done, { once: true });
    });
  }
  await stopFocus?.();
  await stopFiles(ctx);
  try { if (central) synchronize(ctx); else drainQueue(ctx); } catch { log(ctx, 'pending-events-preserved'); }
  log(ctx, 'stopped');
}
