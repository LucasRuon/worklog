import { DomainError, uuid, type AppContext, type EvidenceLink, type FileRevision } from '../core/contracts.js';
import { posix } from 'node:path';

export function linkEvidence(ctx: AppContext, link: EvidenceLink): void {
  uuid(link.sourceId); uuid(link.targetId);
  if (!['explicit', 'inferred', 'unlinked'].includes(link.confidence) || typeof link.reason !== 'string' || !link.reason.trim() || link.reason.length > 500) throw new DomainError('INVALID_EVIDENCE_LINK');
  const revision = ctx.db.get<{ document: string; root_id: string }>('SELECT * FROM file_revisions WHERE id = ?', link.sourceId);
  if (!revision) throw new DomainError('REVISION_NOT_FOUND', 404);
  const root = ctx.db.get<{ project_id: string; device_id: string; repository_id: string | null }>('SELECT * FROM project_roots WHERE id = ?', revision.root_id)!;
  const session = ctx.db.get<{ project_id: string | null; device_id: string }>('SELECT project_id, device_id FROM sessions WHERE id = ?', link.targetId);
  const commit = ctx.db.get<{ repository_id: string }>('SELECT repository_id FROM git_commits WHERE id = ?', link.targetId);
  if (!(session && session.project_id === root.project_id && session.device_id === root.device_id) && !(commit && commit.repository_id === root.repository_id)) throw new DomainError('EVIDENCE_SCOPE_MISMATCH');
  ctx.db.run('INSERT INTO evidence_links VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_id, target_id) DO UPDATE SET confidence = excluded.confidence, reason = excluded.reason WHERE evidence_links.confidence != ? OR excluded.confidence = ?', link.sourceId, link.targetId, session ? 'session' : 'commit', link.confidence, link.reason.trim(), new Date().toISOString(), 'explicit', 'explicit');
}

export function inferEvidence(ctx: AppContext, revisionId: string) {
  const row = ctx.db.get<{ document: string; root_id: string }>('SELECT * FROM file_revisions WHERE id = ?', revisionId);
  if (!row) return;
  const revision = JSON.parse(row.document) as FileRevision;
  if (revision.operation === 'baseline') return;
  const root = ctx.db.get<{ project_id: string; device_id: string; path: string; worktree: string; repository_id: string | null }>('SELECT * FROM project_roots WHERE id = ?', row.root_id)!;
  // Sem caminhos nas chamadas nativas, proximidade temporal é apenas uma hipótese de autoria.
  if (revision.observation === 'watch') {
    ctx.db.run("DELETE FROM evidence_links WHERE source_id = ? AND kind = 'session' AND confidence = 'inferred'", revisionId);
    const sessions = ctx.db.all<{ id: string }>('SELECT id FROM sessions WHERE project_id = ? AND device_id = ? AND started_at <= ? AND last_event_at >= ? ORDER BY last_event_at DESC LIMIT 100', root.project_id, root.device_id, revision.occurredAt, new Date(Date.parse(revision.occurredAt) - 120_000).toISOString());
    for (const session of sessions) linkEvidence(ctx, { sourceId: revisionId, targetId: session.id, confidence: 'inferred', reason: sessions.length > 1 ? 'Janela temporal ambígua: várias sessões no mesmo projeto e máquina; não comprova autoria.' : 'Sessão no mesmo projeto e máquina perto do horário observado; não comprova autoria.' });
  }
  if (root.repository_id) {
    const path = posix.join(posix.relative(root.worktree, root.path), revision.path);
    const commits = ctx.db.all<{ id: string }>('SELECT DISTINCT c.id FROM git_commits c JOIN git_files f ON f.commit_id = c.id WHERE f.root_id = ? AND f.path = ? AND c.committed_at >= ? AND c.committed_at <= ? LIMIT 100', row.root_id, path, new Date(Math.floor(Date.parse(revision.occurredAt) / 1000) * 1000).toISOString(), new Date(Date.parse(revision.occurredAt) + 30 * 60_000).toISOString());
    for (const commit of commits) linkEvidence(ctx, { sourceId: revisionId, targetId: commit.id, confidence: 'inferred', reason: 'Mesmo arquivo em commit de horário compatível (precisão Git: 1 s), até 30 min da observação; relação temporal, sem comprovar autoria ou inclusão desta revisão.' });
  }
}

export function evidenceLinks(ctx: AppContext, revisionId: string) {
  const links = ctx.db.all<{ target_id: string; kind: 'session' | 'commit'; confidence: EvidenceLink['confidence']; reason: string }>('SELECT * FROM evidence_links WHERE source_id = ? ORDER BY kind, confidence, target_id', revisionId);
  const explicit = new Set(links.filter((l) => l.confidence === 'explicit').map((l) => l.kind));
  return links.filter((l) => !explicit.has(l.kind) || l.confidence === 'explicit').map((l) => ({ sourceId: revisionId, targetId: l.target_id, kind: l.kind, confidence: l.confidence, reason: l.reason, label: l.kind === 'session' ? ctx.db.get<{ native_session_id: string }>('SELECT native_session_id FROM sessions WHERE id = ?', l.target_id)?.native_session_id ?? 'Sessão' : ctx.db.get<{ sha: string }>('SELECT sha FROM git_commits WHERE id = ?', l.target_id)?.sha.slice(0, 12) ?? 'Commit' }));
}
