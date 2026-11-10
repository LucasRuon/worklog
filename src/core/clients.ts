import { randomUUID } from 'node:crypto';
import { uuid, DomainError, type AppContext } from './contracts.js';

export interface Client { id: string; name: string; projectCount: number }

function clientName(value: unknown) {
  if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) throw new DomainError('INVALID_CLIENT');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 160) throw new DomainError('INVALID_CLIENT');
  return name;
}
const byName = (ctx: AppContext, name: string) => ctx.db.get<{ id: string }>('SELECT id FROM clients WHERE name = ? COLLATE NOCASE', name);

export function listClients(ctx: AppContext): Client[] {
  return ctx.db.all<{ id: string; name: string; n: number }>('SELECT c.id, c.name, count(pc.project_id) AS n FROM clients c LEFT JOIN project_clients pc ON pc.client_id = c.id GROUP BY c.id ORDER BY c.name COLLATE NOCASE')
    .map((row) => ({ id: row.id, name: row.name, projectCount: row.n }));
}

function insertClient(ctx: AppContext, name: string) {
  if (byName(ctx, name)) throw new DomainError('CLIENT_EXISTS', 409);
  const id = randomUUID(); ctx.db.run('INSERT INTO clients VALUES (?, ?, ?)', id, name, new Date().toISOString()); return id;
}
export function createClient(ctx: AppContext, value: unknown): string {
  const name = clientName(value);
  return ctx.db.transaction(() => insertClient(ctx, name));
}

/** Associa por nome (cria o cliente se não existir). Sem transação própria: chamar dentro da transação do cadastro de raízes. */
export function assignClientByNameInTransaction(ctx: AppContext, projectId: string, value: unknown) {
  const name = clientName(value);
  const clientId = byName(ctx, name)?.id ?? insertClient(ctx, name);
  ctx.db.run('INSERT INTO project_clients VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET client_id = excluded.client_id', projectId, clientId);
}

export function renameClient(ctx: AppContext, id: string, value: unknown) {
  uuid(id); const name = clientName(value);
  ctx.db.transaction(() => {
    if (!ctx.db.get('SELECT id FROM clients WHERE id = ?', id)) throw new DomainError('CLIENT_NOT_FOUND', 404);
    const other = byName(ctx, name); if (other && other.id !== id) throw new DomainError('CLIENT_EXISTS', 409);
    ctx.db.run('UPDATE clients SET name = ? WHERE id = ?', name, id);
  });
}

/** Remove apenas clientes sem projetos, para nunca desassociar projetos sem intenção explícita. */
export function removeClient(ctx: AppContext, id: string) {
  uuid(id);
  ctx.db.transaction(() => {
    if (!ctx.db.get('SELECT id FROM clients WHERE id = ?', id)) throw new DomainError('CLIENT_NOT_FOUND', 404);
    if (ctx.db.get('SELECT project_id FROM project_clients WHERE client_id = ?', id)) throw new DomainError('CLIENT_IN_USE', 409);
    ctx.db.run('DELETE FROM clients WHERE id = ?', id);
  });
}

export function setProjectClient(ctx: AppContext, projectId: string, clientId: string | null) {
  uuid(projectId); if (clientId !== null) uuid(clientId);
  ctx.db.transaction(() => {
    if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new DomainError('UNKNOWN_PROJECT');
    if (clientId === null) { ctx.db.run('DELETE FROM project_clients WHERE project_id = ?', projectId); return; }
    if (!ctx.db.get('SELECT id FROM clients WHERE id = ?', clientId)) throw new DomainError('CLIENT_NOT_FOUND', 404);
    ctx.db.run('INSERT INTO project_clients VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET client_id = excluded.client_id', projectId, clientId);
  });
}
