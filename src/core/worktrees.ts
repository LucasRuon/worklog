import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Worktrees Git de um mesmo repositório compartilham o diretório comum do Git, mas ficam em pastas
 * irmãs ou fora da raiz cadastrada (ex.: `~/.local/share/opencode/worktree/...`). Associar projeto só
 * por prefixo de caminho descartava todo o trabalho feito neles. Módulo sem dependências do domínio:
 * o plugin do OpenCode também o carrega.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; dir: string | null }>();

/** Diretório comum do Git (igual em todos os worktrees do repositório) ou `null` fora de um repositório. */
export function gitCommonDir(path: string, now = Date.now()): string | null {
  const hit = cache.get(path);
  if (hit && now - hit.at < TTL_MS) return hit.dir;
  let dir: string | null = null;
  try {
    const out = execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', path, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 64 * 1024 }).trim();
    if (out) dir = realpathSync(resolve(path, out));
  } catch { /* Fora de repositório, pasta removida ou Git indisponível: sem vínculo. */ }
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(path, { at: now, dir });
  return dir;
}

/** Raiz autorizada cujo repositório contém `cwd` como worktree vinculado; o chamador já filtrou as raízes ativas. */
export function linkedRoot<T extends { path: string }>(roots: readonly T[], cwd: string): T | undefined {
  const common = gitCommonDir(cwd);
  if (!common) return undefined;
  return roots.find((root) => gitCommonDir(root.path) === common);
}
