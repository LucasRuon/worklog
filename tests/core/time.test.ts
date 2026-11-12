import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fixture } from '../helpers.js';
import { projectSessions } from '../../src/core/sessions.js';
import { deriveSeries, deriveTime, unionDuration } from '../../src/core/time.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { importBatch, registerInstallation } from '../../src/core/events.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { recordFocus, signalHuman } from '../../src/collectors/focus.js';

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

test('dedicação global em máquinas concorrentes divide projetos simultâneos sem duplicar horas', async () => {
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
    // Dois projetos ao mesmo tempo: 5 min de relógio divididos 2,5 + 2,5, nunca 10 min.
    assert.equal(summary.humanEstimatedMs, 5 * 60_000);
    assert.equal(summary.unassignedHumanMs, 0);
    assert.equal(deriveTime(f.ctx, { ...f.filter, deviceIds: [f.ctx.config.deviceId] }).humanEstimatedMs, 2.5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, deviceIds: [f.ctx.config.deviceId] }).unassignedHumanMs, 0);
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [projectId] }).humanEstimatedMs, 2.5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [f.projectId] }).humanEstimatedMs, 2.5 * 60_000);
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

test('série: IA no relógio por dia e dia da semana × hora no fuso local, sem duplicar paralelos', async () => {
  const f = await fixture();
  try {
    for (const [id, start, end] of [['one', '2026-11-05T09:00Z', '2026-11-05T10:00Z'], ['two', '2026-11-05T09:30Z', '2026-11-05T10:30Z'], ['night', '2026-11-06T02:30Z', '2026-11-06T03:30Z']] as const) {
      f.emit('session.start', start, { reason: 'startup' }, { nativeSessionId: id });
      f.emit('turn.start', start, {}, { nativeSessionId: id });
      f.emit('turn.end', end, { outcome: 'completed' }, { nativeSessionId: id });
      f.emit('session.end', end, { reason: 'other' }, { nativeSessionId: id });
    }
    projectSessions(f.ctx, f.allEvents());
    const series = deriveSeries(f.ctx, { ...f.filter, from: '2026-11-05T03:00:00.000Z', to: '2026-11-07T03:00:00.000Z' });
    assert.equal(series.truncated, false);
    assert.deepEqual(series.days, [
      { date: '2026-11-05', agentWallMs: 120 * 60_000, sessionCount: 3 },
      { date: '2026-11-06', agentWallMs: 30 * 60_000, sessionCount: 1 },
    ]);
    const cell = (weekday: number, hour: number) => series.heatmap.find((item) => item.weekday === weekday && item.hour === hour)!.agentWallMs;
    assert.equal(series.heatmap.length, 7 * 24);
    assert.equal(cell(4, 6), 60 * 60_000);
    assert.equal(cell(4, 7), 30 * 60_000);
    assert.equal(cell(4, 23), 30 * 60_000);
    assert.equal(cell(5, 0), 30 * 60_000);
    assert.equal(series.heatmap.reduce((total, item) => total + item.agentWallMs, 0), 150 * 60_000);
    const period = { from: '2026-11-05T03:00:00.000Z', to: '2026-11-07T03:00:00.000Z' };
    assert.equal(deriveSeries(f.ctx, { ...f.filter, ...period, tools: ['codex'] }).days[0]!.agentWallMs, 0);
    assert.equal(deriveSeries(f.ctx, { ...f.filter, ...period, tools: [f.source.tool] }).days[0]!.agentWallMs, 120 * 60_000);
  } finally { await f.close(); }
});

test('presença: projeto pelo contexto recente, paralelos divididos, ausência bloqueia automações e legado preservado', async () => {
  const f = await fixture();
  try {
    const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
    const otherId = registerProjectRoot(f.ctx, { projectName: 'Outro', deviceId: f.ctx.config.deviceId, path: otherRoot });
    // Histórico legado (sem retorno observado ainda): prompt abre a janela de 5 min mesmo após ociosidade.
    f.emit('machine.idle', '2026-11-05T08:00Z', { reason: 'idle' });
    f.emit('turn.submit', '2026-11-05T08:10Z', {}, { nativeSessionId: 'legacy' });
    // Retorno observado inicia a presença: dali em diante conta todo o tempo na máquina, não só 5 min por prompt.
    f.emit('machine.resume', '2026-11-05T09:00Z', {});
    f.emit('turn.submit', '2026-11-05T09:00Z', {}, { nativeSessionId: 'a' });
    f.emit('turn.submit', '2026-11-05T09:02Z', {}, { nativeSessionId: 'b', cwd: otherRoot });
    // Subagente não é contexto do humano.
    f.emit('turn.submit', '2026-11-05T09:03Z', {}, { nativeSessionId: 'child', parentSessionId: 'a' });
    // Ausente: prompt automático às 10:05 não conta; volta às 10:30.
    f.emit('machine.idle', '2026-11-05T10:00Z', { reason: 'lock' });
    f.emit('turn.submit', '2026-11-05T10:05Z', {}, { nativeSessionId: 'a' });
    f.emit('machine.resume', '2026-11-05T10:30Z', {});
    f.emit('turn.submit', '2026-11-05T10:31Z', {}, { nativeSessionId: 'a' });
    f.emit('machine.idle', '2026-11-05T11:30Z', { reason: 'lock' });
    projectSessions(f.ctx, f.allEvents());
    const summary = deriveTime(f.ctx, f.filter);
    // Teste: legado 5 + 09:00–09:02 (2) + metade de 09:02–09:30 (14) + 10:31–11:01 (30) = 51.
    // Outro: metade de 09:02–09:30 (14) + 09:30–09:32 (2) = 16. Contexto expira após 30 min sem atividade.
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [f.projectId] }).humanEstimatedMs, 51 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [otherId] }).humanEstimatedMs, 16 * 60_000);
    assert.equal(summary.humanEstimatedMs, 67 * 60_000);
    // Presente sem projeto recente: 09:32–10:00, 10:30–10:31 e 11:01–11:30 ficam visíveis como não atribuídos.
    assert.equal(summary.unassignedHumanMs, 58 * 60_000);
    assert.equal(summary.ruleVersion, 'presence-attribution-v2');
    assert.equal(summary.agentWallMs, 0);
  } finally { await f.close(); }
});

test('presença: agente a noite toda sem ninguém na máquina não gera dedicação; a volta revisa a entrega', async () => {
  const f = await fixture();
  try {
    f.emit('machine.resume', '2026-11-05T09:00Z', {});
    f.emit('turn.submit', '2026-11-05T09:00Z', {}, { nativeSessionId: 'night' });
    f.emit('turn.start', '2026-11-05T09:00Z', {}, { nativeSessionId: 'night' });
    f.emit('turn.end', '2026-11-05T09:10Z', { outcome: 'completed' }, { nativeSessionId: 'night' });
    // Ociosidade detectada às 09:40 com limite de 5 min: o último uso real foi 09:35.
    f.emit('machine.idle', '2026-11-05T09:40Z', { reason: 'idle' });
    // Agente roda 22:00–23:00 com a máquina parada.
    f.emit('turn.start', '2026-11-05T22:00Z', {}, { nativeSessionId: 'night' });
    f.emit('turn.end', '2026-11-05T23:00Z', { outcome: 'completed' }, { nativeSessionId: 'night' });
    // Volta às 23:10 e revisa a entrega até o contexto expirar (23:30); depois, presença sem projeto até 23:45.
    f.emit('machine.resume', '2026-11-05T23:10Z', {});
    f.emit('machine.idle', '2026-11-05T23:45Z', { reason: 'lock' });
    projectSessions(f.ctx, f.allEvents());
    const summary = deriveTime(f.ctx, f.filter);
    assert.equal(summary.humanEstimatedMs, (35 + 20) * 60_000);
    assert.equal(summary.unassignedHumanMs, 15 * 60_000);
    assert.equal(summary.agentWallMs, 70 * 60_000);
    // Só a noite: IA trabalhou, humano não.
    assert.equal(deriveTime(f.ctx, { ...f.filter, from: '2026-11-05T21:00:00.000Z', to: '2026-11-05T23:05:00.000Z' }).humanEstimatedMs, 0);
  } finally { await f.close(); }
});

test('presença: sinal explícito e foco resolvem o projeto; foco ambíguo deixa sem projeto; arquivos dão contexto', async () => {
  const f = await fixture();
  try {
    const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
    const otherId = registerProjectRoot(f.ctx, { projectName: 'Outro', deviceId: f.ctx.config.deviceId, path: otherRoot });
    f.emit('machine.resume', '2026-11-05T09:00Z', {});
    f.emit('file.change', '2026-11-05T09:00Z', { rootId: randomUUID(), path: 'a.ts', operation: 'edit' }, { cwd: otherRoot });
    f.emit('turn.submit', '2026-11-05T09:05Z', {}, { nativeSessionId: 'a' });
    f.emit('human.interaction', '2026-11-05T09:10Z', { kind: 'explicit' });
    f.emit('focus.change', '2026-11-05T09:20Z', { confidence: 'unresolved' });
    f.emit('focus.change', '2026-11-05T09:25Z', { confidence: 'observed', projectId: otherId }, { cwd: undefined });
    f.emit('machine.idle', '2026-11-05T09:30Z', { reason: 'lock' });
    projectSessions(f.ctx, f.allEvents());
    const summary = deriveTime(f.ctx, f.filter);
    // Teste: metade de 09:05–09:10 + 09:10–09:20 exclusivo = 12,5. Outro: 09:00–09:05 + metade + 09:25–09:30 = 12,5.
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [f.projectId] }).humanEstimatedMs, 12.5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...f.filter, projectIds: [otherId] }).humanEstimatedMs, 12.5 * 60_000);
    assert.equal(summary.unassignedHumanMs, 5 * 60_000);
  } finally { await f.close(); }
});

test('sinal explícito aceita projeto só do macmini (sem pasta local) e recusa projeto inexistente', async () => {
  const f = await fixture();
  try {
    const deviceId = randomUUID(); const installationId = randomUUID();
    registerInstallation(f.ctx, { deviceId, installationId, name: 'macmini', os: 'linux', timezone: 'UTC' });
    const remoteId = registerProjectRoot(f.ctx, { projectName: 'Só no macmini', deviceId, path: '/home/lucas/remoto' });
    signalHuman(f.ctx, remoteId);
    const event = f.allEvents().find((item) => item.type === 'human.interaction')!;
    assert.equal(event.type === 'human.interaction' && event.payload.projectId, remoteId); assert.equal(event.cwd, undefined);
    const now = Date.now(); const filter = { ...f.filter, from: new Date(now - 60_000).toISOString(), to: new Date(now + 3_600_000).toISOString() };
    assert.equal(deriveTime(f.ctx, { ...filter, projectIds: [remoteId] }, now + 10 * 60_000).humanEstimatedMs, 5 * 60_000);
    assert.equal(deriveTime(f.ctx, { ...filter, projectIds: [f.projectId] }, now + 10 * 60_000).humanEstimatedMs, 0);
    assert.throws(() => signalHuman(f.ctx, randomUUID()), /UNKNOWN_PROJECT/);
  } finally { await f.close(); }
});
