import assert from 'node:assert/strict';
import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { openStore } from '../../src/core/context.js';
import { pollFiles, reconcileRoot, stopFiles, watchRoot } from '../../src/collectors/files.js';
import { getFileHistory, revisionDetail } from '../../src/collectors/revisions.js';

test('arquivos: baseline, save atômico, renome, exclusão, política e recuperação', async () => {
  const f = await fixture();
  try {
    const root = listProjects(f.ctx)[0]!.roots[0]!; const path = join(f.root, 'ação.txt');
    await writeFile(path, 'primeiro\n'); await reconcileRoot(f.ctx, root);
    let history = getFileHistory(f.ctx, root.id!, 'ação.txt');
    assert.equal(history.length, 1); assert.equal(history[0]!.operation, 'baseline');
    await writeFile(join(f.root, 'temporário'), 'segundo\n'); await rename(join(f.root, 'temporário'), path);
    await reconcileRoot(f.ctx, root);
    history = getFileHistory(f.ctx, root.id!, 'ação.txt'); assert.equal(history.length, 2);
    assert.match((await revisionDetail(f.ctx, history[0]!.id)).diff.patch!, /-primeiro\n\+segundo/);
    await reconcileRoot(f.ctx, root); assert.equal(getFileHistory(f.ctx, root.id!, 'ação.txt').length, 2);
    await rename(path, join(f.root, 'novo nome.txt')); await reconcileRoot(f.ctx, root);
    history = getFileHistory(f.ctx, root.id!, 'novo nome.txt');
    assert.equal(history[0]!.operation, 'rename'); assert.equal(history[0]!.previousPath, 'ação.txt');
    assert.equal(history.length, 3);
    await rm(join(f.root, 'novo nome.txt')); await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, 'novo nome.txt')[0]!.operation, 'delete');
    await writeFile(join(f.root, '.env'), 'SECRET_MUST_NOT_PERSIST');
    await mkdir(join(f.root, 'node_modules')); await writeFile(join(f.root, 'node_modules', 'secret.txt'), 'SECRET_MUST_NOT_PERSIST');
    await writeFile(join(f.directory, 'outside.txt'), 'SECRET_MUST_NOT_PERSIST');
    await symlink(join(f.directory, 'outside.txt'), join(f.root, 'outside.txt'));
    await writeFile(join(f.root, 'bin.dat'), Buffer.from([1, 0, 2]));
    await writeFile(join(f.root, 'controles.dat'), Buffer.from([1, 2, 3]));
    await writeFile(join(f.root, 'large.txt'), 'a'.repeat(2 * 1024 * 1024 + 1));
    await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, '.env').length, 0);
    assert.equal(getFileHistory(f.ctx, root.id!, 'outside.txt').length, 0);
    assert.equal(getFileHistory(f.ctx, root.id!, 'bin.dat')[0]!.unavailableReason, 'binary');
    assert.equal(getFileHistory(f.ctx, root.id!, 'controles.dat')[0]!.unavailableReason, 'binary');
    assert.equal(getFileHistory(f.ctx, root.id!, 'large.txt')[0]!.unavailableReason, 'too-large');
    assert.equal(JSON.stringify(f.ctx.db.all('SELECT * FROM file_contents')).includes('SECRET_MUST_NOT_PERSIST'), false);
    await writeFile(join(f.root, 'retomada.txt'), 'antes'); await reconcileRoot(f.ctx, root);
    await rename(f.root, `${f.root}-offline`);
    await assert.rejects(reconcileRoot(f.ctx, root));
    await rename(`${f.root}-offline`, f.root);
    await writeFile(join(f.root, 'retomada.txt'), 'depois'); await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, 'retomada.txt').length, 2);
    assert.ok(f.ctx.db.get<{ last_gap_at: string }>('SELECT last_gap_at FROM file_scans WHERE root_id = ?', root.id!)!.last_gap_at);
    await writeFile(join(f.root, 'igual-a.txt'), 'deduplicado'); await writeFile(join(f.root, 'igual-b.txt'), 'deduplicado');
    await reconcileRoot(f.ctx, root);
    assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_contents WHERE content = ?', 'deduplicado')!.n, 1);
    const nested = join(f.root, 'pausada'); await mkdir(nested);
    registerProjectRoot(f.ctx, { path: nested, projectName: 'Pausada', deviceId: f.ctx.config.deviceId, enabled: false });
    await writeFile(join(nested, 'privado.txt'), 'SECRET_MUST_NOT_PERSIST'); await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, 'pausada/privado.txt').length, 0);
    const outside = join(f.directory, 'outside-root'); await mkdir(outside); await writeFile(join(outside, 'retomada.txt'), 'SECRET_MUST_NOT_PERSIST');
    await rename(f.root, `${f.root}-offline`); await symlink(outside, f.root);
    await assert.rejects(reconcileRoot(f.ctx, root));
    assert.equal(getFileHistory(f.ctx, root.id!, 'retomada.txt').length, 0);
    await rm(f.root); await rename(`${f.root}-offline`, f.root);
    assert.equal(JSON.stringify(f.ctx.db.all('SELECT * FROM file_contents')).includes('SECRET_MUST_NOT_PERSIST'), false);
  } finally { await f.close(); }
});

test('watcher: duas gravações no debounce, shutdown e reconciliação sem watcher', async () => {
  const f = await fixture(); let stop: (() => Promise<void>) | undefined;
  try {
    const root = listProjects(f.ctx)[0]!.roots[0]!;
    stop = await watchRoot(f.ctx, root);
    await writeFile(join(f.root, 'observado.txt'), 'um'); await writeFile(join(f.root, 'observado.txt'), 'dois');
    const deadline = Date.now() + 10_000;
    while (!getFileHistory(f.ctx, root.id!, 'observado.txt').length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(getFileHistory(f.ctx, root.id!, 'observado.txt').length, 1);
    assert.equal((await revisionDetail(f.ctx, getFileHistory(f.ctx, root.id!, 'observado.txt')[0]!.id)).content, 'dois');
    await stop(); stop = undefined;
    await writeFile(join(f.root, 'observado.txt'), 'três'); await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, 'observado.txt').length, 2);
  } finally { await stop?.(); await f.close(); }
});

test('observadores concorrentes: lease entre painel e serviço, transferência e shutdown seletivo', async () => {
  const f = await fixture(); const other = await openStore(f.ctx.config.dataDir);
  try {
    await pollFiles(f.ctx); await pollFiles(other);
    const root = listProjects(f.ctx)[0]!.roots[0]!;
    const first = f.ctx.db.get<{ owner: string }>('SELECT owner FROM file_scans WHERE root_id = ?', root.id!)!.owner;
    f.ctx.db.run('UPDATE file_scans SET lease_ms = 0 WHERE root_id = ?', root.id!);
    await pollFiles(other);
    const second = f.ctx.db.get<{ owner: string }>('SELECT owner FROM file_scans WHERE root_id = ?', root.id!)!.owner;
    assert.notEqual(first, second);
    await stopFiles(f.ctx);
    assert.equal(f.ctx.db.get<{ owner: string }>('SELECT owner FROM file_scans WHERE root_id = ?', root.id!)!.owner, second);
    await writeFile(join(f.root, 'único.txt'), 'uma observação');
    const deadline = Date.now() + 10_000;
    while (!getFileHistory(f.ctx, root.id!, 'único.txt').length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(getFileHistory(f.ctx, root.id!, 'único.txt').length, 1);
  } finally { await stopFiles(f.ctx); await stopFiles(other); await other.shutdown(); await f.close(); }
});
