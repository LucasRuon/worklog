import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { addManualTime, listManualTime, removeManualTime } from '../../src/core/manual-time.js';

const NOW = Date.parse('2026-11-09T15:00:00.000Z');

test('tempo manual soma à dedicação automática sem afetar outros projetos e é removido por compensação', async () => {
  const f = await fixture();
  try {
    const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
    const otherId = registerProjectRoot(f.ctx, { projectName: 'Outro', deviceId: f.ctx.config.deviceId, path: otherRoot });
    f.emit('turn.submit', '2026-11-05T12:00Z', {}, { nativeSessionId: 'a' });
    f.emit('turn.submit', '2026-11-05T12:00Z', {}, { nativeSessionId: 'b', cwd: otherRoot });
    projectSessions(f.ctx, f.allEvents());
    const day = { ...f.filter, from: '2026-11-05T03:00:00.000Z', to: '2026-11-06T03:00:00.000Z' };
    assert.equal(deriveTime(f.ctx, { ...day, projectIds: [f.projectId] }).humanEstimatedMs, 2.5 * 60_000);

    const id = addManualTime(f.ctx, { projectId: f.projectId, date: '2026-11-05', minutes: 90, note: '  Revisão sem IA ' }, NOW);
    const own = deriveTime(f.ctx, { ...day, projectIds: [f.projectId] });
    assert.equal(own.humanManualMs, 90 * 60_000);
    assert.equal(own.humanEstimatedMs, 2.5 * 60_000, 'automático preservado');
    const other = deriveTime(f.ctx, { ...day, projectIds: [otherId] });
    assert.equal(other.humanManualMs, 0); assert.equal(other.humanEstimatedMs, 2.5 * 60_000);
    assert.equal(deriveTime(f.ctx, day).humanManualMs, 90 * 60_000);
    // Dia local: 05/11 em São Paulo começa às 03:00 UTC; o dia anterior não inclui o lançamento.
    assert.equal(deriveTime(f.ctx, { ...f.filter, from: '2026-11-04T03:00:00.000Z', to: '2026-11-05T03:00:00.000Z' }).humanManualMs, 0);
    assert.deepEqual(listManualTime(f.ctx, day).map((item) => [item.date, item.durationMs, item.note]), [['2026-11-05', 90 * 60_000, 'Revisão sem IA']]);

    removeManualTime(f.ctx, id, NOW);
    assert.equal(deriveTime(f.ctx, day).humanManualMs, 0);
    assert.equal(listManualTime(f.ctx, day).length, 0);
    assert.throws(() => removeManualTime(f.ctx, id, NOW), /MANUAL_TIME_NOT_FOUND/);
    assert.throws(() => f.ctx.db.run('DELETE FROM manual_time'), /immutable manual time/);
  } finally { await f.close(); }
});

test('tempo manual recusa valores inválidos, datas futuras e projeto desconhecido', async () => {
  const f = await fixture();
  try {
    const base = { projectId: f.projectId, date: '2026-11-09', minutes: 30 };
    assert.throws(() => addManualTime(f.ctx, { ...base, minutes: 0 }, NOW), /INVALID_MANUAL_TIME/);
    assert.throws(() => addManualTime(f.ctx, { ...base, minutes: 24 * 60 + 1 }, NOW), /INVALID_MANUAL_TIME/);
    assert.throws(() => addManualTime(f.ctx, { ...base, date: '2026-11-10' }, NOW), /INVALID_MANUAL_TIME/);
    assert.throws(() => addManualTime(f.ctx, { ...base, date: '2026-02-30' }, NOW), /INVALID_DATE/);
    assert.throws(() => addManualTime(f.ctx, { ...base, extra: true }, NOW));
    assert.throws(() => addManualTime(f.ctx, { ...base, projectId: '00000000-0000-4000-8000-000000000000' }, NOW), /UNKNOWN_PROJECT/);
    assert.ok(addManualTime(f.ctx, base, NOW));
  } finally { await f.close(); }
});
