-- Clientes como cadastro próprio: um cliente pode ter vários projetos; cada projeto tem no máximo um cliente.
CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE UNIQUE INDEX clients_name ON clients(name COLLATE NOCASE);
CREATE TABLE project_clients (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  client_id TEXT NOT NULL REFERENCES clients(id)
) STRICT;
CREATE INDEX project_clients_client ON project_clients(client_id);
-- Migra o texto livre legado (projects.client) para clientes, sem diferenciar maiúsculas/minúsculas.
INSERT INTO clients (id, name, created_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       min(trim(client)), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM projects WHERE client IS NOT NULL AND trim(client) <> '' GROUP BY trim(client) COLLATE NOCASE;
INSERT INTO project_clients (project_id, client_id)
SELECT p.id, c.id FROM projects p JOIN clients c ON c.name = trim(p.client) COLLATE NOCASE WHERE p.client IS NOT NULL AND trim(p.client) <> '';
