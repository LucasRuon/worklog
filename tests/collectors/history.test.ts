import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { configureHistory, importHistory } from '../../src/collectors/history.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { normalizeEvent } from '../../src/core/policy.js';
import { appendEvent } from '../../src/core/events.js';
import { listSessions, projectSessions } from '../../src/core/sessions.js';
import { deriveTime } from '../../src/core/time.js';
import { openDatabase } from '../../src/core/sqlite.js';
import { normalizeOpenCode } from '../../src/collectors/opencode.js';
import { enqueueEvents } from '../../src/collectors/queue.js';
import { drainQueue } from '../../src/collectors/claude.js';
import type { SourceRegistration } from '../../src/core/contracts.js';

const range = { from: '2026-11-05T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' };
function header(source: SourceRegistration, schemaVersion = 1) { return JSON.stringify({ format: 'worklog-history', schemaVersion, tool: source.tool, version: source.version }); }
function event(source: SourceRegistration, cwd: string, index: number) {
  return normalizeEvent(source, { originId: `history-${index}`, nativeSessionId: 'history-session', cwd, occurredAt: `2026-11-05T09:${String(index).padStart(2, '0')}:00.000Z`, type: index === 0 ? 'session.start' : index % 2 ? 'turn.start' : 'turn.end', payload: index === 0 ? { reason: 'startup' } : index % 2 ? { turnId: `turn-${index}` } : { turnId: `turn-${index - 1}`, outcome: 'completed' } })[0]!;
}

test('histórico: três fontes, período, replay/live e proveniência', async () => {
  const f = await fixture();
  try {
    for (const [tool, version] of [['claude', '2.1.318'], ['codex', '0.167.0'], ['opencode', '2.2.5']] as const) {
      const source = { ...f.source, id: randomUUID(), tool, version, configPath: join(f.directory, `${tool}-config`) }; registerSource(f.ctx, source);
      const records = [event(source, f.root, 0), event(source, f.root, 1), event(source, f.root, 2)];
      appendEvent(f.ctx, records[1]!); // Same IDs captured live before historical recovery.
      const path = join(f.directory, `${tool}.jsonl`);
      const outside = [{ ...event(source, f.root, 10), occurredAt: '2026-11-04T23:59:59.999Z' }, { ...event(source, f.root, 11), occurredAt: range.to }];
      await writeFile(path, `${header(source)}\n${[...records, ...outside].map((e) => JSON.stringify(e)).join('\n')}\n`);
      configureHistory(f.ctx, source.id, { parser: 'normalized-v1', path });
      const result = await importHistory(f.ctx, source.id, range); assert.equal(result.imported, 2); assert.equal(result.skipped, 3); assert.equal(result.complete, true);
      assert.equal((await importHistory(f.ctx, source.id, range)).imported, 0);
      const foreign = { ...event(source, f.root, 20), sourceId: randomUUID(), installationId: randomUUID() };
      const before = f.allEvents().length;
      const checkpoint = f.ctx.db.get<{ checkpoint: string }>('SELECT checkpoint FROM history_runs WHERE source_id = ?', source.id)!.checkpoint;
      await appendFile(path, `${JSON.stringify(foreign)}\n`);
      const mismatch = await importHistory(f.ctx, source.id, range);
      assert.equal(mismatch.imported, 0); assert.deepEqual(mismatch.warnings, ['HISTORY_SOURCE_MISMATCH']);
      assert.equal(f.allEvents().length, before);
      assert.equal(f.ctx.db.get<{ checkpoint: string }>('SELECT checkpoint FROM history_runs WHERE source_id = ?', source.id)!.checkpoint, checkpoint);
    }
    projectSessions(f.ctx, f.allEvents());
    const sessions = listSessions(f.ctx, { ...f.filter }); assert.equal(sessions.length, 3);
    assert.ok(sessions.every((s) => s.provenance === 'mixed'));
    assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 0); assert.equal(deriveTime(f.ctx, f.filter).agentAccumulatedMs, 180_000);
    assert.equal(f.allEvents().some((e) => e.type === 'human.interaction'), false);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM event_provenance')!.n, 6);
  } finally { await f.close(); }
});

test('histórico: truncamento, formato, timestamp e retomada', async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, 'history.jsonl'); const first = JSON.stringify(event(f.source, f.root, 0)); const second = JSON.stringify(event(f.source, f.root, 1));
    await writeFile(path, `${header(f.source)}\n${first}\n${second.slice(0, 20)}`);
    configureHistory(f.ctx, f.source.id, { parser: 'normalized-v1', path });
    const truncated = await importHistory(f.ctx, f.source.id, range);
    assert.equal(truncated.imported, 1); assert.equal(truncated.complete, false); assert.ok(truncated.warnings.includes('HISTORY_TRUNCATED'));
    await appendFile(path, `${second.slice(20)}\n`);
    const resumed = await importHistory(f.ctx, f.source.id, range); assert.equal(resumed.imported, 1); assert.equal(resumed.complete, true);
    const invalid = { ...event(f.source, f.root, 2), occurredAt: 'PRIVATE_TRANSCRIPT' };
    await writeFile(path, `${header(f.source)}\n${JSON.stringify(invalid)}\n`);
    const badTime = await importHistory(f.ctx, f.source.id, range); assert.equal(badTime.imported, 0); assert.equal(badTime.complete, false);
    assert.ok(badTime.warnings.includes('HISTORY_RECORD_INVALID'));
    assert.equal(JSON.stringify(badTime).includes('PRIVATE_TRANSCRIPT'), false);
    await writeFile(path, `${header(f.source, 99)}\n${first}\n`);
    const unknown = await importHistory(f.ctx, f.source.id, range); assert.equal(unknown.imported, 0); assert.ok(unknown.warnings.includes('HISTORY_FORMAT_UNSUPPORTED'));
    await writeFile(path, `${header(f.source, 0)}\n${first}\n`);
    const old = await importHistory(f.ctx, f.source.id, range); assert.equal(old.imported, 0); assert.deepEqual(old.warnings, ['HISTORY_FORMAT_UNSUPPORTED']);
    await writeFile(path, `${header(f.source)}\n${first}\n${second}\n${JSON.stringify(event(f.source, f.root, 2))}\n`);
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 1);
    assert.equal(f.allEvents().length, 3);
    assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);
    assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_TRANSCRIPT'), false);
  } finally { await f.close(); }
});

test('histórico: cancelamento e escopo autorizado', async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, 'history.jsonl'); const bytes = `${header(f.source)}\n${Array.from({ length: 25 }, (_, i) => JSON.stringify(event(f.source, f.root, i))).join('\n')}\n`;
    await writeFile(path, bytes); configureHistory(f.ctx, f.source.id, { parser: 'normalized-v1', path });
    const controller = new AbortController();
    const first = await importHistory(f.ctx, f.source.id, range, { signal: controller.signal, onProgress: () => controller.abort() });
    assert.equal(first.imported, 1); assert.equal(first.complete, false); assert.ok(first.warnings.includes('HISTORY_CANCELLED'));
    const next = await importHistory(f.ctx, f.source.id, range); assert.equal(next.imported, 24); assert.equal(next.complete, true);
    assert.equal(await readFile(path, 'utf8'), bytes);
    registerSource(f.ctx, { ...f.source, enabled: false });
    await assert.rejects(importHistory(f.ctx, f.source.id, range), { code: 'HISTORY_SOURCE_UNAVAILABLE' });
    registerSource(f.ctx, f.source);
    assert.throws(() => configureHistory(f.ctx, f.source.id, { parser: 'git-v1', path: f.root }), { code: 'HISTORY_SOURCE_MISMATCH' });
    await writeFile(path, `${header(f.source)}\n${JSON.stringify({ ...event(f.source, f.root, 30), cwd: f.directory })}\n`);
    const denied = await importHistory(f.ctx, f.source.id, range); assert.equal(denied.imported, 0); assert.ok(denied.warnings.includes('HISTORY_ROOT_UNAUTHORIZED'));
  } finally { await f.close(); }
});

test('histórico: OpenCode legado somente leitura e compatibilidade', async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, 'opencode.db'); const db = openDatabase(path);
    db.exec('CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,parent_id TEXT,version TEXT,time_created INTEGER,time_updated INTEGER); CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,time_updated INTEGER,data TEXT); CREATE TABLE part(id TEXT,session_id TEXT,message_id TEXT,time_created INTEGER,time_updated INTEGER,data TEXT);');
    const at = Date.parse('2026-11-05T09:00:00.000Z');
    db.run('INSERT INTO session VALUES (?, ?, NULL, ?, ?, ?)', 'native-history', f.root, '1.19.5', at, at + 120000);
    db.run('INSERT INTO message VALUES (?, ?, ?, ?, ?)', 'assistant-one', 'native-history', at + 1000, at + 2000, JSON.stringify({ role: 'assistant', time: { created: at + 1000, completed: at + 2000 }, private: 'PRIVATE_MESSAGE' }));
    db.close();
    const source = { ...f.source, id: randomUUID(), tool: 'opencode' as const, version: '1.19.5', configPath: path }; registerSource(f.ctx, source);
    configureHistory(f.ctx, source.id, { parser: 'opencode-db-1.19.5', path });
    enqueueEvents(f.ctx.config.dataDir, normalizeOpenCode(source, { kind: 'message', id: 'assistant-one', sessionId: 'native-history', cwd: f.root, role: 'assistant', created: at + 1000 }));
    assert.equal(drainQueue(f.ctx).inserted, 1);
    const before = await readFile(path); const result = await importHistory(f.ctx, source.id, range);
    assert.equal(result.imported, 2); assert.equal(f.allEvents().length, 3); assert.equal((await importHistory(f.ctx, source.id, range)).imported, 0);
    assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_MESSAGE'), false); assert.deepEqual(await readFile(path), before);
    registerSource(f.ctx, { ...source, version: '2.2.5' });
    const unsupported = await importHistory(f.ctx, source.id, range); assert.equal(unsupported.imported, 0); assert.ok(unsupported.warnings.includes('HISTORY_VERSION_UNSUPPORTED'));
    registerSource(f.ctx, source);
    const malformed = openDatabase(path); malformed.run('UPDATE message SET data = ?', JSON.stringify({ role: 'assistant', time: { created: 'invalid', completed: at + 2000 } })); malformed.close();
    const rejected = await importHistory(f.ctx, source.id, range); assert.equal(rejected.complete, false); assert.ok(rejected.warnings.includes('HISTORY_RECORD_INVALID'));
    const missing = await importHistory(f.ctx, f.source.id, range); assert.equal(missing.imported, 0); assert.ok(missing.warnings.includes('HISTORY_UNAVAILABLE'));
  } finally { await f.close(); }
});
