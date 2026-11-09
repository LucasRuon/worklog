import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openStore } from '../src/core/context.js';
import { openReadonlyDatabase } from '../src/core/sqlite.js';
import { registerProjectRoot, resolveProject } from '../src/core/projects.js';
import { registerSource } from '../src/collectors/source-config.js';
import { stableId } from '../src/core/policy.js';
import { normalizeOpenCode } from '../src/collectors/opencode.js';
import { configureHistory, importHistory } from '../src/collectors/history.js';
import { nativeSession, readNativePage, validateNativeSchema, type ScanCursor } from '../src/collectors/opencode-store.js';
import { projectSessions } from '../src/core/sessions.js';
import { buildWorkSummary } from '../src/core/summaries.js';
import type { WorkEvent } from '../src/core/contracts.js';
import { storageUsage } from '../src/core/maintenance.js';

const { values } = parseArgs({ options: { database: { type: 'string' }, root: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
if (!values.database || !values.root || !values.from || !values.to) throw new Error('Use --database /opencode.db --root /raiz --from UTC --to UTC.');
const directory = await mkdtemp(join(tmpdir(), 'worklog-history-live-')); const ctx = await openStore(join(directory, 'data'));
try {
  registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, projectName: 'Piloto histórico Worklog', path: values.root });
  const source = { id: stableId(ctx.config.installationId, 'history-smoke'), deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'opencode' as const, version: '1.19.5', profile: 'historico-legado', configPath: values.database, enabled: true };
  registerSource(ctx, source); configureHistory(ctx, source.id, { parser: 'opencode-db-1.19.5', path: values.database });
  const db = openReadonlyDatabase(values.database); const expected = new Set<string>(); let nativeRecords = 0;
  try {
    validateNativeSchema(db);
    const sessions = db.all<{ id: string; cwd: string }>('SELECT id, directory AS cwd FROM session WHERE version = ?', '1.19.5');
    const accept = (raw: unknown) => {
      nativeRecords++;
      for (const event of normalizeOpenCode(source, raw)) if (event.occurredAt >= values.from! && event.occurredAt < values.to!) expected.add(event.eventId);
    };
    for (const { id, cwd } of sessions) {
      if (resolveProject(ctx, ctx.config.deviceId, cwd).state !== 'matched') continue;
      const session = nativeSession(db, id)!; accept({ ...session, kind: 'session', reason: session.parentSessionId ? 'subagent' : 'startup' });
      for (const kind of ['message', 'tool'] as const) {
        let cursor: ScanCursor = { watermark: 0, after: null };
        do { const page = readNativePage(db, session, 0, cursor, kind); page.records.forEach(accept); cursor = page.cursor; } while (cursor.after);
      }
    }
  } finally { db.close(); }
  assert.ok(expected.size > 0, 'Sem registros legados elegíveis no período; não declarar piloto aprovado.');
  const beforeStorage = storageUsage(ctx); const startedAt = performance.now(); let imported = 0; let complete = false;
  for (let batch = 0; batch < 25; batch++) {
    const result = await importHistory(ctx, source.id, { from: values.from, to: values.to }); imported += result.imported;
    if (result.complete) { complete = true; break; }
    assert.deepEqual(result.warnings, ['HISTORY_MORE_AVAILABLE']);
  }
  assert.equal(complete, true); assert.equal(imported, expected.size);
  const actual = ctx.db.all<{ event_id: string }>('SELECT event_id FROM events');
  assert.deepEqual(new Set(actual.map((e) => e.event_id)), expected);
  const replay = await importHistory(ctx, source.id, { from: values.from, to: values.to }); assert.equal(replay.imported, 0);
  projectSessions(ctx, ctx.db.all<{ document: string }>('SELECT document FROM events').map((row) => JSON.parse(row.document) as WorkEvent));
  const summary = buildWorkSummary(ctx, { projectIds: [], from: values.from, to: values.to, timezone: 'UTC' });
  assert.equal(summary.ruleVersion, 'evidence-summary-v1'); assert.ok(summary.evidenceIds.every((id) => expected.has(id)));
  assert.equal(ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM events WHERE type IN ('human.interaction','focus.change','file.change')")!.n, 0);
  assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM file_revisions')!.n, 0);
  const afterStorage = storageUsage(ctx);
  console.log(JSON.stringify({ passed: true, parser: 'opencode-db-1.19.5', range: { from: values.from, to: values.to }, nativeRecordsScanned: nativeRecords, expectedNormalizedIds: expected.size, imported, replayInserted: replay.imported, summaryRuleVersion: summary.ruleVersion, summaryEvidenceIds: summary.evidenceIds.length, humanOrFileEvents: 0, fileRevisions: 0, storage: 'temporary-isolated-store', sample: { beforeBytes: beforeStorage.bytes, afterBytes: afterStorage.bytes, databaseBytes: afterStorage.databaseBytes, budgetBytes: afterStorage.budgetBytes, elapsedMs: Math.round(performance.now() - startedAt), scope: 'sample-only-not-daily-growth' }, verification: 'script-assertions-only' }, null, 2));
} finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
