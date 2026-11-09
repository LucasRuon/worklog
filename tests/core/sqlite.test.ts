import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../../src/core/sqlite.js';

test('migrações são atômicas, persistentes e detectam alterações em SQL aplicado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-migrations-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  try {
    await writeFile(join(directory, '001_first.sql'), 'CREATE TABLE example (id TEXT PRIMARY KEY) STRICT;');
    await writeFile(join(directory, '002_second.sql'), 'INSERT INTO missing_table VALUES (1);');
    assert.throws(() => migrateDatabase(db, directory));
    assert.equal(db.get('SELECT name FROM sqlite_master WHERE name = ?', 'example'), undefined);
    assert.equal(db.get<{ count: number }>('SELECT count(*) AS count FROM schema_migrations')!.count, 0);
    await rm(join(directory, '002_second.sql'));
    migrateDatabase(db, directory);
    assert.throws(() => db.transaction(() => { db.run('INSERT INTO example VALUES (?)', 'rollback'); throw new Error('Interrompido'); }));
    db.close();
    db = openDatabase(path);
    migrateDatabase(db, directory);
    assert.equal(db.get<{ count: number }>('SELECT count(*) AS count FROM schema_migrations')!.count, 1);
    assert.equal(db.get<{ count: number }>('SELECT count(*) AS count FROM example')!.count, 0);
    const sql = await readFile(join(directory, '001_first.sql'), 'utf8');
    await writeFile(join(directory, '001_first.sql'), `${sql}\n-- changed`);
    assert.throws(() => migrateDatabase(db, directory), /modificada/);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
