import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { projectSessions } from '../../src/core/sessions.js';
import { reconcileRoot } from '../../src/collectors/files.js';
import { getFileHistory, revisionDetail, sessionFileChanges } from '../../src/collectors/revisions.js';
import { linkEvidence } from '../../src/collectors/relations.js';
import { scanCommits } from '../../src/collectors/git.js';

test('evidências: concorrência inferida, associação explícita prevalece, commit e conteúdo perdido', async () => {
  const f = await fixture();
  try {
    execFileSync('git', ['init', '-q', f.root]);
    registerProjectRoot(f.ctx, { path: f.root, projectName: 'Projeto teste', deviceId: f.ctx.config.deviceId });
    const root = listProjects(f.ctx)[0]!.roots[0]!;
    await writeFile(join(f.root, 'arquivo.txt'), 'antes\n'); await reconcileRoot(f.ctx, root);
    const now = Date.now();
    for (const session of ['one', 'two']) {
      f.emit('session.start', new Date(now - 60_000).toISOString(), { reason: 'startup' }, { nativeSessionId: session });
      f.emit('tool.start', new Date(now - 1000).toISOString(), { toolName: 'Edit', toolUseId: `edit-${session}` }, { nativeSessionId: session });
    }
    projectSessions(f.ctx, f.allEvents());
    await writeFile(join(f.root, 'arquivo.txt'), 'depois\n'); await reconcileRoot(f.ctx, root, 'watch');
    const revision = getFileHistory(f.ctx, root.id!, 'arquivo.txt')[0]!;
    let detail = await revisionDetail(f.ctx, revision.id);
    assert.equal(detail.links.length, 2); assert.equal(detail.links.every((l) => l.confidence === 'inferred' && l.reason.includes('ambígua')), true);
    const chosen = detail.links[0]!.targetId; const other = detail.links[1]!.targetId;
    linkEvidence(f.ctx, { sourceId: revision.id, targetId: chosen, confidence: 'explicit', reason: 'Associação do usuário' });
    detail = await revisionDetail(f.ctx, revision.id); assert.equal(detail.links.length, 1); assert.equal(detail.links[0]!.confidence, 'explicit');
    assert.equal(sessionFileChanges(f.ctx, chosen).length, 1); assert.equal(sessionFileChanges(f.ctx, other).length, 0);
    assert.throws(() => linkEvidence(f.ctx, { sourceId: revision.id, targetId: randomUUID(), confidence: 'explicit', reason: 'Sem alvo' }), /EVIDENCE_SCOPE_MISMATCH/);
    execFileSync('git', ['-C', f.root, 'add', '.']);
    execFileSync('git', ['-C', f.root, '-c', 'user.name=Author', '-c', 'user.email=a@example.test', 'commit', '-qm', 'Entrega ligada'], { env: { ...process.env, GIT_AUTHOR_DATE: new Date(now + 2000).toISOString(), GIT_COMMITTER_DATE: new Date(now + 2000).toISOString() } });
    await scanCommits(f.ctx, root);
    detail = await revisionDetail(f.ctx, revision.id);
    assert.equal(detail.links.filter((l) => l.kind === 'commit').length, 1);
    assert.match(detail.diff.patch!, /-antes\n\+depois/);
    f.ctx.db.run('DELETE FROM file_contents WHERE sha256 = ?', createHash('sha256').update('antes\n').digest('hex'));
    assert.equal((await revisionDetail(f.ctx, revision.id)).diff.reason, 'retention');
    assert.equal(getFileHistory(f.ctx, root.id!, 'arquivo.txt').length, 2);
    await writeFile(join(f.root, '.gitignore'), 'arquivo.txt\n'); await reconcileRoot(f.ctx, root);
    assert.equal(getFileHistory(f.ctx, root.id!, 'arquivo.txt').length, 0);
    await assert.rejects(revisionDetail(f.ctx, revision.id), /REVISION_NOT_FOUND/);
  } finally { await f.close(); }
});
