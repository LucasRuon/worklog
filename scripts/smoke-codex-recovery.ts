import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../src/core/context.js';
import { registerInstallation, validateEvent } from '../src/core/events.js';
import { openReadonlyDatabase } from '../src/core/sqlite.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { stableId } from '../src/core/policy.js';
import { readPrivate } from '../src/core/private-files.js';
import { registerSource } from '../src/collectors/source-config.js';
import { importHistory } from '../src/collectors/history.js';
import { listSessions, projectSessions } from '../src/core/sessions.js';
import { deriveTime } from '../src/core/time.js';
import type { EventInput, WorkEvent } from '../src/core/contracts.js';

const samples = [
  { session: '01a1bdf7-4e0e-7122-bbf6-f2726fdf393e', name: 'Worklog', root: join(homedir(), 'Downloads/Sistemas/Worklog') },
  { session: '01a1bdf7-5f22-7e41-966a-3960abe637ce', name: 'Posicionadas', root: join(homedir(), 'Developer/Posicionadas') },
];
const sourceId = '6c09e88d-a817-5aca-86b5-86cffd7d1532';
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const dataDir = join(homedir(), 'Library/Application Support/Worklog');
  const original = openReadonlyDatabase(join(dataDir, 'worklog.sqlite'));
  const expected: EventInput[] = [];
  let identity: { device_id: string; installation_id: string };
  try {
    identity = original.get<{ device_id: string; installation_id: string }>('SELECT device_id,installation_id FROM sources WHERE id=? AND tool=? AND version=? AND enabled=1', sourceId, 'codex', '0.167.0')!;
    assert.ok(identity);
    for (const sample of samples) {
      const rows = original.all<{ document: string }>("SELECT document FROM events WHERE json_extract(document,'$.nativeSessionId')=?", sample.session);
      assert.equal(rows.length, 5);
      const events = rows.map(row => {
        const { originSeq: _, receivedAt: __, ...event } = JSON.parse(row.document) as WorkEvent;
        validateEvent(event);
        assert.equal(event.sourceId, sourceId);
        assert.equal(event.cwd, sample.root);
        assert.equal(event.deviceId, identity.device_id);
        assert.equal(event.installationId, identity.installation_id);
        return event;
      });
      assert.deepEqual(events.map(event => event.type).sort(), ['session.end', 'session.start', 'turn.end', 'turn.start', 'turn.submit']);
      expected.push(...events);
    }
  } finally { original.close(); }
  const temporaryRoot = join(tmpdir(), 'opencode'); await mkdir(temporaryRoot, { recursive: true });
  const directory = await realpath(await mkdtemp(join(temporaryRoot, 'worklog-codex-recovery-')));
  let ctx = await openStore(join(directory, 'data'));
  const originals: { path: string; hash: string }[] = [];
  try {
    // Preserve original IDs only in this isolated store; no service or hook uses it.
    ctx.db.transaction(() => {
      registerInstallation(ctx, { deviceId: identity.device_id, installationId: identity.installation_id, name: 'Codex recovery sample', os: 'darwin', timezone: 'UTC' });
      for (const [key, value] of [['deviceId', identity.device_id], ['installationId', identity.installation_id]]) ctx.db.run('UPDATE settings SET value=? WHERE key=?', value!, key!);
    });
    ctx.config.deviceId = identity.device_id; ctx.config.installationId = identity.installation_id;
    const projectIds = samples.map(sample => registerProjectRoot(ctx, { projectName: sample.name, path: sample.root, deviceId: ctx.config.deviceId }));
    registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'codex', profile: 'recovery-real-receipts', configPath: join(homedir(), '.codex/hooks.json'), version: '0.167.0', enabled: true });
    const receipts = join(ctx.config.dataDir, 'codex-receipts'); await mkdir(receipts, { mode: 0o700 });
    for (const event of expected) {
      const name = `${stableId(sourceId, 'codex-event-v1', event.eventId)}.json`;
      const path = join(dataDir, 'codex-receipts', name); const bytes = readPrivate(path, 64 * 1024);
      assert.deepEqual(JSON.parse(bytes), [event]);
      originals.push({ path, hash: digest(bytes) });
      await writeFile(join(receipts, name), bytes, { mode: 0o600, flag: 'wx' });
    }
    const times = expected.map(event => event.occurredAt).sort();
    const range = { from: times[0]!, to: new Date(Date.parse(times.at(-1)!) + 1).toISOString() };
    const result = await importHistory(ctx, sourceId, range);
    assert.equal(result.imported, 10); assert.equal(result.complete, true); assert.deepEqual(result.warnings, []);
    await ctx.shutdown(); ctx = await openStore(join(directory, 'data'));
    const replay = await importHistory(ctx, sourceId, range);
    assert.equal(replay.imported, 0); assert.equal(replay.complete, true);
    const events = ctx.db.all<{ document: string }>('SELECT document FROM events').map(row => JSON.parse(row.document) as WorkEvent);
    const inputs = events.map(({ originSeq: _, receivedAt: __, ...event }) => event).sort((a, b) => a.eventId.localeCompare(b.eventId));
    assert.deepEqual(inputs, expected.sort((a, b) => a.eventId.localeCompare(b.eventId)));
    projectSessions(ctx, events);
    const filter = { ...range, timezone: 'UTC', projectIds };
    const sessions = listSessions(ctx, filter);
    assert.equal(sessions.length, 2);
    for (let index = 0; index < samples.length; index++) {
      assert.ok(sessions.some(session => session.nativeSessionId === samples[index]!.session && session.projectId === projectIds[index] && session.provenance === 'imported'));
    }
    const firstTimes = expected.filter(event => event.nativeSessionId === samples[0]!.session).map(event => event.occurredAt).sort();
    const selected = listSessions(ctx, { ...filter, projectIds: [projectIds[0]!], from: firstTimes[0]!, to: new Date(Date.parse(firstTimes.at(-1)!) + 1).toISOString() });
    assert.equal(selected.length, 1); assert.equal(selected[0]!.nativeSessionId, samples[0]!.session);
    assert.equal(deriveTime(ctx, filter).humanEstimatedMs, 0);
    assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    assert.ok(events.every(event => ['session.start', 'session.end', 'turn.start', 'turn.end', 'turn.submit'].includes(event.type)));
    for (const file of originals) assert.equal(digest(readPrivate(file.path, 64 * 1024)), file.hash);
    const report = { passed: true, at: new Date().toISOString(), parser: 'codex-receipts-v1', originalIdentityPreserved: true, sessions: samples.map(sample => ({ id: sample.session, project: sample.name })), expected: 10, imported: result.imported, replayInserted: replay.imported, recoveredSessions: sessions.length, selectedSessions: selected.length, humanEstimatedMs: 0, fileRevisions: 0, originalReceiptsUnchanged: true, originDatabaseReadOnly: true, store: 'temporary-isolated-removed-after-run', scope: 'two-owned-real-sessions-not-raw-native-rollout' };
    const output = resolve('artifacts/t15-recovery'); await mkdir(output, { recursive: true });
    await writeFile(join(output, 'codex-receipts.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
}

void main().catch(() => { console.error(JSON.stringify({ passed: false, code: 'CODEX_RECOVERY_SMOKE_FAILED' })); process.exitCode = 1; });
