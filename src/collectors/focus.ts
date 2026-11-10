import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { appendEvent } from '../core/events.js';
import { registerSource } from './source-config.js';
import { stableId } from '../core/policy.js';
import { DomainError, type AppContext, type EventInput } from '../core/contracts.js';
import { collectionEnabled, operatingConfig } from '../core/configuration.js';

export function recordFocus(ctx: AppContext, event: EventInput) {
  if (!['human.interaction', 'focus.change', 'machine.idle', 'machine.resume'].includes(event.type) || event.deviceId !== ctx.config.deviceId || event.nativeAgentId) throw new DomainError('INVALID_FOCUS');
  if (!collectionEnabled(ctx, 'focus') && !(event.type === 'machine.idle' && event.payload.reason === 'pause')) throw new DomainError('SOURCE_PAUSED', 409);
  return appendEvent(ctx, event);
}

export function signalHuman(ctx: AppContext, projectId: string | null, pause = false) {
  const root = projectId ? ctx.db.get<{ path: string }>('SELECT path FROM project_roots WHERE project_id = ? AND device_id = ? AND enabled = 1 ORDER BY path LIMIT 1', projectId, ctx.config.deviceId) : null;
  // Projeto sem raiz nesta máquina (ex.: só no macmini): o sinal leva o ID do projeto em vez da pasta.
  const remoteOnly = !pause && !root && !!projectId && !!ctx.db.get('SELECT id FROM projects WHERE id = ?', projectId);
  if (!pause && !root && !remoteOnly) throw new DomainError(projectId ? 'UNKNOWN_PROJECT' : 'LOCAL_PROJECT_REQUIRED');
  const sourceId = stableId(ctx.config.installationId, 'focus');
  registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'focus', profile: 'explicit', configPath: ctx.config.dataDir, version: '1', enabled: true });
  const base = { schemaVersion: 1 as const, eventId: randomUUID(), deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, sourceId, tool: 'focus' as const, occurredAt: new Date().toISOString(), ...(root ? { cwd: root.path } : {}) };
  return recordFocus(ctx, pause ? { ...base, type: 'machine.idle', payload: { reason: 'pause' } } : { ...base, type: 'human.interaction', payload: remoteOnly ? { kind: 'explicit', projectId: projectId! } : { kind: 'explicit' } });
}

export async function probeMachine(): Promise<{ status: 'observed' | 'unavailable'; idleMs: number; locked: boolean }> {
  if (platform() !== 'darwin') return { status: 'unavailable', idleMs: 0, locked: false };
  try {
    const execute = promisify(execFile);
    const [hid, root] = await Promise.all([
      execute('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-r', '-d', '1'], { timeout: 1500, maxBuffer: 256 * 1024 }),
      execute('/usr/sbin/ioreg', ['-n', 'Root', '-d', '1'], { timeout: 1500, maxBuffer: 256 * 1024 }),
    ]);
    const idle = hid.stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/)?.[1];
    if (!idle) return { status: 'unavailable', idleMs: 0, locked: false };
    return { status: 'observed', idleMs: Number(BigInt(idle) / 1_000_000n), locked: /"CGSSessionScreenIsLocked"\s*=\s*(?:Yes|true)/i.test(root.stdout) };
  } catch { return { status: 'unavailable', idleMs: 0, locked: false }; }
}

export function startFocusObserver(ctx: AppContext) {
  let previousAt = Date.now(); let idle = false; let busy = false; let stopped = false; let first = true;
  let pending: Promise<void> = Promise.resolve();
  async function poll() {
    if (busy || stopped) return;
    busy = true;
    try {
      if (!collectionEnabled(ctx, 'focus')) { ctx.db.run("INSERT INTO settings VALUES ('focusObservation', 'paused') ON CONFLICT(key) DO UPDATE SET value = 'paused'"); previousAt = Date.now(); return; }
      const signal = await probeMachine();
      if (stopped) return;
      ctx.db.run("INSERT INTO settings VALUES ('focusObservation', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", signal.status);
      const now = Date.now();
      const asleep = now - previousAt > 15_000;
      const inactive = signal.status === 'observed' && (signal.locked || signal.idleMs >= operatingConfig(ctx).idleMs);
      const sourceId = stableId(ctx.config.installationId, 'focus');
      const base = { schemaVersion: 1 as const, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, sourceId, tool: 'focus' as const };
      const register = () => registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'focus', profile: 'explicit', configPath: ctx.config.dataDir, version: '1', enabled: true });
      if ((!idle && inactive) || asleep) {
        register();
        recordFocus(ctx, { ...base, eventId: randomUUID(), occurredAt: new Date(asleep ? previousAt : now).toISOString(), type: 'machine.idle', payload: { reason: asleep ? 'pause' : signal.locked ? 'lock' : 'idle' } });
      }
      // Retorno observado (teclado/mouse ativos e tela desbloqueada): delimita a ausência para a dedicação por prompts.
      if (signal.status === 'observed' && !inactive && (idle || asleep || first)) {
        register();
        recordFocus(ctx, { ...base, eventId: randomUUID(), occurredAt: new Date(now).toISOString(), type: 'machine.resume', payload: {} });
      }
      if (signal.status === 'observed') first = false;
      idle = inactive; previousAt = now;
    } finally { busy = false; }
  }
  const timer = setInterval(() => { if (!busy) pending = poll().catch(() => { /* Diagnóstico sem payload; a próxima amostra pode recuperar. */ }); }, 5000);
  timer.unref();
  pending = poll().catch(() => {});
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
