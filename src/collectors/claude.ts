import { randomUUID } from 'node:crypto';
import { readdirSync, realpathSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { assertRecord, exactKeys, utc, type AppContext, type EventInput, type SourceRegistration, type ProjectRoot } from '../core/contracts.js';
import { normalizeEvent } from '../core/policy.js';
import { readPrivate } from '../core/private-files.js';
import { appendEvent, validateEvent } from '../core/events.js';
import { registerProjectRoot, resolveProject } from '../core/projects.js';
import { captureSource, enqueueEvents } from './queue.js';
import { discoverProject, workspaces } from '../core/automation.js';
import { inside } from '../core/context.js';

export const supportedClaudeVersions = ['2.1.318', '2.1.319'];

export const claudeHooks = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact'] as const;

export function normalizeClaude(source: SourceRegistration, raw: unknown, observed = { originId: randomUUID() as string, occurredAt: new Date().toISOString() }): EventInput[] {
  try {
    assertRecord(raw);
    if (source.tool !== 'claude' || !supportedClaudeVersions.includes(source.version) || Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024 || typeof raw.hook_event_name !== 'string' || typeof raw.session_id !== 'string') return [];
    const occurredAt = raw.timestamp ?? observed.occurredAt; utc(occurredAt);
    const originId = typeof raw.event_id === 'string' ? `${raw.session_id}:${String(raw.agent_id ?? '')}:${raw.event_id}` : observed.originId;
    const common = { originId, occurredAt, nativeSessionId: raw.session_id, ...(raw.agent_id ? { nativeAgentId: raw.agent_id, parentSessionId: raw.session_id } : {}), ...(raw.cwd ? { cwd: raw.cwd } : {}) };
    const output: EventInput[] = [];
    const add = (type: string, payload: object) => output.push(...normalizeEvent(source, { ...common, type, payload }));
    const turnId = typeof raw.prompt_id === 'string' ? { turnId: raw.prompt_id } : {};
    switch (raw.hook_event_name) {
      case 'SessionStart': add('session.start', { reason: ['startup', 'resume', 'compact'].includes(String(raw.source)) ? raw.source : 'unknown' }); break;
      case 'SessionEnd': add('session.end', { reason: ['clear', 'logout', 'prompt_input_exit'].includes(String(raw.reason)) ? raw.reason : 'other' }); break;
      case 'UserPromptSubmit':
        // Este hook também recebe prompts automáticos. Não comprova interação humana.
        add('turn.submit', turnId); add('turn.start', turnId); break;
      case 'PreToolUse': add('tool.start', { toolName: raw.tool_name, toolUseId: raw.tool_use_id }); break;
      case 'PostToolUse': add('tool.end', { toolName: raw.tool_name, toolUseId: raw.tool_use_id, outcome: 'completed' }); break;
      case 'PostToolUseFailure':
        add('tool.end', { toolName: raw.tool_name, toolUseId: raw.tool_use_id, outcome: raw.is_interrupt === true ? 'interrupted' : 'failed' });
        if (raw.is_interrupt === true) add('session.interrupt', { reason: 'user' }); break;
      case 'Stop': add('turn.end', { ...turnId, outcome: 'completed' }); break;
      case 'StopFailure': add('turn.end', { ...turnId, outcome: 'failed' }); add('session.interrupt', { reason: 'error' }); break;
      case 'SubagentStart': add('session.start', { reason: 'subagent' }); add('turn.start', turnId); break;
      case 'SubagentStop': add('turn.end', { ...turnId, outcome: 'completed' }); add('session.end', { reason: 'subagent' }); break;
      case 'PreCompact': add('session.start', { reason: 'compact' }); break;
    }
    return output;
  } catch { return []; }
}

export function queueClaude(dataDir: string, sourceId: string, raw: unknown): number {
  try {
    assertRecord(raw);
    if (typeof raw.cwd !== 'string') return 0;
    const source = captureSource(dataDir, sourceId);
    if (!source) return 0;
    const cwd = realpathSync(raw.cwd);
    const events = normalizeClaude(source, { ...raw, cwd });
    return enqueueEvents(dataDir, events);
  } catch { return 0; }
}

export function drainQueue(ctx: AppContext, limit = 500): { inserted: number; duplicates: number; rejected: number; pending: number } {
  if (!Number.isInteger(limit) || limit < 4 || limit > 500) throw new Error('Limite da fila inválido.');
  const directory = join(ctx.config.dataDir, 'queue');
  let files: string[]; let rejected = 0;
  try {
    const entries = readdirSync(directory);
    rejected = entries.filter((name) => name.endsWith('.json.rejected')).length;
    files = entries.filter((name) => /^\d+-\d+-[a-f0-9-]+\.json$/.test(name)).sort();
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { inserted: 0, duplicates: 0, rejected: 0, pending: 0 }; throw error; }
  let inserted = 0; let duplicates = 0;
  let processedFiles = 0; let processedEvents = 0;
  const discovered = new Set<string>();
  for (const name of files.slice(0, limit)) {
    const path = join(directory, name);
    let events: EventInput[];
    try {
      const value: unknown = JSON.parse(readPrivate(path, 128 * 1024)); assertRecord(value);
      if (value.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 4) throw new Error('Invalid queue');
      events = value.events as EventInput[];
      events.forEach((event) => validateEvent(event));
      if (events.some((event) => { const match = event.cwd ? resolveProject(ctx, event.deviceId, event.cwd) : null; return match?.state === 'unassigned' && match.reason === 'paused'; })) continue;
      if (value.roots !== undefined) {
        if (!Array.isArray(value.roots) || value.roots.length > 4) throw new Error('Invalid captured roots');
        for (const hint of value.roots) {
          assertRecord(hint); exactKeys(hint, ['projectName', 'path', 'deviceId', 'workspace'], ['remote']);
          if (typeof hint.workspace !== 'string' || typeof hint.path !== 'string' || hint.deviceId !== ctx.config.deviceId || !workspaces(ctx).includes(hint.workspace) || !inside(hint.workspace, hint.path) || !events.some((event) => event.cwd && inside(hint.path as string, event.cwd))) throw new Error('Unauthorized captured root');
          const { workspace: _, ...root } = hint;
          registerProjectRoot(ctx, root as unknown as ProjectRoot, { captured: true });
        }
      }
      for (const event of events) {
        validateEvent(event);
        if (event.cwd && !discovered.has(event.cwd)) { discoverProject(ctx, event.cwd); discovered.add(event.cwd); }
        if (!event.cwd || resolveProject(ctx, event.deviceId, event.cwd).state !== 'matched') throw new Error('Unauthorized queue');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        try { renameSync(path, `${path}.rejected`); rejected++; } catch (missing) { if ((missing as NodeJS.ErrnoException).code !== 'ENOENT') throw missing; }
      }
      processedFiles++; continue;
    }
    if (processedEvents + events.length > limit) break;
    for (const event of events) {
      const result = appendEvent(ctx, event); inserted += result.inserted; duplicates += result.duplicates;
    }
    try { unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    processedFiles++; processedEvents += events.length;
  }
  return { inserted, duplicates, rejected, pending: files.length - processedFiles };
}
