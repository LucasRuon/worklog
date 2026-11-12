import { closeSync, fstatSync, openSync, readdirSync, readSync, statSync, constants } from 'node:fs';
import { join } from 'node:path';
import { DomainError, type AppContext, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { normalizeEvent } from '../core/policy.js';
import { isClaudeSupported } from './claude.js';
import { historyAuthorizer } from './history-auth.js';

/**
 * Recupera atividade do Claude Code a partir das transcrições locais (`<config>/projects/<pasta>/<sessão>.jsonl`
 * e `<sessão>/subagents/agent-<id>.jsonl`), para períodos sem hooks instalados. Gera os mesmos tipos e a mesma
 * identidade de sessão/subagente que os hooks ao vivo:
 * - prompt → `turn.submit` (só quando a origem é humana) + `turn.start`; fim do turno = último registro do
 *   assistente ou resultado de ferramenta antes do próximo prompt (`turn.end`, interrompido se houve interrupção);
 * - `tool_use` → `tool.start`, `tool_result` correspondente → `tool.end` (falha quando `is_error`);
 * - subagente → `session.start`/`turn.start` no primeiro registro e `turn.end`/`session.end` no último.
 * Conteúdo de prompts, respostas e ferramentas nunca é persistido: só o prefixo estrutural é inspecionado em
 * memória para separar prompts de saídas de comandos locais.
 */
type Item = { value: EventInput } | { warning: string };
interface Line { type?: unknown; timestamp?: unknown; cwd?: unknown; uuid?: unknown; promptId?: unknown; isMeta?: unknown; isSidechain?: unknown; origin?: unknown; message?: unknown }
interface Block { type?: unknown; id?: unknown; name?: unknown; tool_use_id?: unknown; is_error?: unknown; text?: unknown }

const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024 * 1024;
/** Arquivo alterado há menos disso pode ter o último turno ainda em andamento: ele fica para os hooks ao vivo. */
const ACTIVE_MS = 10 * 60_000;
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = (value: unknown) => { const at = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(at) && at > 0 && at <= Date.now() + 60_000 ? at : null; };
const blocks = (line: Line): Block[] => { const content = isObject(line.message) ? line.message.content : undefined; return Array.isArray(content) ? content.filter(isObject) as Block[] : []; };
/** Prefixo do texto do usuário, só para classificar; nunca sai desta função. */
function prefix(line: Line): string {
  const content = isObject(line.message) ? line.message.content : undefined;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.find((block): block is Block => isObject(block) && block.type === 'text')?.text : undefined;
  return typeof text === 'string' ? text.slice(0, 32) : '';
}

/** Linhas JSON de um arquivo, lidas em blocos; linhas inválidas ou grandes demais viram `null`. */
function* lines(path: string): Generator<Line | null> {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) { yield null; return; }
    const chunk = Buffer.alloc(1024 * 1024); let pending: Buffer[] = []; let pendingBytes = 0; let position = 0;
    const parse = (bytes: Buffer): Line | null => { try { const value: unknown = JSON.parse(bytes.toString('utf8')); return isObject(value) ? value as Line : null; } catch { return null; } };
    while (position < info.size) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, info.size - position), position); if (!count) break; position += count;
      let start = 0;
      for (let index = chunk.indexOf(10, 0); index !== -1 && index < count; index = chunk.indexOf(10, index + 1)) {
        const part = chunk.subarray(start, index);
        if (pendingBytes + part.length <= MAX_LINE_BYTES) { const bytes = pending.length ? Buffer.concat([...pending, part]) : part; if (bytes.length) yield parse(bytes); }
        else yield null;
        pending = []; pendingBytes = 0; start = index + 1;
      }
      if (start < count) { if (pendingBytes <= MAX_LINE_BYTES) pending.push(Buffer.from(chunk.subarray(start, count))); pendingBytes += count - start; }
    }
    if (pendingBytes && pendingBytes <= MAX_LINE_BYTES) yield parse(Buffer.concat(pending));
  } finally { closeSync(fd); }
}

function list(path: string): string[] { try { return readdirSync(path); } catch { return []; } }
function modified(path: string): number { try { return statSync(path).mtimeMs; } catch { return 0; } }

export function* claudeTranscriptRecords(ctx: AppContext, source: SourceRegistration, directory: string, since?: string): Generator<Item> {
  if (source.tool !== 'claude' || !isClaudeSupported(source.version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const projects = list(directory);
  if (!projects.length) throw new DomainError('HISTORY_UNAVAILABLE');
  const cutoff = since ? Date.parse(since) : 0;
  const files: { path: string; agentId?: string; sessionId: string }[] = [];
  for (const project of projects) {
    const folder = join(directory, project);
    for (const name of list(folder)) {
      const sessionId = name.replace(/\.jsonl$/, '');
      if (name.endsWith('.jsonl') && ID.test(sessionId)) files.push({ path: join(folder, name), sessionId });
      else if (ID.test(name)) for (const agent of list(join(folder, name, 'subagents'))) {
        const agentId = /^agent-([A-Za-z0-9_-]{1,120})\.jsonl$/.exec(agent)?.[1];
        if (agentId) files.push({ path: join(folder, name, 'subagents', agent), sessionId: name, agentId });
      }
    }
  }
  if (files.length > MAX_FILES) throw new DomainError('HISTORY_NATIVE_SCAN_LIMIT');
  const authorize = historyAuthorizer(ctx, source);
  let skipped = false;
  for (const file of files) {
    const changed = modified(file.path);
    // Um arquivo não contém registros posteriores à última alteração.
    if (changed < cutoff) continue;
    const active = Date.now() - changed < ACTIVE_MS;
    const sid = file.sessionId;
    const identity = file.agentId ? { nativeSessionId: sid, nativeAgentId: file.agentId, parentSessionId: sid } : { nativeSessionId: sid };
    const out: Item[] = [];
    const emit = (cwd: string | null, originId: string, at: number, type: string, payload: Record<string, string>) => {
      const canonical = cwd ? authorize(cwd, sid) : null; if (!canonical) return;
      const values = normalizeEvent(source, { originId, occurredAt: new Date(at).toISOString(), ...identity, cwd: canonical, type, payload });
      if (values.length === 1) out.push({ value: values[0]! }); else skipped = true;
    };
    const prefixId = file.agentId ? `${sid}:${file.agentId}` : sid;
    if (file.agentId) {
      // Subagente: uma execução, do primeiro ao último registro do assistente/ferramenta.
      let first: { at: number; cwd: string } | null = null; let last = 0; const tools = new Map<string, { name: string; at: number }>(); let cwd: string | null = null;
      const closed: { id: string; name: string; start: number; end: number; failed: boolean }[] = [];
      for (const line of lines(file.path)) {
        if (!line) { skipped = true; continue; }
        const at = time(line.timestamp); if (at === null) continue;
        if (typeof line.cwd === 'string') { cwd ??= line.cwd; first ??= { at, cwd: line.cwd }; }
        if (line.type === 'assistant') { last = Math.max(last, at); for (const block of blocks(line)) if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') tools.set(block.id, { name: block.name, at }); }
        else if (line.type === 'user') for (const block of blocks(line)) if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const open = tools.get(block.tool_use_id); if (!open) continue;
          tools.delete(block.tool_use_id); last = Math.max(last, at); closed.push({ id: block.tool_use_id, name: open.name, start: open.at, end: at, failed: block.is_error === true });
        }
      }
      if (!first || !last || last < first.at || active) continue;
      emit(cwd, `${prefixId}:transcript-start`, first.at, 'session.start', { reason: 'subagent' });
      emit(cwd, `${prefixId}:transcript-turn-start`, first.at, 'turn.start', {});
      for (const tool of closed) toolEvents(emit, cwd, prefixId, tool);
      emit(cwd, `${prefixId}:transcript-turn-end`, last, 'turn.end', { outcome: 'completed' });
      emit(cwd, `${prefixId}:transcript-end`, last, 'session.end', { reason: 'subagent' });
      yield* out; continue;
    }
    interface Turn { id: string; promptId: string | null; start: number; last: number; cwd: string | null; human: boolean; interrupted: boolean; replies: number; tools: Map<string, { name: string; at: number }>; closed: { id: string; name: string; start: number; end: number; failed: boolean }[] }
    let turn: Turn | null = null; let started = false;
    const finish = (current: Turn | null) => {
      if (!current || !current.replies || current.last < current.start) return;
      if (current.human) emit(current.cwd, `${sid}:${current.id}:transcript-submit`, current.start, 'turn.submit', current.promptId ? { turnId: current.promptId } : {});
      const turnId: Record<string, string> = current.promptId ? { turnId: current.promptId } : {};
      emit(current.cwd, `${sid}:${current.id}:transcript-turn-start`, current.start, 'turn.start', turnId);
      for (const tool of current.closed) toolEvents(emit, current.cwd, sid, tool);
      emit(current.cwd, `${sid}:${current.id}:transcript-turn-end`, current.last, 'turn.end', { ...turnId, outcome: current.interrupted ? 'interrupted' : 'completed' });
    };
    for (const line of lines(file.path)) {
      if (!line) { skipped = true; continue; }
      if (line.isSidechain === true) continue;
      const at = time(line.timestamp); if (at === null) continue;
      const cwd = typeof line.cwd === 'string' ? line.cwd : null;
      if (!started && cwd) { started = true; emit(cwd, `${sid}:transcript-start`, at, 'session.start', { reason: 'startup' }); }
      if (line.type === 'assistant') {
        if (!turn) continue;
        turn.replies++; turn.last = Math.max(turn.last, at);
        for (const block of blocks(line)) if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') turn.tools.set(block.id, { name: block.name, at });
        continue;
      }
      if (line.type !== 'user') continue;
      const results = blocks(line).filter((block) => block.type === 'tool_result' && typeof block.tool_use_id === 'string');
      if (results.length) {
        if (!turn) continue;
        for (const block of results) {
          const open = turn.tools.get(block.tool_use_id as string); if (!open) continue;
          turn.tools.delete(block.tool_use_id as string); turn.last = Math.max(turn.last, at);
          turn.closed.push({ id: block.tool_use_id as string, name: open.name, start: open.at, end: at, failed: block.is_error === true });
        }
        continue;
      }
      const text = prefix(line);
      if (text.startsWith('[Request interrupted')) { if (turn) turn.interrupted = true; continue; }
      if (text.startsWith('<local-command') || text.startsWith('Caveat:')) continue;
      const promptId = typeof line.promptId === 'string' ? line.promptId : null;
      // Registros do mesmo prompt (lembretes, anexos) não abrem outro turno.
      if (turn && promptId && promptId === turn.promptId) continue;
      if (!promptId && line.isMeta === true) continue;
      finish(turn);
      const origin = isObject(line.origin) ? line.origin.kind : undefined;
      const human = origin === undefined ? line.isMeta !== true : origin === 'human';
      const id = typeof line.uuid === 'string' && ID.test(line.uuid) ? line.uuid : `${at}`;
      turn = { id, promptId, start: at, last: at, cwd: cwd ?? (turn as Turn | null)?.cwd ?? null, human, interrupted: false, replies: 0, tools: new Map(), closed: [] };
    }
    // Último turno de uma sessão ainda ativa pode não ter terminado.
    if (!active) finish(turn);
    yield* out;
  }
  if (skipped) yield { warning: 'HISTORY_RECORDS_SKIPPED' };
}

function toolEvents(emit: (cwd: string | null, originId: string, at: number, type: string, payload: Record<string, string>) => void, cwd: string | null, prefix: string, tool: { id: string; name: string; start: number; end: number; failed: boolean }) {
  if (tool.end < tool.start) return;
  const name = tool.name.length <= 120 ? tool.name : 'claude-tool';
  emit(cwd, `${prefix}:${tool.id}:transcript-tool-start`, tool.start, 'tool.start', { toolName: name, toolUseId: tool.id });
  emit(cwd, `${prefix}:${tool.id}:transcript-tool-end`, tool.end, 'tool.end', { toolName: name, toolUseId: tool.id, outcome: tool.failed ? 'failed' : 'completed' });
}
