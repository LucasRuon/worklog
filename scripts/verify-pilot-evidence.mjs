import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { openStore } from '../dist/core/context.js';
import { revisionDetail } from '../dist/collectors/revisions.js';
import { pullRequestsForCommit } from '../dist/providers/github.js';

async function main() {
  const { values } = parseArgs({ options: { clone: { type: 'string' } } });
  assert.ok(values.clone, 'clone-path');
  const dataDir = await realpath(resolve(values.clone));
  const base = '/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode';
  assert.match(relative(base, dataDir), /^worklog-pilot-safe-[A-Za-z0-9]+\/restored$/, 'clone-path');
  const ctx = await openStore(dataDir);
  try {
    const root = join(homedir(), 'Downloads/Sistemas/Worklog');
    const rows = ctx.db.all(`SELECT DISTINCT v.id,v.path,v.sha256,v.occurred_at,r.path root,c.repository_id,c.id commit_id,c.sha,c.committed_at FROM file_revisions v JOIN project_roots r ON r.id=v.root_id JOIN git_files f ON f.root_id=r.id AND f.path=v.path JOIN git_commits c ON c.id=f.commit_id JOIN pull_request_commits pc ON pc.sha=c.sha WHERE r.path=? AND v.path IN ('scripts/smoke-codex-recovery.ts','docs/FONTES-HISTORICO.md','src/collectors/codex-history.ts') AND c.committed_at>=strftime('%Y-%m-%dT%H:%M:%fZ',v.occurred_at,'-1 second') AND c.committed_at<=strftime('%Y-%m-%dT%H:%M:%fZ',v.occurred_at,'+30 minutes') ORDER BY v.occurred_at DESC LIMIT 100`, root);
    let proof;
    for (const row of rows) {
      const bytes = execFileSync('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-C', root, 'show', `${row.sha}:${row.path}`], { timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) continue;
      const detail = await revisionDetail(ctx, row.id);
      const sessions = detail.links.filter(l => l.kind === 'session');
      const commit = detail.links.find(l => l.kind === 'commit' && l.targetId === row.commit_id);
      const prs = pullRequestsForCommit(ctx, row.repository_id, row.sha);
      if (!sessions.length || !commit || !prs.some(p => p.number === 1)) continue;
      assert.ok(detail.diff.patch, 'diff'); assert.equal(detail.diff.reason, null, 'diff');
      assert.ok(sessions.every(l => l.confidence === 'inferred'), 'session'); assert.equal(commit.confidence, 'inferred', 'commit');
      assert.ok(prs.some(p => p.number === 1), 'pr');
      const ambiguous = sessions.some(l => l.reason.includes('ambígua'));
      if (sessions.length > 1) assert.ok(ambiguous, 'ambiguity');
      proof = { revisionId: row.id, path: row.path, revisionAt: row.occurred_at, commit: row.sha, commitAt: row.committed_at, revisionContentMatchesCommitBlob: true, diffAvailable: true, sessionLinks: sessions.length, sessionConfidence: 'inferred', commitLinkConfidence: 'inferred', multipleSessions: sessions.length > 1, ambiguityLabel: ambiguous, pullRequests: prs.map(p => ({ number: p.number, state: p.state, stale: p.stale })), scope: 'source-backed-isolated-restored-store-not-production-link-write', at: new Date().toISOString() };
      break;
    }
    assert.ok(proof, 'revision-hash / nenhuma cadeia natural comprovada');
    await mkdir('artifacts/t24-safe', { recursive: true, mode: 0o700 });
    await writeFile('artifacts/t24-safe/evidence-chain.json', JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(proof, null, 2));
  } finally { await ctx.shutdown(); }
}

void main().catch(error => { console.error(JSON.stringify({ passed: false, code: error?.code ?? 'T24_EVIDENCE_FAILED', assertion: error?.operator ?? null })); process.exitCode = 1; });
