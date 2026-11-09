import { chmod, mkdir, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase, openDatabase } from './sqlite.js';
import { initializeIdentity } from './events.js';
import { homedir, platform } from 'node:os';
import { DomainError, type AppContext } from './contracts.js';

export function defaultDataDir() {
  return platform() === 'darwin' ? join(homedir(), 'Library/Application Support/Worklog') : join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'worklog');
}

export function inside(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export async function openStore(dataDirectory: string): Promise<AppContext> {
  if (!isAbsolute(dataDirectory)) throw new Error('O diretório de dados deve ser absoluto.');
  try { await lstat(join(dataDirectory, 'restore-in-progress')); throw new DomainError('RESTORE_INCOMPLETE', 503); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  if (inside(root, resolve(dataDirectory))) throw new Error('Os dados devem ficar fora do repositório.');
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const dataDir = await realpath(dataDirectory);
  if (inside(root, dataDir)) throw new Error('Os dados devem ficar fora do repositório.');
  await chmod(dataDir, 0o700);
  const db = openDatabase(join(dataDir, 'worklog.sqlite'));
  try {
    migrateDatabase(db);
    const ctx: AppContext = { db, config: { dataDir, port: 0, origin: '', timezone: db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'timezone'")!.value, deviceId: '', installationId: '' }, shutdown: async () => { db.close(); } };
    initializeIdentity(ctx);
    return ctx;
  } catch (error) { db.close(); throw error; }
}
