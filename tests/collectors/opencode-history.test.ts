import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { nativeLog } from '../opencode-log-fixture.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { normalizeEvent } from '../../src/core/policy.js';
import { projectV2Event } from '../../src/collectors/plugins/opencode-projector.js';
import { appendEvent } from '../../src/core/events.js';
import { listSessions, projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import { controlSource } from '../../src/collectors/source-config.js';
import { prepareCapture } from '../../src/collectors/queue.js';

const range = { from: '2026-11-06T09:00:00.000Z', to: '2026-11-06T09:01:00.000Z' };
async function setup(version = '2.2.5') {
  const f = await fixture(); const path = join(f.directory, 'log com espaços.sse');
  const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version, configPath: path }; registerSource(f.ctx, source);
  const log = nativeLog(f.root, version); await writeFile(path, log.bytes);
  configureHistory(f.ctx, source.id, { parser: 'opencode-log-v1', path });
  return { ...f, path, source, log };
}

test('log v2: metadados, origem e identidade compartilhada com coleta ao vivo', async () => {
  for (const version of ['2.2.5', '2.2.6']) {
    const f = await setup(version);
    try {
      const live = prepareCapture(f.ctx.config.dataDir, normalizeEvent(f.source, projectV2Event(f.log.events[4], { cwd: f.root, toolName: 'Bash', parentSessionId: 'parent-session' }))).events[0]!; appendEvent(f.ctx, live);
      const result = await importHistory(f.ctx, f.source.id, range); assert.equal(result.imported, 7); assert.equal(result.complete, true); assert.deepEqual(result.warnings, []);
      const events = f.allEvents(); assert.equal(events.length, 8); assert.equal(events.filter((e) => e.eventId === live.eventId).length, 1);
      assert.deepEqual(new Set(events.map((e) => e.type)), new Set(['session.start', 'turn.submit', 'turn.start', 'tool.start', 'tool.end', 'turn.end', 'session.interrupt']));
      assert.ok(events.every((e) => e.sourceId === f.source.id && e.nativeSessionId === 'native-log' && e.parentSessionId === 'parent-session'));
      assert.deepEqual(events.filter((e) => e.type === 'tool.start' || e.type === 'tool.end').map((e) => e.payload.toolName), ['Bash', 'Bash']);
      assert.ok(events.some((e) => e.type === 'session.start' && e.payload.reason === 'compact'));
      assert.ok(events.some((e) => e.type === 'session.interrupt' && e.payload.reason === 'user'));
      assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0); assert.equal(f.allEvents().length, 8);
      projectSessions(f.ctx, events); const filter = { ...range, projectIds: [f.projectId], timezone: 'UTC' };
      assert.equal(listSessions(f.ctx, filter)[0]!.provenance, 'mixed'); assert.equal(listSessions(f.ctx, filter)[0]!.state, 'interrupted');
      assert.equal(deriveTime(f.ctx, filter).humanEstimatedMs, 0); assert.equal(events.some((e) => e.type === 'session.end'), false);
      assert.equal(JSON.stringify(events).includes('PRIVATE_TRANSCRIPT'), false);
      assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);
    } finally { await f.close(); }
  }
  const f = await setup();
  try {
    const alias = join(f.directory, 'root-alias'); await symlink(f.root, alias);
    const log = nativeLog(alias); log.events[5]!.type = 'session.tool.failed'; log.events[6]!.type = 'session.step.failed'; log.events[9]!.type = 'session.execution.failed';
    await writeFile(f.path, log.events.map(log.frame).join('') + log.frame(log.marker));
    const live = prepareCapture(f.ctx.config.dataDir, normalizeEvent(f.source, projectV2Event(log.events[4], { cwd: alias, toolName: 'Bash', parentSessionId: 'parent-session' }))).events[0]!;
    appendEvent(f.ctx, live);
    const result = await importHistory(f.ctx, f.source.id, range); assert.equal(result.imported, 7); assert.equal(result.complete, true);
    assert.ok(f.allEvents().some((e) => e.type === 'tool.end' && e.payload.outcome === 'failed'));
    assert.ok(f.allEvents().some((e) => e.type === 'turn.end' && e.payload.outcome === 'failed'));
    assert.ok(f.allEvents().some((e) => e.type === 'session.interrupt' && e.payload.reason === 'error'));
  } finally { await f.close(); }
});

test('log v2: período, limites e projeção sem conteúdo', async () => {
  const f = await setup();
  try {
    const result = await importHistory(f.ctx, f.source.id, { from: '2026-11-06T09:00:04.000Z', to: '2026-11-06T09:00:06.000Z' });
    assert.equal(result.imported, 2); assert.equal(result.complete, true);
    assert.deepEqual(f.allEvents().map((e) => e.type), ['tool.start', 'tool.end']);
    assert.equal(f.allEvents()[0]!.occurredAt, '2026-11-06T09:00:04.000Z');
    assert.equal(f.allEvents()[1]!.occurredAt, '2026-11-06T09:00:05.000Z');
    assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_TRANSCRIPT'), false);
    await writeFile(f.path, 'data: ' + 'x'.repeat(1024 * 1024 + 1) + '\n\n');
    const large = await importHistory(f.ctx, f.source.id, range); assert.equal(large.complete, false); assert.deepEqual(large.warnings, ['HISTORY_RECORD_TOO_LARGE']);
    assert.equal(f.allEvents().length, 2);
    const log = nativeLog(f.root); const many = [log.events[0], ...Array.from({ length: 10000 }, (_, index) => ({ ...log.events[1], id: `view-${index}`, type: 'session.viewed', durable: { aggregateID: 'native-log', seq: index + 2, version: 1 } }))];
    await writeFile(f.path, many.map(log.frame).join(''));
    const capped = await importHistory(f.ctx, f.source.id, range); assert.equal(capped.complete, false); assert.deepEqual(capped.warnings, ['HISTORY_NATIVE_SCAN_LIMIT']); assert.equal(f.allEvents().length, 3);
    await truncate(f.path, 64 * 1024 * 1024 + 1);
    const oversized = await importHistory(f.ctx, f.source.id, range); assert.deepEqual(oversized.warnings, ['HISTORY_INPUT_TOO_LARGE']); assert.equal(f.allEvents().length, 3);
  } finally { await f.close(); }
});

test('log v2: identidade, autorização e formatos desconhecidos', async () => {
  const f = await setup();
  try {
    const cases = [
      { code: 'HISTORY_ROOT_UNAUTHORIZED', edit: (l: ReturnType<typeof nativeLog>) => { l.events[0]!.data.location = { directory: f.directory }; } },
      { code: 'HISTORY_VERSION_UNSUPPORTED', edit: (l: ReturnType<typeof nativeLog>) => { l.events[0]!.data.version = '9.0.0'; } },
      { code: 'HISTORY_FORMAT_UNSUPPORTED', edit: (l: ReturnType<typeof nativeLog>) => { l.events[0]!.durable.version = 2; } },
      { code: 'HISTORY_RECORD_INVALID', edit: (l: ReturnType<typeof nativeLog>) => { l.events[0]!.created = Number.NaN; } },
    ];
    for (const c of cases) {
      const log = nativeLog(f.root); c.edit(log); await writeFile(f.path, log.events.map(log.frame).join('') + log.frame(log.marker));
      const result = await importHistory(f.ctx, f.source.id, range); assert.equal(result.imported, 0); assert.equal(result.complete, false); assert.deepEqual(result.warnings, [c.code]);
    }
    for (const mutate of [
      (l: ReturnType<typeof nativeLog>) => { l.events[1]!.data.sessionID = 'foreign'; },
      (l: ReturnType<typeof nativeLog>) => { l.events[1]!.durable.seq = 9; },
    ]) {
      const log = nativeLog(f.root); mutate(log); await writeFile(f.path, log.events.map(log.frame).join('') + log.frame(log.marker));
      const result = await importHistory(f.ctx, f.source.id, range); assert.equal(result.complete, false); assert.ok(result.warnings.includes('HISTORY_SOURCE_MISMATCH') || result.warnings.includes('HISTORY_SEQUENCE_INVALID'));
      assert.equal(f.allEvents().length, 1);
    }
    const log = nativeLog(f.root); log.events[1]!.type = 'session.moved'; log.events[1]!.data.location = { directory: f.directory };
    await writeFile(f.path, log.events.map(log.frame).join('') + log.frame(log.marker));
    assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_ROOT_UNAUTHORIZED']); assert.equal(f.allEvents().length, 1);
    f.ctx.db.run('UPDATE project_roots SET enabled = 0 WHERE project_id = ?', f.projectId);
    await writeFile(f.path, f.log.bytes); assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_ROOT_UNAUTHORIZED']);
    registerSource(f.ctx, { ...f.source, version: '9.0.0' }); assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_VERSION_UNSUPPORTED']);
    registerSource(f.ctx, f.source); controlSource(f.ctx, f.source.id, false, 0);
    await assert.rejects(importHistory(f.ctx, f.source.id, range), { code: 'HISTORY_SOURCE_UNAVAILABLE', status: 409 });
  } finally { await f.close(); }
});

test('log v2: cancelamento, retomada e integridade do watermark', async () => {
  const f = await setup();
  try {
    const before = await readFile(f.path); const controller = new AbortController();
    const first = await importHistory(f.ctx, f.source.id, range, { signal: controller.signal, onProgress: () => controller.abort() });
    assert.equal(first.imported, 1); assert.deepEqual(first.warnings, ['HISTORY_CANCELLED']); assert.equal(first.complete, false);
    const limited = await importHistory(f.ctx, f.source.id, range, { limit: 2 }); assert.equal(limited.imported, 2); assert.deepEqual(limited.warnings, ['HISTORY_MORE_AVAILABLE']);
    const rest = await importHistory(f.ctx, f.source.id, range); assert.equal(rest.imported, 5); assert.equal(rest.complete, true); assert.equal(f.allEvents().length, 8);
    assert.deepEqual(await readFile(f.path), before); assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
    for (const bytes of [f.log.events.map(f.log.frame).join(''), f.log.bytes.slice(0, -1), f.log.bytes.replace('"seq":10}', '"seq":11}')]) {
      await writeFile(f.path, bytes); const result = await importHistory(f.ctx, f.source.id, range); assert.equal(result.complete, false); assert.ok(result.warnings.includes('HISTORY_TRUNCATED') || result.warnings.includes('HISTORY_SEQUENCE_INVALID'));
      assert.equal(f.allEvents().length, 8);
    }
    await writeFile(f.path, 'data: {"PRIVATE_TRANSCRIPT":\n\n'); const bad = await importHistory(f.ctx, f.source.id, range);
    assert.deepEqual(bad.warnings, ['HISTORY_RECORD_INVALID']); assert.equal(JSON.stringify(bad).includes('PRIVATE_TRANSCRIPT'), false);
    await writeFile(f.path, f.log.frame({ type: 'log.synced', aggregateID: 'empty', seq: 0 }));
    const empty = await importHistory(f.ctx, f.source.id, range); assert.equal(empty.complete, false); assert.deepEqual(empty.warnings, ['HISTORY_UNAVAILABLE']);
    const unknown = nativeLog(f.root); unknown.events[1]!.type = 'session.future-event'; await writeFile(f.path, unknown.events.map(unknown.frame).join('') + unknown.frame(unknown.marker));
    assert.deepEqual((await importHistory(f.ctx, f.source.id, range)).warnings, ['HISTORY_FORMAT_UNSUPPORTED']);
  } finally { await f.close(); }
});
