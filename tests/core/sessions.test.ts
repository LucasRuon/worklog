import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listSessions, projectSessions, rebuildSessions } from '../../src/core/sessions.js';
import { registerSource } from '../../src/collectors/source-config.js';

test('sessões: eventos atrasados, retomada, compactação, contas, subagentes e rebuild', async () => {
  const f = await fixture();
  try {
    f.emit('session.start', '2026-11-05T09:00Z', { reason: 'startup' });
    f.emit('turn.start', '2026-11-05T09:01Z', { turnId: 'p1' });
    const late = f.emit('turn.end', '2026-11-05T09:05Z', { turnId: 'p1', outcome: 'completed' });
    projectSessions(f.ctx, [late]);
    f.emit('session.start', '2026-11-05T09:03Z', { reason: 'compact' });
    f.emit('session.end', '2026-11-05T09:06Z', { reason: 'other' });
    f.emit('session.start', '2026-11-05T10:00Z', { reason: 'resume' });
    f.emit('turn.start', '2026-11-05T10:01Z', { turnId: 'p2' });
    f.emit('session.start', '2026-11-05T10:02Z', { reason: 'subagent' }, { nativeAgentId: 'agent-one', parentSessionId: 'session-one' });
    f.emit('turn.start', '2026-11-05T10:02Z', {}, { nativeAgentId: 'agent-one', parentSessionId: 'session-one' });
    f.emit('session.end', '2026-11-05T10:04Z', { reason: 'subagent' }, { nativeAgentId: 'agent-one', parentSessionId: 'session-one' });
    const source = { ...f.source, id: randomUUID(), profile: 'another', configPath: `${f.source.configPath}.other` }; registerSource(f.ctx, source);
    f.emit('session.start', '2026-11-05T10:00Z', { reason: 'startup' }, { sourceId: source.id });
    f.emit('session.end', '2026-11-05T10:05Z', { reason: 'other' }, { sourceId: source.id });
    projectSessions(f.ctx, f.allEvents());
    const sessions = listSessions(f.ctx, f.filter);
    assert.equal(sessions.length, 3);
    const parent = sessions.find((session) => session.sourceId === f.source.id && !session.nativeAgentId)!;
    assert.equal(parent.state, 'incomplete');
    assert.equal(parent.endedAt, null);
    assert.equal(parent.lastEventAt, '2026-11-05T10:01:00.000Z');
    const child = sessions.find((session) => session.nativeAgentId)!;
    assert.equal(child.parentSessionId, parent.id);
    const before = JSON.stringify(sessions);
    rebuildSessions(f.ctx);
    assert.equal(JSON.stringify(listSessions(f.ctx, f.filter)), before);
    f.emit('session.interrupt', '2026-11-05T10:06Z', { reason: 'user' });
    projectSessions(f.ctx, f.allEvents());
    assert.equal(listSessions(f.ctx, f.filter).find((session) => session.id === parent.id)!.state, 'interrupted');
  } finally { await f.close(); }
});

test('sessões: esperas pelo humano (pergunta, aprovação) saem da execução do agente', async () => {
  const f = await fixture();
  try {
    const { deriveTime } = await import('../../src/core/time.js');
    f.emit('session.start', '2026-11-05T01:00Z', { reason: 'startup' });
    f.emit('turn.start', '2026-11-05T01:00Z', { turnId: 'p1' });
    f.emit('tool.start', '2026-11-05T01:10Z', { toolName: 'Bash', toolUseId: 'b1' });
    f.emit('tool.end', '2026-11-05T01:12Z', { toolName: 'Bash', toolUseId: 'b1', outcome: 'completed' });
    // Pergunta às 01:20, respondida só às 08:00: a madrugada não é trabalho da IA.
    f.emit('tool.start', '2026-11-05T01:20Z', { toolName: 'AskUserQuestion', toolUseId: 'q1' });
    f.emit('tool.end', '2026-11-05T08:00Z', { toolName: 'AskUserQuestion', toolUseId: 'q1', outcome: 'completed' });
    f.emit('turn.end', '2026-11-05T08:15Z', { turnId: 'p1', outcome: 'completed' });
    // Segunda sessão: pergunta do OpenCode ainda sem resposta quando a sessão termina.
    f.emit('turn.start', '2026-11-05T09:00Z', { turnId: 'p2' }, { nativeSessionId: 'two' });
    f.emit('tool.start', '2026-11-05T09:05Z', { toolName: 'question', toolUseId: 'q2' }, { nativeSessionId: 'two' });
    f.emit('session.end', '2026-11-05T10:00Z', { reason: 'other' }, { nativeSessionId: 'two' });
    projectSessions(f.ctx, f.allEvents());
    const time = deriveTime(f.ctx, f.filter);
    // 01:00–01:20 (20) + 08:00–08:15 (15) + 09:00–09:05 (5).
    assert.equal(time.agentWallMs, 40 * 60_000);
  } finally { await f.close(); }
});
