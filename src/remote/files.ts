import { assertRecord, exactKeys, uuid, utc, DomainError, type AppContext, type FileRevision } from '../core/contracts.js';
import { fileScans } from '../collectors/files.js';
import { insertRevision, revisionVisible, setFileAccess, storedRevision, validateRevision } from '../collectors/revisions.js';
import { inferEvidence } from '../collectors/relations.js';
import { listProjects } from '../core/projects.js';
import { gitPathAllowed } from '../core/policy.js';
import type { AgentEnvelope } from './protocol.js';

type Item = { seq: number; kind: 'revision'; revision: FileRevision } | { seq: number; kind: 'access'; rootId: string; path: string; allowed: boolean } | { seq: number; kind: 'skip' };
interface Scan { rootId: string; scannedAt: string | null; monitoringSince: string | null; error: string | null; lastGapAt: string | null; pending: boolean }
interface Packet { installationId: string; after: number; nextSeq: number; hasMore: boolean; items: Item[]; scans: Scan[] }
export function exportFilePacket(ctx: AppContext, after = 0): Packet {
  const max = ctx.db.get<{ seq: number }>('SELECT COALESCE(max(seq), 0) seq FROM file_journal')!.seq;
  if (!Number.isSafeInteger(after) || after < 0 || after > max) throw new DomainError('INVALID_CURSOR');
  const roots = listProjects(ctx).flatMap((p) => p.roots).filter((r) => r.deviceId === ctx.config.deviceId && r.enabled);
  const packet: Packet = { installationId: ctx.config.installationId, after, nextSeq: after, hasMore: false, items: [], scans: fileScans(ctx, { projectIds: [], from: '1970-01-01T00:00:00.000Z', to: '9999-01-01T00:00:00.000Z', timezone: 'UTC', deviceIds: [ctx.config.deviceId] }).map(({ rootId, scannedAt, monitoringSince, error, lastGapAt, pending }) => ({ rootId, scannedAt, monitoringSince, error, lastGapAt, pending })) };
  let bytes = Buffer.byteLength(JSON.stringify(packet));
  for (const row of ctx.db.all<{ seq: number; kind: string; root_id: string; target: string }>('SELECT * FROM file_journal WHERE seq > ? ORDER BY seq LIMIT 100', after)) {
    let item: Item = { seq: row.seq, kind: 'skip' };
    if (roots.some((r) => r.id === row.root_id)) {
      if (row.kind === 'revision') {
        const revision = storedRevision(ctx, row.target); if (!revision) throw new DomainError('FILE_JOURNAL_GAP');
        if (revisionVisible(ctx, revision, roots)) item = { seq: row.seq, kind: 'revision', revision };
        else { ctx.db.transaction(() => setFileAccess(ctx, row.root_id, revision.path, false)); item = { seq: row.seq, kind: 'access', rootId: row.root_id, path: revision.path, allowed: false }; }
      } else if (row.kind === 'access') {
        const allowed = revisionVisible(ctx, { rootId: row.root_id, path: row.target, previousPath: null }, roots);
        item = { seq: row.seq, kind: 'access', rootId: row.root_id, path: row.target, allowed };
      } else throw new DomainError('FILE_JOURNAL_GAP');
    }
    const size = Buffer.byteLength(JSON.stringify(item)); if (bytes + size > 7 * 1024 * 1024) break;
    bytes += size; packet.items.push(item); packet.nextSeq = row.seq;
  }
  packet.hasMore = Boolean(ctx.db.get('SELECT seq FROM file_journal WHERE seq > ? LIMIT 1', packet.nextSeq));
  if (!packet.items.length && packet.hasMore) throw new DomainError('FILE_PACKET_TOO_LARGE');
  return packet;
}

export function importFilePacket(ctx: AppContext, description: AgentEnvelope, value: unknown): Packet {
  assertRecord(value); exactKeys(value, ['installationId', 'after', 'nextSeq', 'hasMore', 'items', 'scans']);
  if (value.installationId !== description.identity.installationId || !Number.isSafeInteger(value.after) || Number(value.after) < 0 || !Number.isSafeInteger(value.nextSeq) || Number(value.nextSeq) < Number(value.after) || typeof value.hasMore !== 'boolean' || !Array.isArray(value.items) || value.items.length > 100 || !Array.isArray(value.scans) || value.scans.length > 1000 || Buffer.byteLength(JSON.stringify(value)) > 8 * 1024 * 1024) throw new DomainError('FILE_PACKET_INVALID');
  const roots = new Map(description.roots.filter((r) => r.enabled).map((r) => [r.id!, ctx.db.get<{ id: string }>('SELECT id FROM project_roots WHERE device_id = ? AND path = ? AND enabled = 1', description.identity.deviceId, r.path)?.id]));
  for (let index = 0; index < value.items.length; index++) {
    const item = value.items[index]; assertRecord(item);
    if (item.seq !== Number(value.after) + index + 1) throw new DomainError('FILE_CURSOR_GAP');
    if (item.kind === 'skip') exactKeys(item, ['kind', 'seq']);
    else if (item.kind === 'access') {
      exactKeys(item, ['kind', 'seq', 'rootId', 'path', 'allowed']);
      if (!roots.get(String(item.rootId)) || typeof item.path !== 'string' || !gitPathAllowed(item.path) || /[\x00-\x1f]/.test(item.path) || typeof item.allowed !== 'boolean') throw new DomainError('FILE_PACKET_INVALID');
    } else if (item.kind === 'revision') {
      exactKeys(item, ['kind', 'seq', 'revision']); assertRecord(item.revision);
      exactKeys(item.revision, ['id', 'rootId', 'fileId', 'path', 'sha256', 'occurredAt', 'operation', 'observation', 'previousPath', 'previousRevisionId', 'size', 'unavailableReason'], ['content']);
      if (!roots.get(String(item.revision.rootId))) throw new DomainError('FILE_PACKET_INVALID');
      validateRevision(item.revision as unknown as FileRevision);
    } else throw new DomainError('FILE_PACKET_INVALID');
  }
  for (const scan of value.scans) {
    assertRecord(scan); exactKeys(scan, ['rootId', 'scannedAt', 'monitoringSince', 'error', 'lastGapAt', 'pending']);
    if (!roots.get(String(scan.rootId)) || typeof scan.pending !== 'boolean' || (scan.error !== null && (typeof scan.error !== 'string' || !/^[A-Z_]{1,100}$/.test(scan.error)))) throw new DomainError('FILE_PACKET_INVALID');
    for (const key of ['scannedAt', 'monitoringSince', 'lastGapAt']) if (scan[key] !== null) utc(scan[key]);
  }
  if (Number(value.nextSeq) !== Number(value.after) + value.items.length || (!value.items.length && value.hasMore)) throw new DomainError('FILE_CURSOR_GAP');
  const previous = ctx.db.get<{ seq: number }>('SELECT seq FROM file_remote_sync WHERE installation_id = ?', value.installationId)?.seq ?? 0;
  if (Number(value.after) > previous) throw new DomainError('FILE_CURSOR_GAP');
  const packet = value as unknown as Packet;
  ctx.db.transaction(() => {
    for (const item of packet.items) {
      if (item.seq <= previous) continue;
      if (item.kind === 'access') setFileAccess(ctx, roots.get(item.rootId)!, item.path, item.allowed, false);
      else if (item.kind === 'revision') {
        const revision = { ...item.revision, rootId: roots.get(item.revision.rootId)! };
        const parent = revision.previousRevisionId ? storedRevision(ctx, revision.previousRevisionId) : null;
        if (parent && (parent.rootId !== revision.rootId || parent.fileId !== revision.fileId)) throw new DomainError('REVISION_PARENT_MISMATCH');
        insertRevision(ctx, revision, false);
      }
    }
    for (const scan of packet.scans) ctx.db.run('INSERT INTO file_scans(root_id, scanned_at, monitoring_since, error, last_gap_at, pending, baselined) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(root_id) DO UPDATE SET scanned_at = excluded.scanned_at, monitoring_since = excluded.monitoring_since, error = excluded.error, last_gap_at = excluded.last_gap_at, pending = excluded.pending', roots.get(scan.rootId)!, scan.scannedAt, scan.monitoringSince, scan.error, scan.lastGapAt, Number(scan.pending || packet.hasMore));
    ctx.db.run('INSERT INTO file_remote_sync VALUES (?, ?, NULL) ON CONFLICT(installation_id) DO UPDATE SET seq = max(file_remote_sync.seq, excluded.seq), error = NULL', packet.installationId, packet.nextSeq);
  });
  for (const item of packet.items) if (item.kind === 'revision') inferEvidence(ctx, item.revision.id);
  return packet;
}

export async function syncRemoteFiles(ctx: AppContext, description: AgentEnvelope, run: (command: string, args?: string[]) => Promise<string>) {
  if (!description.capabilities?.includes('files-v1')) return;
  let after = ctx.db.get<{ seq: number }>('SELECT seq FROM file_remote_sync WHERE installation_id = ?', description.identity.installationId)?.seq ?? 0;
  const deadline = Date.now() + 10_000;
  try {
    for (let page = 0; page < 10 && Date.now() < deadline; page++) {
      const raw: unknown = JSON.parse(await run('files', ['--after', String(after), '--expected-installation', description.identity.installationId]));
      assertRecord(raw); if (raw.after !== after) throw new DomainError('FILE_CURSOR_GAP');
      const packet = importFilePacket(ctx, description, raw); after = packet.nextSeq; if (!packet.hasMore) break;
    }
  } catch {
    ctx.db.run('INSERT INTO file_remote_sync VALUES (?, ?, ?) ON CONFLICT(installation_id) DO UPDATE SET error = excluded.error', description.identity.installationId, after, 'FILES_REMOTE_SYNC_FAILED');
  }
}
