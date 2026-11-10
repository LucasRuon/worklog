import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { projectSessions } from '../../src/core/sessions.js';
import { liveState } from '../../src/core/live.js';
import { validateEvent } from '../../src/core/events.js';
import { configure, operatingConfig } from '../../src/core/configuration.js';
import { normalizeClaude } from '../../src/collectors/claude.js';

const feedQuery = (f: Awaited<ReturnType<typeof fixture>>) => ({ tables: 'events e LEFT JOIN event_projects p ON p.event_id = e.event_id JOIN sources s ON s.id = e.source_id', clauses: ['e.occurred_at >= ?', 'e.occurred_at < ?'], parameters: [f.filter.from, f.filter.to] });

test('ao vivo: sessão em execução mostra chamada aberta, turno e task; aguardando expira em 30 min', async () => {
  const f = await fixture();
  try {
    f.emit('session.start', '2026-11-05T12:00:00.000Z', { reason: 'startup' });
    f.emit('turn.start', '2026-11-05T12:01:00.000Z', { turnId: 't1' });
    f.emit('task.update', '2026-11-05T12:01:05.000Z', { status: 'pending', title: 'Criar endpoint', taskId: '1' });
    f.emit('task.update', '2026-11-05T12:01:10.000Z', { status: 'in_progress', taskId: '1' });
    f.emit('task.update', '2026-11-05T12:01:20.000Z', { status: 'pending', title: 'Escrever testes', taskId: '2' });
    f.emit('tool.start', '2026-11-05T12:02:00.000Z', { toolName: 'Read', toolUseId: 'a' });
    f.emit('tool.end', '2026-11-05T12:02:01.000Z', { toolName: 'Read', toolUseId: 'a', outcome: 'completed' });
    f.emit('tool.start', '2026-11-05T12:03:00.000Z', { toolName: 'Bash', toolUseId: 'b' });
    projectSessions(f.ctx, f.allEvents());
    const now = Date.parse('2026-11-05T12:03:30.000Z');
    const state = liveState(f.ctx, { ...f.filter, includeUnassigned: true }, feedQuery(f), true, now);
    assert.equal(state.sessions.length, 1);
    const [session] = state.sessions;
    assert.equal(session!.state, 'running');
    assert.equal(session!.turnStartedAt, '2026-11-05T12:01:00.000Z');
    assert.deepEqual(session!.calls, [{ name: 'Bash', startedAt: '2026-11-05T12:03:00.000Z' }]);
    // A task criada depois não tira de cena a que está em andamento; o título vem do TaskCreate pelo taskId.
    assert.deepEqual(session!.task, { title: 'Criar endpoint', status: 'in_progress', at: '2026-11-05T12:01:10.000Z' });
    assert.deepEqual(session!.recentCalls, [{ name: 'Read', startedAt: '2026-11-05T12:02:00.000Z', endedAt: '2026-11-05T12:02:01.000Z', outcome: 'completed' }]);
    assert.deepEqual(session!.tasks.map((task) => [task.title, task.status]), [['Escrever testes', 'pending'], ['Criar endpoint', 'in_progress']]);
    assert.equal(session!.turns, 0);
    assert.equal(state.feed[0]!.type, 'tool.start');
    assert.equal(state.feed.some((item) => item.type === 'turn.start'), false);

    f.emit('tool.end', '2026-11-05T12:04:00.000Z', { toolName: 'Bash', toolUseId: 'b', outcome: 'completed' });
    f.emit('turn.end', '2026-11-05T12:05:00.000Z', { turnId: 't1', outcome: 'completed' });
    projectSessions(f.ctx, f.allEvents());
    const waiting = liveState(f.ctx, { ...f.filter, includeUnassigned: true }, feedQuery(f), true, Date.parse('2026-11-05T12:10:00.000Z'));
    assert.equal(waiting.sessions[0]!.state, 'waiting');
    assert.deepEqual(waiting.sessions[0]!.calls, []);
    assert.equal(waiting.sessions[0]!.turnStartedAt, null);
    assert.equal(liveState(f.ctx, { ...f.filter, includeUnassigned: true }, feedQuery(f), true, Date.parse('2026-11-05T12:40:00.000Z')).sessions.length, 0);
  } finally { await f.close(); }
});

test('tasks: captura só com opt-in, apenas título curto e sem descrição', async () => {
  const f = await fixture();
  try {
    assert.equal(operatingConfig(f.ctx).captureTaskTitles, false);
    const base = { cwd: f.root, session_id: 'native', timestamp: '2026-11-05T09:00:00.000Z', tool_use_id: 'call' };
    const todo = { ...base, hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'Feito', status: 'completed', activeForm: 'Fazendo' }, { content: 'Implementar painel', status: 'in_progress', activeForm: 'Implementando\n painel   ao vivo' }] } };
    assert.equal(normalizeClaude(f.source, todo).some((event) => event.type === 'task.update'), false);
    const captured = normalizeClaude(f.source, todo, undefined, { taskTitles: true }).find((event) => event.type === 'task.update');
    assert.deepEqual(captured?.payload, { status: 'in_progress', title: 'Implementando painel ao vivo' });
    const create = normalizeClaude(f.source, { ...base, hook_event_name: 'PostToolUse', tool_name: 'TaskCreate', tool_input: { subject: 'x'.repeat(400), description: 'DESCRICAO_NAO_GRAVADA' }, tool_response: { task: { id: '7' } } }, undefined, { taskTitles: true });
    const task = create.find((event) => event.type === 'task.update');
    assert.equal(task?.type === 'task.update' && task.payload.title?.length, 160);
    assert.equal(task?.type === 'task.update' && task.payload.taskId, '7');
    assert.equal(JSON.stringify(create).includes('DESCRICAO_NAO_GRAVADA'), false);
    const update = normalizeClaude(f.source, { ...base, hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '7', status: 'completed' } }, undefined, { taskTitles: true });
    assert.deepEqual(update.find((event) => event.type === 'task.update')?.payload, { status: 'completed', taskId: '7' });
    assert.throws(() => validateEvent({ ...task!, payload: { status: 'in_progress', title: 'quebra\nde linha' } }), { code: 'INVALID_PAYLOAD' });
    assert.throws(() => validateEvent({ ...task!, payload: { status: 'doing', title: 'ok' } }), { code: 'INVALID_PAYLOAD' });
    const saved = configure(f.ctx, { revision: operatingConfig(f.ctx).revision, captureTaskTitles: true });
    assert.equal(saved.captureTaskTitles, true);
    assert.throws(() => configure(f.ctx, { revision: saved.revision, captureTaskTitles: 'sim' as never }), { code: 'INVALID_CONFIGURATION' });
  } finally { await f.close(); }
});
