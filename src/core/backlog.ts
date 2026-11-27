import { closeSync, existsSync, lstatSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { AppContext } from './contracts.js';
import { gitRead, listProjects } from './projects.js';
import { policyFor } from './policy.js';

/**
 * Tasks planejadas (`.tasks/*.md`, formato do tlc-plan) cruzadas com os checklists do tlc-implement
 * (`.checks/<feature>.md` e `.checks/<feature>.verified.md`). Leitura sob demanda das raízes locais
 * autorizadas, sem gravar nada no banco: o arquivo é a fonte da verdade e o status é derivado dele.
 */
export type BacklogStatus = 'implemented' | 'failed' | 'in_progress' | 'pending';
export interface BacklogQuestion { n: string; question: string }
export interface BacklogCheck {
  feature: string;
  /** Nome do worktree onde o checklist está; nulo quando está na própria raiz cadastrada. */
  location: string | null;
  verdict: 'PASS' | 'FAIL' | null;
  verifiedAt: string | null;
}
export interface BacklogItem {
  id: string; file: string; title: string; criteria: number | null; status: BacklogStatus; updatedAt: string;
  check: BacklogCheck | null;
  /** `Unresolved` com Kind `open`: decisão assumida, ainda aberta. */
  open: BacklogQuestion[];
  /** Kind `blocks`: impede satisfazer algum critério. */
  blocking: BacklogQuestion[];
  /** Kind `blocks go-live`: a entrega fica pronta, mas não entra no ar. */
  goLive: BacklogQuestion[];
}
export interface BacklogCounts { total: number; implemented: number; failed: number; inProgress: number; pending: number; withOpen: number; withBlocking: number; withGoLive: number }
export interface BacklogRoot { path: string; state: 'ok' | 'no-tasks' | 'remote' | 'paused' | 'unavailable' | 'excluded' }
export interface ProjectBacklog { projectId: string; counts: BacklogCounts; items: BacklogItem[]; roots: BacklogRoot[]; truncated: boolean }
export interface BacklogState { generatedAt: string; projects: ProjectBacklog[] }

const MAX_TASKS = 400; const MAX_CHECKS = 2000;
const TASK_BYTES = 512 * 1024; const CHECK_HEAD_BYTES = 24 * 1024; const VERIFIED_BYTES = 1024 * 1024;
const CACHE_MS = 20_000; const WORKTREE_CACHE_MS = 5 * 60_000;
const QUESTION_CHARS = 280;

function readHead(path: string, bytes: number): string {
  const fd = openSync(path, 'r');
  try { const buffer = Buffer.alloc(bytes); const read = readSync(fd, buffer, 0, bytes, 0); return buffer.subarray(0, read).toString('utf8'); }
  finally { closeSync(fd); }
}
/** Arquivos `.md` regulares do diretório (sem seguir links simbólicos nem descer em subpastas de anexos). */
function markdownFiles(directory: string, limit: number): { names: string[]; truncated: boolean } {
  let entries: import('node:fs').Dirent[];
  try { if (lstatSync(directory).isSymbolicLink()) return { names: [], truncated: false }; entries = readdirSync(directory, { withFileTypes: true }); }
  catch { return { names: [], truncated: false }; }
  const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  return { names: names.slice(0, limit), truncated: names.length > limit };
}
function section(text: string, heading: RegExp): string | null {
  const lines = text.split('\n'); const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^#{1,2} /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}
const clip = (value: string) => { const text = value.replace(/\s+/g, ' ').trim(); return text.length > QUESTION_CHARS ? `${text.slice(0, QUESTION_CHARS - 1)}…` : text; };

/** Lê o cabeçalho, o total de critérios e a tabela `Unresolved` de uma task do tlc-plan. */
export function parseTask(text: string): { title: string | null; criteria: number | null; open: BacklogQuestion[]; blocking: BacklogQuestion[]; goLive: BacklogQuestion[] } {
  const title = text.match(/^# (.+)$/m)?.[1]?.trim() ?? null;
  const summary = text.match(/^(\d+) (?:criteria|criterion|critérios|critério)\b/m);
  let criteria = summary ? Number(summary[1]) : null;
  if (criteria === null) { const body = section(text, /^## (?:Criteria|Critérios)\s*$/); if (body) criteria = (body.match(/^\d+\. /gm) ?? []).length || null; }
  const open: BacklogQuestion[] = []; const blocking: BacklogQuestion[] = []; const goLive: BacklogQuestion[] = [];
  const unresolved = section(text, /^## (?:Unresolved|Em aberto)\s*$/);
  if (unresolved) {
    const rows = unresolved.split('\n').filter((line) => line.trim().startsWith('|')).map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
    const header = rows.findIndex((cells) => cells.some((cell) => /^(kind|tipo)$/i.test(cell)));
    if (header >= 0) {
      const columns = rows[header]!; const kindAt = columns.findIndex((cell) => /^(kind|tipo)$/i.test(cell));
      const questionAt = columns.findIndex((cell) => /^(question|pergunta|questão)$/i.test(cell)); const numberAt = columns.findIndex((cell) => cell === '#');
      for (const cells of rows.slice(header + 1)) {
        if (cells.every((cell) => /^:?-{3,}:?$/.test(cell) || !cell)) continue;
        const kind = (cells[kindAt] ?? '').toLowerCase().replace(/`/g, '').trim();
        const entry = { n: numberAt >= 0 ? cells[numberAt] ?? '' : '', question: clip(cells[questionAt >= 0 ? questionAt : kindAt + 1] ?? '') };
        if (kind === 'blocks go-live' || kind === 'bloqueia entrada no ar') goLive.push(entry);
        else if (kind === 'blocks' || kind === 'bloqueia') blocking.push(entry);
        else if (kind === 'open' || kind === 'aberta' || kind === 'aberto') open.push(entry);
      }
    }
  }
  return { title, criteria, open, blocking, goLive };
}
/** Tasks citadas na seção `Sources` de um checklist (`.tasks/<arquivo>.md`). */
export function checkSources(text: string): string[] {
  const head = text.split(/^## /m)[0] ?? text;
  return [...new Set([...head.matchAll(/\.tasks\/([^\s`'")\]|,;]+?\.md)\b/g)].map((match) => basename(match[1]!)))];
}
/**
 * Veredito do Verifier: `**Verdict**: PASS`, `**Veredito: FAIL.**` e variações. Um arquivo pode acumular rodadas:
 * vale o último rótulo "atual/vigente/final"; sem ele, o último veredito principal (rodadas antigas e vereditos
 * parciais, como `Veredito do C31`, não decidem).
 */
export function parseVerdict(text: string): 'PASS' | 'FAIL' | null {
  const found: { label: string; value: 'PASS' | 'FAIL' }[] = [];
  for (const line of text.split('\n')) {
    const label = line.match(/\*\*\s*(?:verdict|veredito)\b([^*:]*)/i); if (!label) continue;
    const value = line.match(/\b(PASS|FAIL)\b/); if (value) found.push({ label: label[1]!.toLowerCase(), value: value[1] as 'PASS' | 'FAIL' });
  }
  const current = found.filter((item) => /\b(atual|vigente|final)\b/.test(item.label));
  const main = found.filter((item) => !/\b(round|rodada)\b|\bdos? (c\d|crit)/.test(item.label));
  return (current.at(-1) ?? main.at(-1) ?? found.at(-1))?.value ?? null;
}
/** Nome da feature sem o prefixo numérico da task (`48-pulseira-...` → `pulseira-...`). */
export const featureKey = (name: string) => name.replace(/\.md$/, '').replace(/^\d+[a-z]?-/, '');

/** Conteúdo já interpretado por caminho, revalidado por mtime e tamanho: o painel consulta em intervalo e só relê o que mudou. */
const parsed = new Map<string, { mtimeMs: number; size: number; value: unknown }>();
function readParsed<T>(path: string, bytes: number, parse: (text: string) => T): { value: T; mtime: Date; size: number } {
  const stat = statSync(path); const hit = parsed.get(path);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return { value: hit.value as T, mtime: stat.mtime, size: stat.size };
  const value = stat.size > bytes && bytes === TASK_BYTES ? null as T : parse(readHead(path, bytes));
  if (parsed.size >= 20_000) parsed.delete(parsed.keys().next().value!);
  parsed.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, value }); return { value, mtime: stat.mtime, size: stat.size };
}

interface FoundCheck { feature: string; location: string | null; verdict: 'PASS' | 'FAIL' | null; verifiedAt: string | null; sources: string[] }
function scanChecks(directory: string, location: string | null): FoundCheck[] {
  const checks = join(directory, '.checks'); const { names } = markdownFiles(checks, MAX_CHECKS); const present = new Set(names);
  const features = new Set(names.filter((name) => !/\.(verified|builder|browser|handoff)(\.[a-z]+)?\.md$/.test(name)).map((name) => name.replace(/\.md$/, '')));
  for (const name of names) { const match = name.match(/^(.+)\.verified\.md$/); if (match) features.add(match[1]!); }
  return [...features].map((feature) => {
    let sources: string[] = []; let verdict: FoundCheck['verdict'] = null; let verifiedAt: string | null = null;
    try { if (present.has(`${feature}.md`)) sources = readParsed(join(checks, `${feature}.md`), CHECK_HEAD_BYTES, checkSources).value; } catch { /* Checklist ilegível: fica sem fonte. */ }
    try {
      if (present.has(`${feature}.verified.md`)) {
        const read = readParsed(join(checks, `${feature}.verified.md`), VERIFIED_BYTES, parseVerdict);
        verdict = read.value; verifiedAt = read.mtime.toISOString();
      }
    } catch { /* Verificação ilegível: tratada como sem veredito. */ }
    return { feature, location, verdict, verifiedAt, sources };
  });
}

const worktreeCache = new Map<string, { at: number; paths: string[] }>();
function worktrees(root: string, now: number): string[] {
  const hit = worktreeCache.get(root);
  if (hit && now - hit.at < WORKTREE_CACHE_MS) return hit.paths;
  let paths: string[] = [];
  try { paths = gitRead(root, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9)).filter((path) => existsSync(path)); }
  catch { /* Sem Git: só a própria raiz. */ }
  worktreeCache.set(root, { at: now, paths }); return paths;
}

const rank: Record<BacklogStatus, number> = { failed: 0, in_progress: 1, pending: 2, implemented: 3 };
function emptyCounts(): BacklogCounts { return { total: 0, implemented: 0, failed: 0, inProgress: 0, pending: 0, withOpen: 0, withBlocking: 0, withGoLive: 0 }; }

export function projectBacklogFromRoots(roots: { id: string; path: string; worktree?: string; enabled: boolean; local: boolean }[], excludedPaths: string[], projectId: string, now = Date.now()): ProjectBacklog {
  const excluded = (name: string) => excludedPaths.some((path) => path === name || name.startsWith(`${path}/`));
  const result: BacklogRoot[] = []; const tasks = new Map<string, BacklogItem & { root: string }>(); const checkDirs = new Map<string, string | null>();
  let truncated = false;
  for (const root of roots) {
    if (!root.local) { result.push({ path: root.path, state: 'remote' }); continue; }
    if (!root.enabled) { result.push({ path: root.path, state: 'paused' }); continue; }
    if (excluded('.tasks')) { result.push({ path: root.path, state: 'excluded' }); continue; }
    const base = root.worktree ?? root.path;
    if (!existsSync(base)) { result.push({ path: root.path, state: 'unavailable' }); continue; }
    const directory = join(base, '.tasks'); const files = markdownFiles(directory, MAX_TASKS); truncated ||= files.truncated;
    result.push({ path: root.path, state: files.names.length ? 'ok' : 'no-tasks' });
    if (!excluded('.checks')) {
      checkDirs.set(realpathSync(base), null);
      for (const path of files.names.length ? worktrees(base, now) : []) { const real = realpathSync(path); if (!checkDirs.has(real)) checkDirs.set(real, basename(path)); }
    }
    for (const name of files.names) {
      if (excluded(`.tasks/${name}`)) continue;
      try {
        const path = join(directory, name); const read = readParsed(path, TASK_BYTES, parseTask); const task = read.value;
        if (!task) continue;
        const previous = tasks.get(name);
        if (previous && previous.updatedAt >= read.mtime.toISOString()) continue;
        tasks.set(name, { id: `${root.id}:${name}`, root: base, file: relative(base, path), title: task.title ?? name.replace(/\.md$/, ''), criteria: task.criteria, status: 'pending', updatedAt: read.mtime.toISOString(), check: null, open: task.open, blocking: task.blocking, goLive: task.goLive });
      } catch { /* Arquivo removido durante a leitura. */ }
    }
  }
  const checks = [...checkDirs].flatMap(([directory, location]) => scanChecks(directory, location));
  const add = (map: Map<string, FoundCheck[]>, key: string, check: FoundCheck) => map.set(key, [...(map.get(key) ?? []), check]);
  // Vínculo task → checklist, do mais forte ao mais fraco: mesmo nome de feature; a task é a primeira fonte do
  // checklist; a task aparece entre as fontes (ex.: duas tasks entregues num checklist só).
  const byFeature = new Map<string, FoundCheck[]>(); const byPrimary = new Map<string, FoundCheck[]>(); const bySource = new Map<string, FoundCheck[]>();
  for (const check of checks) {
    add(byFeature, check.feature, check);
    if (check.sources[0]) add(byPrimary, check.sources[0], check);
    for (const source of check.sources) add(bySource, source, check);
  }
  const counts = emptyCounts();
  const items = [...tasks.values()].map(({ root: _, ...item }) => {
    const name = item.file.split('/').at(-1)!;
    const found = byFeature.get(name.replace(/\.md$/, '')) ?? byFeature.get(featureKey(name)) ?? byPrimary.get(name) ?? bySource.get(name) ?? [];
    // Raiz e worktrees costumam ter cópias do mesmo checklist (`.checks` versionado). Vale o da raiz quando ele já
    // tem veredito; senão, a verificação mais recente de um worktree (trabalho ainda não integrado); senão, o da raiz.
    const verified = found.filter((check) => check.verdict).sort((a, b) => (b.verifiedAt ?? '').localeCompare(a.verifiedAt ?? ''));
    const chosen = verified.find((check) => check.location === null) ?? verified[0] ?? found.find((check) => check.location === null) ?? found[0];
    const status: BacklogStatus = !chosen ? 'pending' : chosen.verdict === 'PASS' ? 'implemented' : chosen.verdict === 'FAIL' ? 'failed' : 'in_progress';
    const value: BacklogItem = { ...item, status, check: chosen ? { feature: chosen.feature, location: chosen.location, verdict: chosen.verdict, verifiedAt: chosen.verifiedAt } : null };
    counts.total++; counts[status === 'in_progress' ? 'inProgress' : status]++;
    if (value.open.length) counts.withOpen++; if (value.blocking.length) counts.withBlocking++; if (value.goLive.length) counts.withGoLive++;
    return value;
  }).sort((a, b) => rank[a.status] - rank[b.status] || b.blocking.length - a.blocking.length || b.goLive.length - a.goLive.length || b.updatedAt.localeCompare(a.updatedAt));
  return { projectId, counts, items, roots: result, truncated };
}

let cache: { at: number; key: string; value: BacklogState } | null = null;
/** Backlog de cada projeto com pelo menos uma task; cache curto para o painel ao vivo, que consulta em intervalo. */
export function backlogState(ctx: AppContext, projectIds: string[] = [], now = Date.now()): BacklogState {
  const projects = listProjects(ctx).filter((project) => !projectIds.length || projectIds.includes(project.id));
  const excludedPaths = policyFor(ctx).excludedPaths;
  const key = JSON.stringify([projects.map((project) => [project.id, project.roots.map((root) => [root.path, root.enabled])]), excludedPaths]);
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
  const value: BacklogState = { generatedAt: new Date(now).toISOString(), projects: projects.map((project) => projectBacklogFromRoots(project.roots.map((root) => ({ id: root.id ?? project.id, path: root.path, worktree: root.worktree, enabled: root.enabled !== false, local: root.deviceId === ctx.config.deviceId })), excludedPaths, project.id, now)).filter((backlog) => backlog.counts.total > 0) };
  cache = { at: now, key, value };
  return value;
}
export function clearBacklogCache() { cache = null; worktreeCache.clear(); }
