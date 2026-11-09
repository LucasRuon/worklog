import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { assertRecord, exactKeys, utc, uuid, DomainError, type AppContext, type GitCommit, type GitFile } from '../core/contracts.js';
import { gitPathAllowed, stableId } from '../core/policy.js';
import type { AgentEnvelope } from './protocol.js';

type Metadata = Omit<GitCommit, 'files' | 'origins'>;
interface Scan { rootId: string; scannedAt: string | null; error: string | null; pending: boolean; refs: { name: string; sha: string }[] }
interface Packet {
  installationId: string; snapshot: string; offset: number; nextOffset: number | null; unchanged: boolean;
  scans: Scan[]; items: { rootId: string; metadata: Metadata; files: GitFile[]; reachable: boolean; observedAt: string }[];
}
const hash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export function exportGitPacket(ctx: AppContext, offset = 0, expected?: string, known?: string): Packet {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new DomainError('INVALID_CURSOR');
  const scans = ctx.db.all<{ root_id: string; scanned_at: string | null; error: string | null; pending: number; refs: string }>('SELECT s.* FROM git_scans s JOIN project_roots r ON s.root_id = r.id WHERE r.device_id = ? AND r.enabled = 1 ORDER BY s.root_id', ctx.config.deviceId).map((s) => ({ rootId: s.root_id, scannedAt: s.scanned_at, error: s.error, pending: Boolean(s.pending), refs: JSON.parse(s.refs) as Scan['refs'] }));
  // O horário da varredura muda mesmo sem alteração Git. Mantê-lo fora da identidade permite retomar históricos grandes.
  const membership = ctx.db.all('SELECT o.root_id, o.commit_id, o.reachable FROM git_observations o JOIN project_roots r ON o.root_id = r.id WHERE r.device_id = ? AND r.enabled = 1 ORDER BY o.root_id, o.commit_id', ctx.config.deviceId);
  const snapshot = createHash('sha256').update(JSON.stringify(scans.map(({ scannedAt: _, ...scan }) => scan))).update(JSON.stringify(membership)).digest('hex');
  if (expected && expected !== snapshot) throw new DomainError('GIT_SNAPSHOT_CHANGED');
  const packet: Packet = { installationId: ctx.config.installationId, snapshot, offset, nextOffset: null, unchanged: known === snapshot, scans, items: [] };
  if (packet.unchanged) return packet;
  const rows = ctx.db.all<{ root_id: string; document: string; commit_id: string; reachable: number; observed_at: string }>('SELECT o.*, c.document FROM git_observations o JOIN git_commits c ON o.commit_id = c.id JOIN project_roots r ON o.root_id = r.id WHERE r.device_id = ? AND r.enabled = 1 ORDER BY o.root_id, o.commit_id LIMIT 51 OFFSET ?', ctx.config.deviceId, offset);
  packet.nextOffset = rows.length > 50 ? offset + 50 : null;
  packet.items = rows.slice(0, 50).map((row) => ({ rootId: row.root_id, metadata: JSON.parse(row.document) as Metadata, reachable: Boolean(row.reachable), observedAt: row.observed_at, files: ctx.db.all<{ path: string; previous_path: string | null; status: string }>('SELECT * FROM git_files WHERE root_id = ? AND commit_id = ? ORDER BY position', row.root_id, row.commit_id).map((f) => ({ path: f.path, previousPath: f.previous_path, status: f.status })) }));
  if (Buffer.byteLength(JSON.stringify(packet)) > 8 * 1024 * 1024) throw new DomainError('GIT_PACKET_TOO_LARGE');
  return packet;
}

export function importGitPacket(ctx: AppContext, description: AgentEnvelope, input: unknown, offset: number): Packet {
  assertRecord(input); exactKeys(input, ['installationId', 'snapshot', 'offset', 'nextOffset', 'unchanged', 'scans', 'items']);
  if (input.installationId !== description.identity.installationId || input.offset !== offset || typeof input.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(input.snapshot) || typeof input.unchanged !== 'boolean' || !Array.isArray(input.scans) || input.scans.length > 1000 || !Array.isArray(input.items) || input.items.length > 50 || (input.nextOffset !== null && input.nextOffset !== offset + input.items.length) || (input.nextOffset !== null && input.items.length !== 50) || (input.unchanged && (input.items.length || input.nextOffset !== null))) throw new DomainError('GIT_PACKET_INVALID');
  const roots = new Map(description.roots.map((r) => [r.id!, r]));
  const includedRoots = new Set([...input.scans, ...input.items].map((value) => { assertRecord(value); uuid(value.rootId); return value.rootId; }));
  const mapped = new Map<string, { id: string; repository_id: string; path: string; worktree: string; project_id: string }>();
  for (const [id, root] of roots) {
    if (!includedRoots.has(id)) continue;
    const local = ctx.db.get<{ id: string; repository_id: string | null; path: string; worktree: string; project_id: string }>('SELECT * FROM project_roots WHERE device_id = ? AND path = ? AND enabled = 1', root.deviceId, root.path);
    if (local) mapped.set(id, { ...local, repository_id: local.repository_id ?? stableId('remote-git', root.deviceId, root.worktree ?? root.path) });
  }
  const text = (v: unknown, max: number) => { if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw new DomainError('GIT_PACKET_INVALID'); };
  for (const scan of input.scans) {
    assertRecord(scan); exactKeys(scan, ['rootId', 'scannedAt', 'error', 'pending', 'refs']);
    if (!mapped.has(String(scan.rootId)) || typeof scan.pending !== 'boolean' || !Array.isArray(scan.refs) || scan.refs.length > 10000) throw new DomainError('GIT_PACKET_INVALID');
    if (scan.scannedAt !== null) utc(scan.scannedAt); if (scan.error !== null) text(scan.error, 100);
    for (const ref of scan.refs) { assertRecord(ref); exactKeys(ref, ['name', 'sha']); text(ref.name, 4096); if (!hash.test(String(ref.sha))) throw new DomainError('GIT_PACKET_INVALID'); }
  }
  for (const item of input.items) {
    assertRecord(item); exactKeys(item, ['rootId', 'metadata', 'files', 'reachable', 'observedAt']);
    if (!mapped.has(String(item.rootId)) || typeof item.reachable !== 'boolean' || !Array.isArray(item.files) || item.files.length > 100000) throw new DomainError('GIT_PACKET_INVALID');
    utc(item.observedAt); assertRecord(item.metadata); const m = item.metadata;
    exactKeys(m, ['id', 'repositoryId', 'sha', 'parents', 'authorName', 'authorEmail', 'authoredAt', 'committerName', 'committerEmail', 'committedAt', 'message']);
    uuid(m.id); uuid(m.repositoryId); utc(m.authoredAt); utc(m.committedAt);
    if (!hash.test(String(m.sha)) || !Array.isArray(m.parents) || m.parents.length > 100 || m.parents.some((p) => !hash.test(String(p)))) throw new DomainError('GIT_PACKET_INVALID');
    for (const key of ['authorName', 'authorEmail', 'committerName', 'committerEmail', 'message']) text(m[key], 1024 * 1024);
    const root = mapped.get(String(item.rootId))!;
    for (const file of item.files) {
      assertRecord(file); exactKeys(file, ['path', 'previousPath', 'status']);
      const allowed = (p: unknown) => typeof p === 'string' && gitPathAllowed(p) && (posix.resolve(root.worktree, p) === root.path || posix.resolve(root.worktree, p).startsWith(`${root.path}/`));
      if (!allowed(file.path) || (file.previousPath !== null && !allowed(file.previousPath)) || !/^[ACDMRTUXB][0-9]*$/.test(String(file.status))) throw new DomainError('GIT_PACKET_INVALID');
    }
  }
  const packet = input as unknown as Packet;
  ctx.db.transaction(() => {
    for (const root of mapped.values()) {
      ctx.db.run('INSERT OR IGNORE INTO repositories(id, canonical, primary_project_id) VALUES (?, ?, ?)', root.repository_id, `remote-local:${description.identity.deviceId}:${root.worktree}`, root.project_id);
      ctx.db.run('UPDATE project_roots SET repository_id = ? WHERE id = ? AND repository_id IS NULL', root.repository_id, root.id);
    }
    for (const item of packet.items) {
      const root = mapped.get(item.rootId)!; const metadata = { ...item.metadata, repositoryId: root.repository_id, id: stableId(root.repository_id, item.metadata.sha) };
      ctx.db.run('INSERT OR IGNORE INTO git_commits VALUES (?, ?, ?, ?, ?)', metadata.id, metadata.repositoryId, metadata.sha, metadata.committedAt, JSON.stringify(metadata));
      ctx.db.run('INSERT INTO git_observations VALUES (?, ?, ?, ?) ON CONFLICT(root_id, commit_id) DO UPDATE SET reachable = excluded.reachable, observed_at = excluded.observed_at', root.id, metadata.id, Number(item.reachable), item.observedAt);
      ctx.db.run('DELETE FROM git_files WHERE root_id = ? AND commit_id = ?', root.id, metadata.id);
      item.files.forEach((file, i) => ctx.db.run('INSERT INTO git_files VALUES (?, ?, ?, ?, ?, ?)', root.id, metadata.id, i, file.path, file.previousPath, file.status));
    }
    for (const scan of packet.scans) ctx.db.run('INSERT INTO git_scans(root_id, scanned_at, pending, error, refs) VALUES (?, ?, ?, ?, ?) ON CONFLICT(root_id) DO UPDATE SET scanned_at = excluded.scanned_at, pending = excluded.pending, error = excluded.error, refs = excluded.refs', mapped.get(scan.rootId)!.id, scan.scannedAt, Number(scan.pending || packet.nextOffset !== null), scan.error, JSON.stringify(scan.refs));
    ctx.db.run('INSERT INTO git_remote_sync VALUES (?, ?, ?, ?, NULL) ON CONFLICT(installation_id) DO UPDATE SET snapshot = excluded.snapshot, next_offset = excluded.next_offset, complete = excluded.complete, error = NULL', packet.installationId, packet.snapshot, packet.nextOffset ?? 0, Number(packet.nextOffset === null));
  });
  return packet;
}

export async function syncRemoteGit(ctx: AppContext, description: AgentEnvelope, run: (command: string, args?: string[]) => Promise<string>) {
  if (!description.capabilities?.includes('git-v1')) return;
  const state = ctx.db.get<{ snapshot: string; next_offset: number; complete: number }>('SELECT * FROM git_remote_sync WHERE installation_id = ?', description.identity.installationId);
  let offset = state?.complete ? 0 : state?.next_offset ?? 0; let snapshot = state?.snapshot;
  const deadline = Date.now() + 10_000;
  try {
    for (let i = 0; i < 10 && Date.now() < deadline; i++) {
      const raw: unknown = JSON.parse(await run('git', ['--after', String(offset), '--expected-installation', description.identity.installationId, ...(offset && snapshot ? ['--snapshot', snapshot] : state?.complete && snapshot ? ['--known', snapshot] : [])]));
      assertRecord(raw);
      if ((offset > 0 && raw.snapshot !== snapshot) || (raw.unchanged && (!state?.complete || raw.snapshot !== state.snapshot))) throw new DomainError('GIT_SNAPSHOT_CHANGED');
      const packet = importGitPacket(ctx, description, raw, offset); snapshot = packet.snapshot;
      if (packet.nextOffset === null) break;
      offset = packet.nextOffset;
    }
  } catch {
    // Cursor de eventos é independente. Falha Git preserva commits e reinicia seu snapshot na próxima rodada.
    ctx.db.run('INSERT INTO git_remote_sync VALUES (?, ?, 0, 0, ?) ON CONFLICT(installation_id) DO UPDATE SET next_offset = 0, complete = 0, error = excluded.error', description.identity.installationId, '', 'GIT_REMOTE_SYNC_FAILED');
  }
}
