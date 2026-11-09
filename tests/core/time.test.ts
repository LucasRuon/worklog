import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fixture } from '../helpers.js';
import { projectSessions } from '../../src/core/sessions.js';
import { deriveTime, unionDuration } from '../../src/core/time.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { importBatch, registerInstallation } from '../../src/core/events.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { recordFocus } from '../../src/collectors/focus.js';

test('tempo: execução paralela 120 min acumulados / 90 min de relógio sem fabricar dedicação', async () => {
  const f = await fixture();
  try {
    for (const [id, start, end] of [['one', '09:00', '10:00'], ['two', '09:30', '10:30']]) {
      f.emit('session.start', `2026-11-05T${start}Z`, { reason: 'startup' }, { nativeSessionId: id });
      f.emit('turn.start', `2026-11-05T${start}Z`, {}, { nativeSessionId: id });
      f.emit('turn.end', `2026-11-05T${end}Z`, { outcome: 'completed' }, { nativeSessionId: id });
      f.emit('session.end', `2026-11-05T${end}Z`, { reason: 'other' }, { nativeSessionId: id });
    }
    projectSessions(f.ctx, f.allEvents());
    const summary = deriveTime(f.ctx, f.filter);
    assert.equal(summary.agentAccumulatedMs, 120 * 60_000);
    assert.equal(summary.agentWallMs, 90 * 60_000);
    assert.equal(summary.humanEstimatedMs, 0);
    assert.equal(unionDuration([{ start: '2026-11-05T09:00:00.000Z', end: '2026-11-05T10:00:00.000Z', sessionId: 'a', quality: 'observed' }, { start: '2026-11-05T09:30:00.000Z', end: '2026-11-05T10:30:00.000Z', sessionId: 'b', quality: 'observed' }]), 90 * 60_000);
  } finally { await f.close(); }
});

test('dedicação global em máquinas concorrentes permanece única e ambiguidade não é repartida', async () => {
  const f = await fixture();
  try {
    const local = f.emit('human.interaction', '2026-11-05T09:00Z', { kind: 'explicit' });
    const deviceId = randomUUID(); const installationId = randomUUID(); const sourceId = randomUUID();
    registerInstallation(f.ctx, { deviceId, installationId, name: 'remote', os: 'linux', timezone: 'UTC' });
    registerSource(f.ctx, { ...f.source, id: sourceId, installationId, deviceId });
    const projectId = registerProjectRoot(f.ctx, { projectName: 'Remoto', deviceId, path: '/remote/project' });
    const event = { ...local, eventId: randomUUID(), sourceId, deviceId, installationId, cwd: '/remote/project', originSeq: 1 };
    importBatch(f.ctx, { schemaVersion: 1, installationId, events: [event], nextCursor: { installationId, seq: 1 }, hasMore: false });
    const summary = deriveTime(f.ctx, f.filter);
    assert.equal(summary.humanEstimatedMs, 0);
    assert.equal(summary.unassignedHumanMs, 5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, deviceIds: [f.ctx.config.deviceId] }).humanEstimatedMs, 0);
    assert.equal(deriveTime(f.ctx, { ...f.filter, deviceIds: [f.ctx.config.deviceId] }).unassignedHumanMs, 5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [projectId] }).humanEstimatedMs, 0);
    const { receivedAt: _, originSeq: __, ...input } = event;
    assert.throws(() => recordFocus(f.ctx, input), /INVALID_FOCUS/);
    registerProjectRoot(f.ctx, { projectName: 'Local associado', projectId: f.projectId, deviceId, path: '/remote/project' });
    projectSessions(f.ctx, f.allEvents());
    const associated = deriveTime(f.ctx, f.filter);
    assert.equal(associated.humanEstimatedMs, 5 * 60_000);
    assert.equal(associated.unassignedHumanMs, 0);
  } finally { await f.close(); }
});

test('dedicação: janela, foco ambíguo, pausa, troca de projeto e corte de relatório', async () => {
  const f = await fixture();
  try {
    const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
    const otherId = registerProjectRoot(f.ctx, { projectName: 'Outro', deviceId: f.ctx.config.deviceId, path: otherRoot });
    f.emit('human.interaction', '2026-11-05T09:00Z', { kind: 'explicit' });
    f.emit('machine.idle', '2026-11-05T09:03Z', { reason: 'sleep' });
    f.emit('human.interaction', '2026-11-05T09:10Z', { kind: 'explicit' });
    f.emit('focus.change', '2026-11-05T09:12Z', { confidence: 'unresolved' });
    f.emit('human.interaction', '2026-11-05T09:20Z', { kind: 'explicit' }, { cwd: otherRoot });
    f.emit('human.interaction', '2026-11-05T09:22Z', { kind: 'explicit' });
    projectSessions(f.ctx, f.allEvents());
    const summary = deriveTime(f.ctx, f.filter);
    assert.equal(summary.humanEstimatedMs, 12 * 60_000);
    assert.equal(summary.unassignedHumanMs, 3 * 60_000);
    const other = deriveTime(f.ctx, { ...f.filter, projectIds: [otherId] });
    assert.equal(other.humanEstimatedMs, 2 * 60_000);
    const clipped = deriveTime(f.ctx, { ...f.filter, from: '2026-11-05T09:02:00.000Z', to: '2026-11-05T09:04:00.000Z' });
    assert.equal(clipped.humanEstimatedMs, 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, timezone: 'America/New_York' }).humanEstimatedMs, summary.humanEstimatedMs);
    assert.throws(() => deriveTime(f.ctx, { ...f.filter, timezone: 'invalid-zone' }));
    f.emit('machine.idle', '2026-11-05T09:24Z', { reason: 'lock' });
    assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 9 * 60_000);
  } finally { await f.close(); }
});
