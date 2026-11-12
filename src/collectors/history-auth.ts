import type { AppContext, SourceRegistration } from '../core/contracts.js';
import { normalizeEvent } from '../core/policy.js';
import { resolveProject } from '../core/projects.js';
import { prepareCapture } from './queue.js';

/**
 * Pasta → cwd canônico autorizado (ou `null`), com cache. Usado pelos importadores nativos: pastas removidas,
 * fora das raízes ou excluídas pela política são puladas sem abortar a importação.
 */
export function historyAuthorizer(ctx: AppContext, source: SourceRegistration) {
  const authorized = new Map<string, string | null>();
  return (cwd: string, sessionId: string): string | null => {
    if (authorized.has(cwd)) return authorized.get(cwd)!;
    let canonical: string | null = null;
    try {
      if (resolveProject(ctx, source.deviceId, cwd).state === 'matched') {
        const probe = normalizeEvent(source, { originId: `${sessionId}:history-probe`, occurredAt: new Date().toISOString(), nativeSessionId: sessionId, cwd, type: 'session.start', payload: { reason: 'resume' } });
        canonical = probe.length === 1 ? prepareCapture(ctx.config.dataDir, probe).events[0]?.cwd ?? null : null;
      }
    } catch { canonical = null; }
    authorized.set(cwd, canonical);
    return canonical;
  };
}
