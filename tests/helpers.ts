import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/core/context.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { registerSource } from '../src/collectors/source-config.js';
import { appendEvent } from '../src/core/events.js';
import type { EventType, EventPayloads, EventInput, WorkEvent, ReportFilter } from '../src/core/contracts.js';

export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-domain-'));
  const ctx = await openStore(join(directory, 'data'));
  const root = join(directory, 'repository'); await mkdir(root);
  const projectId = registerProjectRoot(ctx, { projectName: 'Projeto teste', deviceId: ctx.config.deviceId, path: root });
  const source = { id: randomUUID(), deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'claude' as const, profile: 'test', configPath: join(directory, 'profile.json'), version: '2.1.318', enabled: true };
  registerSource(ctx, source);
  const allEvents = () => ctx.db.all<{ document: string }>('SELECT document FROM events ORDER BY origin_seq').map((row) => JSON.parse(row.document) as WorkEvent);
  return { ctx, root, projectId, source, directory, allEvents,
    emit<K extends EventType>(type: K, time: string, payload: EventPayloads[K], extra: Partial<Pick<EventInput, 'nativeSessionId' | 'nativeAgentId' | 'parentSessionId' | 'sourceId' | 'cwd' | 'tool'>> = {}) {
      const input = { schemaVersion: 1 as const, eventId: randomUUID(), deviceId: source.deviceId, installationId: source.installationId, sourceId: source.id, tool: source.tool, type, occurredAt: new Date(time).toISOString(), nativeSessionId: 'session-one', cwd: root, payload, ...extra } as EventInput;
      appendEvent(ctx, input);
      return allEvents().find((event) => event.eventId === input.eventId)!;
    },
    filter: { projectIds: [], from: '2026-11-05T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z', timezone: 'America/Sao_Paulo' } satisfies ReportFilter,
    async close() { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); },
  };
}
