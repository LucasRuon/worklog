import { execFile } from 'node:child_process';
import { access, readdir, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { openDatabase } from '../core/sqlite.js';

const execute = promisify(execFile);

async function executable(name: string) {
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = join(directory, name);
    try { await access(path, constants.X_OK); if ((await stat(path)).isFile()) return await realpath(path); }
    catch { /* Tentar o próximo diretório do PATH. */ }
  }
  return null;
}

async function pathStatus(path: string) {
  try { return { path, state: (await stat(path)).isDirectory() ? 'directory' : 'file' }; }
  catch (error) { return { path, state: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable' }; }
}

export async function doctor() {
  const home = homedir();
  const tools = await Promise.all(['claude', 'codex', 'opencode'].map(async (name) => {
    const path = await executable(name);
    if (!path) return { name, executable: null, version: null, state: 'not-on-path' };
    try {
      const { stdout } = await execute(path, ['--version'], { timeout: 10_000, maxBuffer: 4096 });
      return { name, executable: path, version: stdout.match(/\b\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?\b/)?.[0] ?? null, state: 'detected' };
    } catch { return { name, executable: path, version: null, state: 'version-unavailable' }; }
  }));
  const claudeProfiles = (await readdir(home)).filter((name) => /^\.claude(?:[-_].+)?$/.test(name)).map((name) => join(home, name));
  const configHome = process.env.XDG_CONFIG_HOME ?? join(home, '.config');
  const dataHome = process.env.XDG_DATA_HOME ?? join(home, '.local/share');
  const roots = [...new Set([
    join(home, '.claude'), ...claudeProfiles, process.env.CLAUDE_CONFIG_DIR,
    process.env.CODEX_HOME ?? join(home, '.codex'),
    join(configHome, 'opencode'), join(dataHome, 'opencode'), process.env.OPENCODE_CONFIG_DIR,
  ].filter((path): path is string => Boolean(path)))];
  const directories = await Promise.all(roots.map(pathStatus));
  const apps = [];
  for (const directory of ['/Applications', join(home, 'Applications')]) {
    try {
      for (const name of await readdir(directory)) {
        if (!/^(?:Claude|Codex|OpenCode).*\.app$/i.test(name)) continue;
        const plist = join(directory, name, 'Contents/Info.plist');
        let version: string | null = null;
        try {
          const { stdout } = await execute('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist], { timeout: 3000, maxBuffer: 1024 });
          version = stdout.trim().match(/^[a-zA-Z0-9.+-]+$/)?.[0] ?? null;
        } catch { /* A presença do app não comprova versão nem capacidade. */ }
        apps.push({ path: join(directory, name), version, state: 'present-not-tested' });
      }
    } catch { /* Diretório opcional de aplicativos. */ }
  }
  const db = openDatabase(':memory:');
  let sqlite: string;
  try { sqlite = db.get<{ version: string }>('SELECT sqlite_version() AS version')!.version; }
  finally { db.close(); }
  return {
    runtime: { node: process.version, supported: Number(process.versions.node.split('.')[0]) === 24 && Number(process.versions.node.split('.')[1]) >= 19, platform: platform(), architecture: arch(), sqlite },
    tools, apps, roots: directories,
    limitations: ['Detecção não comprova coleta ativa.', 'Contas, credenciais e conteúdos de sessões não são lidos.', 'Host remoto e projetos do piloto devem ser verificados separadamente.'],
  };
}
