import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp, closeApp } from '../../src/server/index.js';
import { appendEvent, importBatch, readBatch, registerInstallation } from '../../src/core/events.js';
import { registerSource } from '../../src/collectors/source-config.js';
import type { EventInput } from '../../src/core/contracts.js';

test('eventos: retry, rollback atômico, reinício, identidades e validação de cursor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-events-'));
  let ctx = await createApp({ dataDir: join(directory, 'origin'), port: 0 });
  const receiver = await createApp({ dataDir: join(directory, 'receiver'), port: 0 });
  const source = { id: randomUUID(), deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'claude' as const, profile: 'test', configPath: directory, version: '2.1.318', enabled: true };
  registerSource(ctx, source);
  registerInstallation(receiver, { deviceId: source.deviceId, installationId: source.installationId, name: 'test', os: 'test', timezone: 'UTC' });
  registerSource(receiver, source);
  const event = (type: 'session.start' | 'session.end', at: string): EventInput => {
    const identity = { schemaVersion: 1 as const, eventId: randomUUID(), deviceId: source.deviceId, installationId: source.installationId, sourceId: source.id, tool: 'claude' as const, occurredAt: at, nativeSessionId: 'session-one' };
    return type === 'session.start' ? { ...identity, type, payload: { reason: 'startup' } } : { ...identity, type, payload: { reason: 'other' } };
  };
  try {
    const first = event('session.start', '2026-11-05T09:00:00.000Z');
    assert.equal(appendEvent(ctx, first).inserted, 1);
    assert.equal(appendEvent(ctx, first).duplicates, 1);
    appendEvent(ctx, event('session.end', '2026-11-05T10:00:00.000Z'));
    const batch = readBatch(ctx, { installationId: source.installationId, seq: 0 }, 500);
    assert.equal(batch.events.length, 2);
    assert.throws(() => readBatch(ctx, { installationId: source.installationId, seq: 99 }, 500), /INVALID_CURSOR/);
    assert.throws(() => readBatch(ctx, { installationId: randomUUID(), seq: 0 }, 500), /INVALID_CURSOR/);
    receiver.db.exec(`CREATE TRIGGER fail_import BEFORE INSERT ON events WHEN NEW.origin_seq = 2 BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    assert.throws(() => importBatch(receiver, batch));
    assert.equal(receiver.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 0);
    assert.equal(receiver.db.get('SELECT * FROM sync_cursors WHERE installation_id = ?', source.installationId), undefined);
    receiver.db.exec('DROP TRIGGER fail_import');
    assert.equal(importBatch(receiver, batch).inserted, 2);
    assert.equal(importBatch(receiver, batch).duplicates, 2);
    assert.equal(receiver.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 2);
    assert.throws(() => importBatch(receiver, { ...batch, events: [{ ...batch.events[0]!, schemaVersion: 2 } as never], nextCursor: { installationId: source.installationId, seq: 99 } }));
    assert.equal(receiver.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', source.installationId)!.seq, 2);
    assert.throws(() => appendEvent(ctx, { ...first, payload: { prompt: 'secret' } } as never));
    assert.throws(() => appendEvent(ctx, { ...first, occurredAt: 'not-a-time' }));
    assert.throws(() => appendEvent(ctx, { ...first, nativeSessionId: 'conflicting' }));
    assert.throws(() => ctx.db.run('UPDATE events SET occurred_at = ?', 'changed'));
    await closeApp(ctx);
    ctx = await createApp({ dataDir: join(directory, 'origin'), port: 0 });
    assert.equal(ctx.config.installationId, source.installationId);
    assert.equal(appendEvent(ctx, event('session.end', '2026-11-05T11:00:00.000Z')).cursor.seq, 3);
    const newInstall = randomUUID();
    registerInstallation(receiver, { deviceId: source.deviceId, installationId: newInstall, name: 'test', os: 'test', timezone: 'UTC' });
    const otherSource = { ...source, id: randomUUID(), installationId: newInstall };
    registerSource(receiver, otherSource);
    const other = { ...first, eventId: randomUUID(), installationId: newInstall, sourceId: otherSource.id, originSeq: 1, receivedAt: first.occurredAt };
    assert.equal(importBatch(receiver, { schemaVersion: 1, installationId: newInstall, events: [other], nextCursor: { installationId: newInstall, seq: 1 }, hasMore: false }).inserted, 1);
  } finally { await closeApp(ctx); await closeApp(receiver); await rm(directory, { recursive: true, force: true }); }
});
