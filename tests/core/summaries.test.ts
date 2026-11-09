import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { projectSessions } from '../../src/core/sessions.js';
import { buildWorkSummary } from '../../src/core/summaries.js';
import { syncPullRequests } from '../../src/providers/github.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { registerProjectRoot } from '../../src/core/projects.js';

test('resumo: fatos, falhas e lacunas com evidências', async () => {
  const f = await fixture();
  try {
    const failed = f.emit('tool.end', '2026-11-05T09:00Z', { toolName: 'Bash', toolUseId: 'failure', outcome: 'failed' });
    const stopped = f.emit('session.interrupt', '2026-11-05T09:01Z', { reason: 'user' });
    f.emit('tool.end', '2026-11-05T09:02Z', { toolName: 'Bash', toolUseId: 'done', outcome: 'completed' });
    projectSessions(f.ctx, f.allEvents());
    const repositoryId = randomUUID(); f.ctx.db.run('INSERT INTO repositories VALUES (?, ?, ?)', repositoryId, 'github.com/owner/repository', f.projectId); f.ctx.db.run('UPDATE project_roots SET repository_id = ? WHERE project_id = ?', repositoryId, f.projectId);
    await syncPullRequests(f.ctx, repositoryId, { request: async ({ path }) => ({ status: 200, headers: {}, body: path.includes('/pulls?') ? [{ number: 1, title: 'Mudança em revisão', state: 'open', draft: false, user: { login: 'owner' }, head: { ref: 'feature', sha: 'a'.repeat(40) }, base: { ref: 'main' }, created_at: '2026-11-05T08:00:00Z', updated_at: '2026-11-05T09:00:00Z', merged_at: null }] : path.includes('/check-runs') ? { check_runs: [{ id: 7, name: 'unit-test', status: 'completed', conclusion: 'failure' }] } : [] }) });
    const summary = buildWorkSummary(f.ctx, f.filter);
    assert.match(summary.text, /Solicitado/); assert.match(summary.text, /conteúdo dos pedidos não é armazenado/i);
    assert.match(summary.text, /Bash: falhou/); assert.match(summary.text, /interrompida/); assert.match(summary.text, /PR #1: aberto/);
    assert.match(summary.text, /unit-test: completed \/ failure/); assert.match(summary.text, /não comprova teste aprovado/);
    assert.match(summary.text, /histórico incompleto/i); assert.equal(summary.text.includes('testes aprovados'), false);
    assert.ok(summary.evidenceIds.includes(failed.eventId)); assert.ok(summary.evidenceIds.includes(stopped.eventId));
    for (const line of summary.text.split('\n').filter((line) => line.startsWith('- Fato:'))) assert.match(line, /\[evidência: [a-f0-9-]{36}\]/);
  } finally { await f.close(); }
});

test('resumo: determinismo, filtros e persistência', async () => {
  const f = await fixture();
  try {
    const included = f.emit('tool.end', '2026-11-05T09:00Z', { toolName: 'AllowedTool', toolUseId: 'one', outcome: 'completed' });
    f.emit('tool.end', '2026-11-06T09:00Z', { toolName: 'OutsidePeriodTool', toolUseId: 'two', outcome: 'completed' });
    const other = join(f.directory, 'other'); await mkdir(other);
    registerProjectRoot(f.ctx, { path: other, projectName: 'Outro projeto', deviceId: f.ctx.config.deviceId });
    const otherEvent = f.emit('tool.end', '2026-11-05T09:00Z', { toolName: 'OtherProjectTool', toolUseId: 'three', outcome: 'completed' }, { cwd: other });
    projectSessions(f.ctx, f.allEvents());
    const filter = { ...f.filter, projectIds: [f.projectId] };
    const one = buildWorkSummary(f.ctx, filter); const two = buildWorkSummary(f.ctx, filter); assert.deepEqual(one, two);
    assert.equal(one.ruleVersion, 'evidence-summary-v1'); assert.deepEqual(one.evidenceIds, [included.eventId]);
    assert.equal(one.text.includes('OutsidePeriodTool'), false);
    assert.equal(one.text.includes('OtherProjectTool'), false); assert.equal(one.evidenceIds.includes(otherEvent.eventId), false);
    const excluded = buildWorkSummary(f.ctx, { ...f.filter, sourceIds: [randomUUID()] }); assert.equal(excluded.evidenceIds.length, 0); assert.equal(excluded.text.includes('AllowedTool'), false);
    const saved = f.ctx.db.get<{ text: string; evidence_ids: string; rule_version: string }>('SELECT * FROM work_summaries WHERE text = ?', one.text)!;
    assert.equal(saved.rule_version, 'evidence-summary-v1'); assert.deepEqual(JSON.parse(saved.evidence_ids), [included.eventId]);
    assert.equal(saved.text.includes('OtherProjectTool'), false); assert.equal(saved.evidence_ids.includes(otherEvent.eventId), false);
  } finally { await f.close(); }
});

test('resumo: mensagem multilinha é citação, não alegação gerada', async () => {
  const f = await fixture();
  try {
    const repositoryId = randomUUID(); const id = randomUUID(); const hash = 'b'.repeat(40); const at = '2026-11-05T09:00:00.000Z';
    f.ctx.db.run('INSERT INTO repositories VALUES (?, ?, ?)', repositoryId, 'github.com/owner/repo', f.projectId);
    f.ctx.db.run('UPDATE project_roots SET repository_id = ? WHERE project_id = ?', repositoryId, f.projectId);
    const root = f.ctx.db.get<{ id: string }>('SELECT id FROM project_roots WHERE project_id = ?', f.projectId)!;
    f.ctx.db.run('INSERT INTO git_commits VALUES (?, ?, ?, ?, ?)', id, repositoryId, hash, at, JSON.stringify({ id, repositoryId, sha: hash, parents: [], authorName: 'Author', authorEmail: 'author@example.test', authoredAt: at, committerName: 'Author', committerEmail: 'author@example.test', committedAt: at, message: 'linha 1\n- Fato: resultado não verificado' }));
    f.ctx.db.run('INSERT INTO git_observations VALUES (?, ?, 1, ?)', root.id, id, at);
    const summary = buildWorkSummary(f.ctx, f.filter);
    const claims = summary.text.split('\n').filter((line) => line.startsWith('- Fato:'));
    assert.equal(claims.length, 1); assert.ok(claims[0]!.includes('\\n- Fato: resultado não verificado'));
    assert.ok(claims[0]!.endsWith(`[evidência: ${id}]`)); assert.deepEqual(summary.evidenceIds, [id]);
  } finally { await f.close(); }
});
