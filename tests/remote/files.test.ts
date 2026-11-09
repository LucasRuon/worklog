import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { reconcileRoot } from '../../src/collectors/files.js';
import { getFileHistory, revisionDetail } from '../../src/collectors/revisions.js';
import { exportBatch, importEnvelope, describeAgent } from '../../src/remote/protocol.js';
import { exportFilePacket, importFilePacket } from '../../src/remote/files.js';

test('revisões remotas: replay, integridade, cursor atômico, diff e revogação por política', async () => {
  const local = await fixture(); const remote = await fixture();
  try {
    execFileSync('git', ['init', '-q', remote.root]);
    registerProjectRoot(remote.ctx, { path: remote.root, projectName: 'Remoto', deviceId: remote.ctx.config.deviceId });
    const root = listProjects(remote.ctx)[0]!.roots[0]!;
    await writeFile(join(remote.root, 'remoto.txt'), 'antes\n'); await reconcileRoot(remote.ctx, root);
    await writeFile(join(remote.root, 'remoto.txt'), 'depois\n'); await reconcileRoot(remote.ctx, root, 'watch');
    importEnvelope(local.ctx, exportBatch(remote.ctx, 0)); const description = describeAgent(remote.ctx);
    const packet = exportFilePacket(remote.ctx); const bad = structuredClone(packet);
    const record = bad.items.find((item) => item.kind === 'revision'); assert.ok(record && record.kind === 'revision'); record.revision.content = 'adulterado';
    assert.throws(() => importFilePacket(local.ctx, description, bad), /INVALID_REVISION_CONTENT/);
    assert.equal(local.ctx.db.all('SELECT * FROM file_revisions').length, 0); assert.equal(local.ctx.db.all('SELECT * FROM file_remote_sync').length, 0);
    importFilePacket(local.ctx, description, packet); importFilePacket(local.ctx, description, packet);
    assert.equal(local.ctx.db.all('SELECT * FROM file_revisions').length, 2);
    const localRoot = listProjects(local.ctx).flatMap((p) => p.roots).find((r) => r.deviceId === remote.ctx.config.deviceId)!;
    const history = getFileHistory(local.ctx, localRoot.id!, 'remoto.txt'); assert.equal(history.length, 2);
    const detail = await revisionDetail(local.ctx, history[0]!.id); assert.match(detail.diff.patch!, /-antes\n\+depois/);
    assert.equal(detail.revision.deviceId, remote.ctx.config.deviceId);
    await writeFile(join(remote.root, '.gitignore'), 'remoto.txt\n'); await reconcileRoot(remote.ctx, root);
    const next = exportFilePacket(remote.ctx, packet.nextSeq); importFilePacket(local.ctx, description, next);
    assert.equal(getFileHistory(local.ctx, localRoot.id!, 'remoto.txt').length, 0);
    await assert.rejects(revisionDetail(local.ctx, history[0]!.id), /REVISION_NOT_FOUND/);
    assert.throws(() => exportFilePacket(remote.ctx, next.nextSeq + 100), /INVALID_CURSOR/);
    assert.equal(local.ctx.db.get<{ seq: number }>('SELECT seq FROM file_remote_sync WHERE installation_id = ?', remote.ctx.config.installationId)!.seq, next.nextSeq);
    for (let i = 0; i < 61; i++) await writeFile(join(remote.root, `page-${i}.txt`), `página ${i}`);
    await reconcileRoot(remote.ctx, root);
    while (remote.ctx.db.get<{ pending: number }>('SELECT pending FROM file_scans WHERE root_id = ?', root.id!)!.pending) await reconcileRoot(remote.ctx, root);
    const pageOne = exportFilePacket(remote.ctx, next.nextSeq); assert.equal(pageOne.hasMore, true);
    importFilePacket(local.ctx, description, pageOne);
    const pageTwo = exportFilePacket(remote.ctx, pageOne.nextSeq); assert.equal(pageTwo.hasMore, false);
    importFilePacket(local.ctx, description, pageTwo);
    assert.equal(local.ctx.db.get<{ n: number }>("SELECT count(*) n FROM file_revisions WHERE path LIKE 'page-%'")!.n, 61);
  } finally { await local.close(); await remote.close(); }
});
