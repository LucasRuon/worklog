import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { applyAdjustment, undoAdjustment, saveNote, adjustmentRevision, listAdjustments } from '../../src/core/adjustments.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { deriveTime } from '../../src/core/time.js';
import { queryReport, saveReport, savedReport } from '../../src/reports/query.js';

test('ajustes: atribuição global, cortes e reconciliação', async () => {
  const f = await fixture();
  try {
    const other = join(f.directory, 'other'); await mkdir(other); const projectB = registerProjectRoot(f.ctx, { path: other, projectName: 'B', deviceId: f.ctx.config.deviceId });
    f.emit('human.interaction', '2026-11-05T09:00Z', { kind: 'explicit' });
    const filter = { ...f.filter, projectIds: [f.projectId, projectB], includeUnassigned: true };
    assert.equal(deriveTime(f.ctx, filter).humanEstimatedMs, 300000);
    const id = applyAdjustment(f.ctx, { projectId: projectB, start: '2026-11-05T09:00:00.000Z', end: '2026-11-05T09:05:00.000Z', nextMs: 120001, reason: 'Atribuição corrigida', revision: 0 });
    const totals = deriveTime(f.ctx, filter); assert.equal(totals.humanEstimatedMs, 0); assert.equal(totals.humanAdjustedMs, 120001); assert.equal(totals.unassignedHumanMs, 0);
    assert.equal(deriveTime(f.ctx, { ...filter, projectIds: [f.projectId] }).humanAdjustedMs, 0);
    assert.equal(deriveTime(f.ctx, { ...filter, projectIds: [projectB] }).humanAdjustedMs, 120001);
    const left = deriveTime(f.ctx, { ...filter, to: '2026-11-05T09:02:30.000Z' });
    const right = deriveTime(f.ctx, { ...filter, from: '2026-11-05T09:02:30.000Z' });
    assert.equal(left.humanAdjustedMs + right.humanAdjustedMs, 120001);
    assert.equal(listAdjustments(f.ctx, filter)[0]!.id, id); assert.equal(listAdjustments(f.ctx, filter)[0]!.previousMs, 300000);
  } finally { await f.close(); }
});

test('ajustes: conflito, concorrência e desfazer imutável', async () => {
  const f = await fixture();
  try {
    f.emit('human.interaction', '2026-11-05T09:00Z', { kind: 'explicit' }); const raw = JSON.stringify(f.allEvents());
    const input = { projectId: f.projectId, start: '2026-11-05T09:00:00.000Z', end: '2026-11-05T09:05:00.000Z', nextMs: 60000, reason: 'Correção', revision: 0 };
    const id = applyAdjustment(f.ctx, input); assert.equal(adjustmentRevision(f.ctx), 1);
    assert.throws(() => applyAdjustment(f.ctx, { ...input, revision: 1 }), { code: 'ADJUSTMENT_OVERLAP' });
    assert.throws(() => applyAdjustment(f.ctx, { ...input, start: '2026-11-05T09:06:00.000Z', end: '2026-11-05T09:07:00.000Z' }), { code: 'ADJUSTMENT_CHANGED' });
    undoAdjustment(f.ctx, id, { revision: 1, reason: 'Restaurar estimativa' });
    assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 300000); assert.equal(deriveTime(f.ctx, f.filter).humanAdjustedMs, 0);
    assert.equal(JSON.stringify(f.allEvents()), raw);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM time_adjustments')!.n, 2);
    assert.throws(() => f.ctx.db.run('DELETE FROM time_adjustments WHERE id = ?', id));
    assert.throws(() => undoAdjustment(f.ctx, id, { revision: 2, reason: 'Repetido' }), { code: 'ADJUSTMENT_ALREADY_UNDONE' });
    assert.throws(() => applyAdjustment(f.ctx, { ...input, nextMs: 300001, revision: 2 }), { code: 'INVALID_ADJUSTMENT' });
    assert.throws(() => applyAdjustment(f.ctx, { ...input, start: new Date(Date.now() - 60000).toISOString(), end: new Date(Date.now() + 60000).toISOString(), nextMs: 1000, revision: 2 }), { code: 'INVALID_ADJUSTMENT' });
  } finally { await f.close(); }
});

test('notas: versões, classificação e relatório congelado', async () => {
  const f = await fixture();
  try {
    saveNote(f.ctx, f.projectId, '  =FÓRMULA\nNota á', { revision: 0, classification: 'context', occurredAt: '2026-11-05T09:00:00.000Z' });
    const options = { sessions: false, notes: true, files: false, commits: false, prs: false, fullDiff: false };
    const filter = { ...f.filter, projectIds: [f.projectId] };
    const report = queryReport(f.ctx, filter, options); const snapshot = saveReport(f.ctx, report);
    assert.equal(report.notes.length, 1); assert.equal(report.notes[0]!.classification, 'context');
    assert.throws(() => saveNote(f.ctx, f.projectId, 'Concorrente', { revision: 0 }), { code: 'NOTE_CHANGED' });
    saveNote(f.ctx, f.projectId, 'Texto revisado', { revision: 1, classification: 'pending', occurredAt: '2026-11-05T09:00:00.000Z' });
    assert.equal(savedReport(f.ctx, snapshot).notes[0]!.text, '  =FÓRMULA\nNota á');
    assert.equal(queryReport(f.ctx, filter, options).notes[0]!.text, 'Texto revisado');
    assert.equal(queryReport(f.ctx, { ...filter, from: '2026-11-05T10:00:00.000Z' }, options).notes.length, 0);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM note_versions')!.n, 2);
    assert.throws(() => saveNote(f.ctx, randomUUID(), 'Target inexistente', { revision: 0 }), { code: 'NOTE_TARGET_UNAVAILABLE', status: 404 });
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM note_versions')!.n, 2);
  } finally { await f.close(); }
});
