import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { prepareCapture } from '../../src/collectors/queue.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { normalizeEvent } from '../../src/core/policy.js';
import { resolveProject } from '../../src/core/projects.js';
import { projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';

const at = (clock: string) => Date.parse(`2026-11-11T${clock}.000Z`);
const range = { from: '2026-11-11T00:00:00.000Z', to: '2026-11-12T00:00:00.000Z' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', cwd, ...args], { stdio: 'ignore' });

function database(path: string, sessions: { id: string; directory: string; parent?: string }[], messages: { session: string; type: string; time: number; data: Record<string, unknown> }[]) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE session_v2 (id TEXT PRIMARY KEY, directory TEXT NOT NULL, parent_id TEXT, version TEXT NOT NULL, time_created INTEGER NOT NULL)');
  db.exec('CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL)');
  for (const [index, s] of sessions.entries()) db.prepare('INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?)').run(s.id, s.directory, s.parent ?? null, '2.2.7', at('12:59:00') + index);
  const seq = new Map<string, number>();
  for (const m of messages) {
    const n = (seq.get(m.session) ?? 0) + 1; seq.set(m.session, n);
    db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)').run(`msg_${randomUUID().replaceAll('-', '')}`, m.session, m.type, n, m.time, m.time, JSON.stringify(m.data));
  }
  db.close();
}
const tool = (id: string, ran: string, done: string, status = 'completed') => ({ type: 'tool', id, name: 'bash', executed: false, state: { status, input: { command: 'TOKEN=SECRET' }, content: [{ text: 'SECRET' }] }, time: { created: at(ran), ran: at(ran), completed: at(done) } });
const assistant = (created: string, completed: string | null, content: unknown[] = [], finish = 'tool-calls') => ({ time: { created: at(created), ...(completed ? { completed: at(completed) } : {}) }, agent: 'build', model: { id: 'm', providerID: 'p' }, content, finish });

async function setup(version = '2.2.7') {
  const f = await fixture();
  const path = join(f.directory, 'opencode.db');
  const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version, configPath: join(f.directory, 'plugins-worklog.js') }; registerSource(f.ctx, source);
  return { ...f, path, source, configure: () => configureHistory(f.ctx, source.id, { parser: 'opencode-db-v2', path }) };
}

test('banco v2: reconstrói prompts, turnos e ferramentas sem ler conteúdo e sem duplicar no replay', async () => {
  const f = await setup();
  try {
    database(f.path, [{ id: 'ses_a', directory: f.root }], [
      { session: 'ses_a', type: 'user', time: at('12:59:50'), data: { time: { created: at('12:59:50') }, text: 'SECRET prompt', files: [], agents: [] } },
      { session: 'ses_a', type: 'assistant', time: at('13:00:00'), data: assistant('13:00:00', '13:00:30', [tool('call_1', '13:00:05', '13:00:10'), tool('call_2', '13:00:12', '13:00:20', 'error')]) },
      { session: 'ses_a', type: 'idle', time: at('13:00:31'), data: { time: { created: at('13:00:31') }, outcome: 'done' } },
      { session: 'ses_a', type: 'assistant', time: at('13:01:00'), data: assistant('13:01:00', '13:01:20', [], 'error') },
      // Em andamento: fica para o plugin ao vivo, sem duração observável.
      { session: 'ses_a', type: 'assistant', time: at('13:02:00'), data: assistant('13:02:00', null) },
    ]);
    f.configure();
    const result = await importHistory(f.ctx, f.source.id, range, { limit: 10000 });
    assert.deepEqual(result.warnings, []); assert.equal(result.complete, true);
    const events = f.allEvents().filter((e) => e.sourceId === f.source.id);
    assert.deepEqual(events.map((e) => e.type).sort(), ['session.start', 'tool.end', 'tool.end', 'tool.start', 'tool.start', 'turn.end', 'turn.end', 'turn.start', 'turn.start', 'turn.submit']);
    assert.equal(JSON.stringify(events).includes('SECRET'), false);
    assert.deepEqual(events.filter((e) => e.type === 'tool.end').map((e) => e.payload.outcome).sort(), ['completed', 'failed']);
    assert.deepEqual(events.filter((e) => e.type === 'turn.end').map((e) => e.payload.outcome).sort(), ['completed', 'failed']);
    assert.ok(events.every((e) => e.nativeSessionId === 'ses_a'));
    assert.equal((await importHistory(f.ctx, f.source.id, range, { limit: 10000 })).imported, 0);
    projectSessions(f.ctx, events);
    const time = deriveTime(f.ctx, { projectIds: [f.projectId], from: '2026-11-11T12:00:00.000Z', to: '2026-11-11T14:00:00.000Z', timezone: 'UTC' });
    assert.equal(time.agentWallMs, 50_000);
    assert.ok(time.humanSignalCount >= 1);
  } finally { await f.close(); }
});

test('banco v2: worktrees do mesmo repositório entram no projeto; diretórios alheios são pulados sem abortar', async () => {
  const f = await setup();
  try {
    git(f.root, 'init', '-q'); git(f.root, 'commit', '-q', '--allow-empty', '-m', 'raiz');
    const worktree = join(f.directory, 'worktrees', 'f3-09'); await mkdir(join(f.directory, 'worktrees'));
    git(f.root, 'worktree', 'add', '-q', '-b', 'f3-09', worktree);
    const stranger = join(f.directory, 'alheio'); await mkdir(stranger);
    const turn = (session: string) => [
      { session, type: 'user', time: at('13:00:00'), data: { time: { created: at('13:00:00') }, text: 'x', files: [], agents: [] } },
      { session, type: 'assistant', time: at('13:00:05'), data: assistant('13:00:05', '13:00:25') },
    ];
    database(f.path, [{ id: 'ses_wt', directory: worktree }, { id: 'ses_out', directory: stranger }], [...turn('ses_wt'), ...turn('ses_out')]);
    f.configure();
    const result = await importHistory(f.ctx, f.source.id, range, { limit: 10000 });
    assert.deepEqual(result.warnings, []);
    const events = f.allEvents().filter((e) => e.sourceId === f.source.id);
    assert.ok(events.length > 0); assert.ok(events.every((e) => e.nativeSessionId === 'ses_wt'));
    projectSessions(f.ctx, events);
    assert.equal(deriveTime(f.ctx, { projectIds: [f.projectId], from: '2026-11-11T12:00:00.000Z', to: '2026-11-11T14:00:00.000Z', timezone: 'UTC' }).agentWallMs, 20_000);
  } finally { await f.close(); }
});

test('banco v2: troca de diretório usa o cwd inicial até a troca e recusa fonte fora da geração 2.x', async () => {
  const f = await setup();
  try {
    const other = join(f.directory, 'alheio'); await mkdir(other);
    database(f.path, [{ id: 'ses_move', directory: other }], [
      { session: 'ses_move', type: 'location-switched', time: at('13:00:30'), data: { time: { created: at('13:00:30') }, location: { directory: other }, previous: { location: { directory: f.root } } } },
      { session: 'ses_move', type: 'assistant', time: at('13:00:05'), data: assistant('13:00:05', '13:00:25') },
    ]);
    // Seq segue a ordem de inserção: o assistente (seq 2) vem depois da troca (seq 1) e já está no diretório alheio.
    f.configure();
    const result = await importHistory(f.ctx, f.source.id, range, { limit: 10000 });
    assert.deepEqual(result.warnings, []);
    const types = f.allEvents().filter((e) => e.sourceId === f.source.id).map((e) => e.type);
    assert.deepEqual(types, ['session.start']);
    registerSource(f.ctx, { ...f.source, version: '1.19.5' });
    assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_VERSION_UNSUPPORTED']);
  } finally { await f.close(); }
});

test('worktree vinculado é associado ao projeto e autorizado na captura; pasta alheia continua fora', async () => {
  const f = await setup();
  try {
    git(f.root, 'init', '-q'); git(f.root, 'commit', '-q', '--allow-empty', '-m', 'raiz');
    const worktree = join(f.directory, 'wt'); git(f.root, 'worktree', 'add', '-q', '-b', 'wt', worktree);
    const stranger = join(f.directory, 'alheio'); await mkdir(stranger);
    const match = resolveProject(f.ctx, f.ctx.config.deviceId, worktree);
    assert.equal(match.state, 'matched'); assert.equal(match.state === 'matched' && match.projectId, f.projectId);
    assert.equal(resolveProject(f.ctx, f.ctx.config.deviceId, stranger).state, 'unassigned');
    const [event] = normalizeEvent(f.source, { originId: 'x', occurredAt: new Date().toISOString(), nativeSessionId: 'ses_x', cwd: worktree, type: 'session.start', payload: { reason: 'startup' } });
    assert.equal(prepareCapture(f.ctx.config.dataDir, [event!]).events.length, 1);
    assert.throws(() => prepareCapture(f.ctx.config.dataDir, [{ ...event!, cwd: stranger }]), /CAPTURE_NOT_AUTHORIZED/);
  } finally { await f.close(); }
});
