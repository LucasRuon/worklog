import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openStore } from '../src/core/context.js';
import { assertRecord, DomainError, shortId, utc, type EventInput } from '../src/core/contracts.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { registerSource } from '../src/collectors/source-config.js';
import { configureHistory, importHistory } from '../src/collectors/history.js';
import { isOpenCodeV2 } from '../src/collectors/plugins/opencode-projector.js';
import { projectV2Event } from '../src/collectors/plugins/opencode-projector.js';
import { normalizeEvent, stableId } from '../src/core/policy.js';

async function main() {
  const { values } = parseArgs({ options: { session: { type: 'string' }, root: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
  if (!values.session || !values.root || !values.from || !values.to) throw new DomainError('SMOKE_ARGUMENTS_REQUIRED');
  shortId(values.session); utc(values.from); utc(values.to); const root = await realpath(values.root);
  const run = (...args: string[]) => execFileSync('opencode', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
  const installed = run('--version').trim().replace(/^opencode v/, '');
  if (!isOpenCodeV2(installed)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const response = JSON.parse(run('api', 'GET', `/api/session/${values.session}`)); const info = response.data;
  if (!info || info.id !== values.session || !info.location || await realpath(info.location.directory) !== root) throw new DomainError('HISTORY_ROOT_UNAUTHORIZED');
  const raw = run('api', 'GET', `/api/experimental/session/${values.session}/log?follow=false`);
  const records: Record<string, unknown>[] = [];
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n'); if (!data) continue;
    const value: unknown = JSON.parse(data); assertRecord(value);
    // Drop transcript/arguments/results before writing even the temporary native-log fixture.
    const projected: Record<string, unknown> = {};
    for (const key of ['id', 'type', 'created', 'aggregateID', 'seq']) if (value[key] !== undefined) projected[key] = value[key];
    if (value.durable) { assertRecord(value.durable); projected.durable = Object.fromEntries(['aggregateID', 'seq', 'version'].map((key) => [key, value.durable && (value.durable as Record<string, unknown>)[key]])); }
    if (value.location) { assertRecord(value.location); projected.location = { directory: value.location.directory }; }
    if (value.data) {
      assertRecord(value.data); const fields: Record<string, unknown> = {};
      for (const key of ['sessionID', 'parentID', 'version', 'inboxID', 'assistantMessageID', 'id', 'name']) if (value.data[key] !== undefined) fields[key] = value.data[key];
      if (value.data.location) { assertRecord(value.data.location); fields.location = { directory: value.data.location.directory }; }
      projected.data = fields;
    }
    records.push(projected);
  }
  const created = records.find((record) => record.type === 'session.created'); const version = (created?.data as Record<string, unknown> | undefined)?.version ?? installed;
  if (!isOpenCodeV2(version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const directory = await mkdtemp(join(tmpdir(), 'worklog-v2-history-')); const ctx = await openStore(join(directory, 'data'));
  try {
    registerProjectRoot(ctx, { path: root, projectName: 'Histórico nativo delimitado', deviceId: ctx.config.deviceId });
    const path = join(directory, 'metadata.sse'); await writeFile(path, records.map((record) => `data: ${JSON.stringify(record)}\n\n`).join(''), { mode: 0o600 });
    const source = { id: stableId(ctx.config.installationId, 'native-log-smoke'), installationId: ctx.config.installationId, deviceId: ctx.config.deviceId, tool: 'opencode' as const, version, profile: 'native-log-smoke', configPath: path, enabled: true }; registerSource(ctx, source);
    configureHistory(ctx, source.id, { parser: 'opencode-log-v1', path });
    const expected = new Set<string>(); const tools = new Map<string, string>();
    for (const record of records) {
      const data = record.data as Record<string, unknown> | undefined; const key = `${String(data?.assistantMessageID)}:${String(data?.id)}`;
      if (record.type === 'session.tool.input.started' && typeof data?.name === 'string') tools.set(key, data.name);
      const projected = projectV2Event(record, { cwd: root, toolName: tools.get(key), ...(typeof info.parentID === 'string' ? { parentSessionId: info.parentID } : {}) });
      if (projected) for (const event of normalizeEvent(source, projected)) if (event.occurredAt >= values.from && event.occurredAt < values.to) expected.add(event.eventId);
    }
    const result = await importHistory(ctx, source.id, { from: values.from, to: values.to }, { limit: 10000 });
    if (!created) { assert.equal(result.imported, 0); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_UNAVAILABLE']); }
    else { assert.equal(result.complete, true); assert.equal(result.imported, expected.size); assert.deepEqual(new Set(ctx.db.all<{ event_id: string }>('SELECT event_id FROM events').map((r) => r.event_id)), expected); }
    const replay = await importHistory(ctx, source.id, { from: values.from, to: values.to }, { limit: 10000 }); assert.equal(replay.imported, 0);
    const events = ctx.db.all<{ document: string }>('SELECT document FROM events').map((r) => JSON.parse(r.document) as EventInput);
    assert.ok(events.every((event) => !['human.interaction', 'focus.change', 'file.change', 'session.end'].includes(event.type)));
    assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    console.log(JSON.stringify({ passed: true, installed, session: values.session, parser: 'opencode-log-v1', nativeFrames: records.length, expectedIds: expected.size, imported: result.imported, replayInserted: replay.imported, complete: result.complete, warnings: result.warnings, nativeHistoryProven: Boolean(created) && result.complete && expected.size > 0, fileRevisions: 0, sourceReadOnly: true, scope: 'one-authorized-session-temporary-store' }, null, 2));
  } finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
}
void main().catch((error: unknown) => { console.error(JSON.stringify({ passed: false, error: error instanceof DomainError ? error.code : 'HISTORY_SMOKE_UNAVAILABLE' })); process.exitCode = 1; });
