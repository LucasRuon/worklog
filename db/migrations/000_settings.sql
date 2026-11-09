CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

INSERT INTO settings (key, value) VALUES ('timezone', 'America/Sao_Paulo');
