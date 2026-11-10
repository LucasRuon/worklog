import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { backupData, restoreData, runRetention, storageUsage } from '../../src/core/maintenance.js';
import { configure, operatingConfig, setRootEnabled } from '../../src/core/configuration.js';
import { openStore } from '../../src/core/context.js';
import { registerProjectRoot, listProjects } from '../../src/core/projects.js';
import { storeRevision, revisionDetail } from '../../src/collectors/revisions.js';
import { deriveTime } from '../../src/core/time.js';
import { queryReport, saveReport, savedReport, defaultReportOptions } from '../../src/reports/query.js';
import { queueClaude, drainQueue } from '../../src/collectors/claude.js';
import { queueCodex } from '../../src/collectors/codex.js';
import { controlSource, registerSource } from '../../src/collectors/source-config.js';
import { signalHuman } from '../../src/collectors/focus.js';
import { stableId } from '../../src/core/policy.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

test('retenção: corte, deduplicação e eventos preservados', async () => {
  const f = await fixture();
  try {
    const root = listProjects(f.ctx)[0]!.roots[0]!; const fileId = randomUUID(); const now = '2026-11-07T12:00:00.000Z';
    const at = ['2026-10-08T11:59:59.999Z', '2026-10-08T12:00:00.000Z', '2026-11-07T11:00:00.000Z'];
    let previous: string | null = null; const ids: string[] = [];
    for (let i = 0; i < at.length; i++) {
      const content = `versão ${i}\n`; await writeFile(join(f.root, 'file.txt'), content); const id = randomUUID();
      storeRevision(f.ctx, { id, rootId: root.id!, fileId, path: 'file.txt', sha256: createHash('sha256').update(content).digest('hex'), content, size: Buffer.byteLength(content), occurredAt: at[i]!, operation: i ? 'edit' : 'baseline', observation: i ? 'watch' : 'baseline', previousRevisionId: previous, previousPath: null, unavailableReason: null }); previous = id; ids.push(id);
    }
    const shared = 'conteúdo antigo compartilhado'; const sharedIds: string[] = [];
    for (const path of ['keep.txt', 'copy.txt']) {
      await writeFile(join(f.root, path), shared); const id = randomUUID(); sharedIds.push(id);
      storeRevision(f.ctx, { id, rootId: root.id!, fileId: randomUUID(), path, content: shared, sha256: createHash('sha256').update(shared).digest('hex'), size: Buffer.byteLength(shared), occurredAt: at[0]!, operation: 'baseline', observation: 'baseline', previousRevisionId: null, previousPath: null, unavailableReason: null });
    }
    const raw = JSON.stringify(f.allEvents()); const metadata = f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n;
    f.ctx.db.run('INSERT INTO sync_cursors VALUES (?, ?)', f.ctx.config.installationId, 7);
    const filter = { ...f.filter, projectIds: [f.projectId], from: '2026-10-01T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' };
    const snapshot = saveReport(f.ctx, queryReport(f.ctx, filter, defaultReportOptions));
    const result = runRetention(f.ctx, now); assert.equal(result.deletedContents, 1);
    assert.equal(result.cutoff, '2026-10-08T12:00:00.000Z');
    assert.equal((await revisionDetail(f.ctx, ids[0]!)).content, null);
    assert.equal((await revisionDetail(f.ctx, ids[1]!)).content, 'versão 1\n');
    assert.equal(f.ctx.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', f.ctx.config.installationId)!.seq, 7);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, metadata); assert.equal(JSON.stringify(f.allEvents()), raw);
    assert.equal((await revisionDetail(f.ctx, ids[1]!)).diff.reason, 'retention'); assert.equal((await revisionDetail(f.ctx, ids[2]!)).content, 'versão 2\n');
    assert.equal((await revisionDetail(f.ctx, sharedIds[0]!)).content, shared); assert.equal((await revisionDetail(f.ctx, sharedIds[1]!)).content, shared);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_contents')!.n, 3);
    assert.throws(() => savedReport(f.ctx, snapshot), { code: 'REPORT_EXPIRED' });
  } finally { await f.close(); }
});

test('backup e restore: snapshot consistente e falhas seguras', async () => {
  const f = await fixture();
  try {
    f.emit('human.interaction', '2026-11-05T09:00Z', { kind: 'explicit' });
    const root = listProjects(f.ctx)[0]!.roots[0]!; const content = 'conteúdo no backup'; await writeFile(join(f.root, 'backup.txt'), content); const revisionId = randomUUID();
    storeRevision(f.ctx, { id: revisionId, rootId: root.id!, fileId: randomUUID(), path: 'backup.txt', content, sha256: createHash('sha256').update(content).digest('hex'), size: Buffer.byteLength(content), occurredAt: '2026-11-05T09:00:00.000Z', operation: 'baseline', observation: 'baseline', previousRevisionId: null, previousPath: null, unavailableReason: null });
    assert.equal(queueClaude(f.ctx.config.dataDir, f.source.id, { cwd: f.root, session_id: 'pending', hook_event_name: 'SessionStart', source: 'startup' }), 1);
    const codex = { ...f.source, id: randomUUID(), tool: 'codex' as const, version: '0.167.0', configPath: join(f.directory, 'codex-hooks.json') }; registerSource(f.ctx, codex);
    const callback = { cwd: f.root, session_id: 'codex-pending', turn_id: 'one', hook_event_name: 'UserPromptSubmit' };
    assert.equal(queueCodex(f.ctx.config.dataDir, codex.id, callback), 2);
    signalHuman(f.ctx, f.projectId);
    const original = deriveTime(f.ctx, f.filter); const backup = join(f.directory, 'backup');
    assert.equal((await backupData(f.ctx, backup)).status, 'ok');
    const activeTarget = join(f.directory, 'service-active');
    execFileSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', `
      import assert from 'node:assert/strict'; import { mock } from 'node:test'; import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path';
      mock.module(pathToFileURL(resolve('dist/cli/service.js')).href, { namedExports: { serviceStatus: async () => ({ running: true }) } });
      const { restoreData } = await import(pathToFileURL(resolve('dist/core/maintenance.js')).href);
      await assert.rejects(restoreData({ backup: process.argv[1], dataDir: process.argv[2] }), { code: 'SERVICE_MUST_STOP', status: 409 });
    `, backup, activeTarget], { timeout: 10000, stdio: 'pipe' });
    assert.equal(existsSync(activeTarget), false); assert.equal(existsSync(join(backup, 'worklog.sqlite')), true);
    const target = join(f.directory, 'restored'); assert.equal((await restoreData({ backup, dataDir: target })).status, 'ok');
    const restored = await openStore(target);
    try {
      assert.equal(restored.config.installationId, f.ctx.config.installationId); assert.deepEqual(deriveTime(restored, f.filter), original); assert.equal(restored.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 2); assert.equal((await revisionDetail(restored, revisionId)).content, content);
      assert.equal(drainQueue(restored).inserted, 3);
      assert.equal(queueCodex(restored.config.dataDir, codex.id, callback), 2); assert.equal(drainQueue(restored).duplicates, 2);
      assert.doesNotThrow(() => signalHuman(restored, f.projectId));
    } finally { await restored.shutdown(); }
    await assert.rejects(restoreData({ backup, dataDir: target }), { code: 'RESTORE_TARGET_OCCUPIED' });
    await writeFile(join(backup, 'worklog.sqlite'), 'corrupted');
    await assert.rejects(restoreData({ backup, dataDir: join(f.directory, 'bad') }), { code: 'BACKUP_INTEGRITY_FAILED' });
    const parentFile = join(f.directory, 'not-a-directory'); await writeFile(parentFile, 'keep');
    await assert.rejects(backupData(f.ctx, join(parentFile, 'backup')), { code: 'BACKUP_IO_FAILED' }); assert.equal(await readFile(parentFile, 'utf8'), 'keep');
    const nativeBackup = f.ctx.db.backup;
    try {
      for (const [native, code] of [['ENOSPC', 'BACKUP_DISK_FULL'], ['EACCES', 'BACKUP_PERMISSION_DENIED']]) {
        f.ctx.db.backup = async () => { throw Object.assign(new Error('PRIVATE_PATH_DO_NOT_LOG'), { code: native }); };
        await assert.rejects(backupData(f.ctx, join(f.directory, `failure-${native}`)), { code });
      }
    } finally { f.ctx.db.backup = nativeBackup; }
    const incomplete = join(f.directory, 'incomplete'); await mkdir(incomplete); await writeFile(join(incomplete, 'restore-in-progress'), 'unfinished');
    await assert.rejects(openStore(incomplete), { code: 'RESTORE_INCOMPLETE' });
  } finally { await f.close(); }
});

test('configurações: persistência, política e orçamento', async () => {
  const f = await fixture();
  try {
    const root = listProjects(f.ctx)[0]!.roots[0]!;
    const cfg = configure(f.ctx, { revision: 0, idleMs: 60000, retentionDays: 60, syncIntervalMs: 30000, storageBudgetBytes: 1048576, excludedPaths: ['private'] });
    assert.equal(cfg.idleMs, 60000); assert.equal(operatingConfig(f.ctx).retentionDays, 60); assert.ok(storageUsage(f.ctx).databaseBytes > 0);
    assert.throws(() => configure(f.ctx, { revision: 0, idleMs: 0 }), { code: 'CONFIG_CHANGED' });
    assert.throws(() => configure(f.ctx, { revision: cfg.revision, idleMs: 0 }), { code: 'INVALID_CONFIGURATION' });
    const contentRevision = (path: string, content: string) => ({ id: randomUUID(), rootId: root.id!, fileId: randomUUID(), path, content, sha256: createHash('sha256').update(content).digest('hex'), occurredAt: '2026-11-05T09:00:00.000Z', operation: 'baseline' as const, observation: 'baseline' as const, size: Buffer.byteLength(content), previousRevisionId: null, previousPath: null, unavailableReason: null });
    await writeFile(join(f.root, 'visible.txt'), 'preservado'); const visible = contentRevision('visible.txt', 'preservado'); storeRevision(f.ctx, visible);
    const selection = { ...f.filter, projectIds: [f.projectId] };
    assert.equal((await revisionDetail(f.ctx, visible.id)).content, 'preservado');
    configure(f.ctx, { revision: cfg.revision, excludedPaths: ['private', 'visible.txt'] });
    assert.throws(() => storeRevision(f.ctx, { ...visible, id: randomUUID() }), { code: 'REVISION_POLICY_DENIED' });
    await assert.rejects(revisionDetail(f.ctx, visible.id), { code: 'REVISION_NOT_FOUND', status: 404 });
    assert.equal(queryReport(f.ctx, selection, defaultReportOptions).revisions.length, 0);
    configure(f.ctx, { revision: operatingConfig(f.ctx).revision, excludedPaths: ['private'] });
    await mkdir(join(f.root, 'private')); await writeFile(join(f.root, 'private', 'denied.txt'), 'secret');
    assert.throws(() => storeRevision(f.ctx, { id: randomUUID(), rootId: root.id!, fileId: randomUUID(), path: 'private/denied.txt', content: 'secret', sha256: createHash('sha256').update('secret').digest('hex'), occurredAt: new Date().toISOString(), operation: 'baseline', observation: 'baseline', size: 6, previousRevisionId: null, previousPath: null, unavailableReason: null }), { code: 'REVISION_POLICY_DENIED' });
    setRootEnabled(f.ctx, root.id!, false); registerProjectRoot(f.ctx, { path: f.root, projectName: 'Projeto teste', deviceId: f.ctx.config.deviceId });
    assert.equal(listProjects(f.ctx)[0]!.roots[0]!.enabled, false);
    assert.throws(() => storeRevision(f.ctx, { ...visible, id: randomUUID() }), { code: 'REVISION_POLICY_DENIED' });
    await assert.rejects(revisionDetail(f.ctx, visible.id), { code: 'REVISION_NOT_FOUND', status: 404 });
    assert.equal(queryReport(f.ctx, selection, defaultReportOptions).revisions.length, 0);
    setRootEnabled(f.ctx, root.id!, true);
    signalHuman(f.ctx, f.projectId); const focusId = stableId(f.ctx.config.installationId, 'focus'); controlSource(f.ctx, focusId, false, 0);
    assert.throws(() => signalHuman(f.ctx, f.projectId), { code: 'SOURCE_PAUSED' }); assert.doesNotThrow(() => signalHuman(f.ctx, null, true));
    const filesId = stableId(f.ctx.config.installationId, 'files'); registerSource(f.ctx, { id: filesId, deviceId: f.ctx.config.deviceId, installationId: f.ctx.config.installationId, tool: 'files', profile: 'observer', version: '1', configPath: join(f.ctx.config.dataDir, 'file-observer'), enabled: true });
    controlSource(f.ctx, filesId, false, 0);
    await writeFile(join(f.root, 'paused.txt'), 'paused');
    assert.throws(() => storeRevision(f.ctx, { id: randomUUID(), rootId: root.id!, fileId: randomUUID(), path: 'paused.txt', content: 'paused', sha256: createHash('sha256').update('paused').digest('hex'), occurredAt: new Date().toISOString(), operation: 'baseline', observation: 'baseline', size: 6, previousRevisionId: null, previousPath: null, unavailableReason: null }), { code: 'SOURCE_PAUSED' }); controlSource(f.ctx, filesId, true, 1);
    const content = 'x'.repeat(2 * 1024 * 1024); await writeFile(join(f.root, 'large.txt'), content);
    const id = storeRevision(f.ctx, { id: randomUUID(), rootId: root.id!, fileId: randomUUID(), path: 'large.txt', sha256: createHash('sha256').update(content).digest('hex'), content, size: Buffer.byteLength(content), occurredAt: new Date().toISOString(), operation: 'baseline', observation: 'baseline', previousRevisionId: null, previousPath: null, unavailableReason: null });
    assert.equal((await revisionDetail(f.ctx, id)).content, null); assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 2);
    const reopened = await openStore(f.ctx.config.dataDir); try {
      const config = operatingConfig(reopened); assert.equal(config.idleMs, 60000); assert.equal(config.retentionDays, 60); assert.equal(config.syncIntervalMs, 30000); assert.equal(config.storageBudgetBytes, 1048576); assert.deepEqual(config.excludedPaths, ['private']);
    } finally { await reopened.shutdown(); }
  } finally { await f.close(); }
});

test('configurações: efeito do idle com probe controlado', async () => {
  const f = await fixture();
  try {
    configure(f.ctx, { revision: 0, idleMs: 60000 });
    execFileSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', `
      import assert from 'node:assert/strict'; import { mock } from 'node:test'; import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path'; import { setImmediate } from 'node:timers/promises';
      const { default: ignored, ...native } = await import('node:child_process'); let idleMs = 59999;
      function execFile() {};
      execFile[Symbol.for('nodejs.util.promisify.custom')] = async (_file, args) => ({ stdout: args.includes('IOHIDSystem') ? '"HIDIdleTime" = ' + String(BigInt(idleMs) * 1000000n) : '"CGSSessionScreenIsLocked" = false' });
      mock.module('node:child_process', { namedExports: { ...native, execFile }, defaultExport: { ...native, execFile } });
      const { default: ignoredOs, ...os } = await import('node:os');
      mock.module('node:os', { namedExports: { ...os, platform: () => 'darwin' }, defaultExport: { ...os, platform: () => 'darwin' } });
      const { openStore } = await import(pathToFileURL(resolve('dist/core/context.js')).href);
      const { startFocusObserver } = await import(pathToFileURL(resolve('dist/collectors/focus.js')).href);
      const ctx = await openStore(process.argv[1]); mock.timers.enable({ apis: ['setInterval'] });
      const stop = startFocusObserver(ctx);
      try {
        await setImmediate(); assert.equal(ctx.db.get("SELECT count(*) n FROM events WHERE type = 'machine.idle'").n, 0);
        idleMs = 60000; mock.timers.tick(5000); await setImmediate();
        const events = ctx.db.all("SELECT document FROM events WHERE type = 'machine.idle'"); assert.equal(events.length, 1); assert.equal(JSON.parse(events[0].document).payload.reason, 'idle');
        assert.equal(ctx.db.get("SELECT count(*) n FROM events WHERE type = 'machine.resume'").n, 1);
        mock.timers.tick(5000); await setImmediate(); assert.equal(ctx.db.get("SELECT count(*) n FROM events WHERE type = 'machine.resume'").n, 1);
        idleMs = 100; mock.timers.tick(5000); await setImmediate(); assert.equal(ctx.db.get("SELECT count(*) n FROM events WHERE type = 'machine.resume'").n, 2);
        mock.timers.tick(5000); await setImmediate(); assert.equal(ctx.db.get("SELECT count(*) n FROM events WHERE type = 'machine.resume'").n, 2);
      } finally { await stop(); mock.timers.reset(); await ctx.shutdown(); }
    `, f.ctx.config.dataDir], { timeout: 10000, stdio: 'pipe' });
    assert.equal(f.ctx.db.get<{ n: number }>("SELECT count(*) n FROM events WHERE type = 'machine.idle'")!.n, 1);
    // Retorno na partida e depois da ausência; amostras ativas seguidas não repetem o evento.
    assert.equal(f.ctx.db.get<{ n: number }>("SELECT count(*) n FROM events WHERE type = 'machine.resume'")!.n, 2);
  } finally { await f.close(); }
});
