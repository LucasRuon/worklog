import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { appendEvent } from '../../src/core/events.js';
import { describeAgent, exportBatch, importEnvelope } from '../../src/remote/protocol.js';
import { registerRemoteHost, shellQuote, syncHost, type ssh } from '../../src/remote/ssh.js';
import { deriveTime } from '../../src/core/time.js';
import { DomainError } from '../../src/core/contracts.js';
import { exportGitPacket } from '../../src/remote/git.js';
import { exportFilePacket } from '../../src/remote/files.js';
import { configure } from '../../src/core/configuration.js';

test('SSH: backlog >500, perda após commit, reconexão, instalação nova e JSON truncado', async () => {
  const remote = await fixture(); const local = await fixture(); const replacement = await fixture();
  let active = remote; let failAfterCommit = true; let truncated = false;
  const transport: typeof ssh = async (_host, argv) => {
    const action = argv[3];
    if (action === 'describe') return JSON.stringify(describeAgent(active.ctx));
    if (action === 'git') return JSON.stringify(exportGitPacket(active.ctx));
    if (action === 'files') return JSON.stringify(exportFilePacket(active.ctx));
    const after = Number(argv[argv.indexOf('--after') + 1]);
    const packet = exportBatch(active.ctx, after, 500);
    if (truncated) return '{"protocolVersion":';
    if (failAfterCommit) { failAfterCommit = false; importEnvelope(local.ctx, packet); throw new DomainError('SSH_UNAVAILABLE'); }
    return JSON.stringify(packet);
  };
  try {
    for (let index = 0; index < 520; index++) appendEvent(remote.ctx, { schemaVersion: 1, eventId: randomUUID(), deviceId: remote.source.deviceId, installationId: remote.source.installationId, sourceId: remote.source.id, tool: 'claude', type: 'turn.submit', occurredAt: new Date(Date.now() - 100_000 + index).toISOString(), nativeSessionId: 'remote-session', cwd: realpathSync(remote.root), payload: { turnId: `p${index}` } });
    registerRemoteHost(local.ctx, { host: 'macmini', nodePath: '/runtime/node', appPath: '/runtime/worklog', dataDir: '/data/worklog' });
    configure(local.ctx, { revision: 0, syncIntervalMs: 30000 });
    await assert.rejects(syncHost(local.ctx, 'macmini', { transport }));
    assert.equal(local.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 500);
    const recovered = await syncHost(local.ctx, 'macmini', { transport });
    assert.equal(recovered.cursor.seq, 520);
    assert.equal(local.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 520);
    const beforeSync = Date.now(); await syncHost(local.ctx, 'macmini', { transport });
    const scheduled = local.ctx.db.get<{ next_sync_ms: number }>('SELECT next_sync_ms FROM remote_hosts WHERE host = ?', 'macmini')!.next_sync_ms;
    assert.ok(scheduled >= beforeSync + 30000); assert.ok(scheduled <= Date.now() + 30000);
    assert.equal(local.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 520);
    truncated = true;
    await assert.rejects(syncHost(local.ctx, 'macmini', { transport }), /REMOTE_RESPONSE_INVALID/);
    assert.equal(local.ctx.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', remote.source.installationId)!.seq, 520);
    truncated = false; active = replacement;
    replacement.emit('session.start', new Date().toISOString(), { reason: 'startup' });
    const fresh = await syncHost(local.ctx, 'macmini', { transport });
    assert.equal(fresh.cursor.seq, 1); assert.equal(fresh.cursor.installationId, replacement.source.installationId);
    assert.equal(local.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, 521);
    assert.equal(shellQuote("/path/with 'quote'"), "'/path/with '\\''quote'\\'''" );
  } finally { await remote.close(); await local.close(); await replacement.close(); }
});

test('clock skew permanece registrado por evento e não gera dedicação humana remota', async () => {
  const remote = await fixture(); const local = await fixture();
  try {
    const at = Date.now() - 60_000;
    remote.emit('human.interaction', new Date(at).toISOString(), { kind: 'explicit' }, { cwd: realpathSync(remote.root) });
    const packet = exportBatch(remote.ctx, 0);
    importEnvelope(local.ctx, packet, 120_000);
    const summary = deriveTime(local.ctx, { projectIds: [], from: new Date(at - 1).toISOString(), to: new Date().toISOString(), timezone: 'UTC' });
    assert.equal(summary.humanEstimatedMs, 0);
    assert.equal(summary.unassignedHumanMs, 0);
    assert.equal(local.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM event_quality')!.n, 1);
  } finally { await remote.close(); await local.close(); }
});
