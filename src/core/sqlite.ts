import { backup, DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';

export function openReadonlyDatabase(path: string) {
  if (!isAbsolute(path) || !lstatSync(path).isFile()) throw new Error('Fonte SQLite exige arquivo regular absoluto.');
  const connection = new DatabaseSync(path, { readOnly: true });
  try { connection.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 200; PRAGMA trusted_schema = OFF;'); }
  catch (error) { connection.close(); throw error; }
  let closed = false;
  return {
    get<T>(sql: string, ...params: SQLInputValue[]) { return connection.prepare(sql).get(...params) as T | undefined; },
    all<T>(sql: string, ...params: SQLInputValue[]) { return connection.prepare(sql).all(...params) as T[]; },
    close() { if (!closed) { connection.close(); closed = true; } },
  };
}
export type ReadonlyDatabase = ReturnType<typeof openReadonlyDatabase>;

export function openDatabase(path: string) {
  if (path !== ':memory:') {
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        if (!lstatSync(file).isFile()) throw new Error('SQLite exige arquivos regulares.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  const connection = new DatabaseSync(path);
  try {
    if (path !== ':memory:') chmodSync(path, 0o600);
    connection.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  } catch (error) { connection.close(); throw error; }
  let closed = false;
  const db = {
    async backup(destination: string) { await backup(connection, destination); },
    exec(sql: string) { connection.exec(sql); },
    run(sql: string, ...params: SQLInputValue[]) { return connection.prepare(sql).run(...params); },
    get<T>(sql: string, ...params: SQLInputValue[]) { return connection.prepare(sql).get(...params) as T | undefined; },
    all<T>(sql: string, ...params: SQLInputValue[]) { return connection.prepare(sql).all(...params) as T[]; },
    transaction<T>(operation: () => T): T {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const result = operation();
        if (result instanceof Promise) throw new Error('Transações SQLite devem ser síncronas.');
        connection.exec('COMMIT');
        return result;
      } catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
    close() {
      if (!closed) { connection.close(); closed = true; }
    },
  };
  return db;
}

export type WorklogDatabase = ReturnType<typeof openDatabase>;

export function migrateDatabase(db: WorklogDatabase, directory = fileURLToPath(new URL('../../db/migrations/', import.meta.url))) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
  const files = readdirSync(directory).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
  db.transaction(() => {
    const applied = db.all<{ name: string; sha256: string }>('SELECT name, sha256 FROM schema_migrations');
    if (applied.some((migration) => !files.includes(migration.name))) throw new Error('Migração aplicada ausente.');
    for (const name of files) {
      const sql = readFileSync(join(directory, name), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const previous = applied.find((migration) => migration.name === name);
      if (previous) {
        if (previous.sha256 !== hash) throw new Error('Migração aplicada foi modificada.');
        continue;
      }
      db.exec(sql);
      db.run('INSERT INTO schema_migrations VALUES (?, ?, ?)', name, hash, new Date().toISOString());
    }
  });
}
