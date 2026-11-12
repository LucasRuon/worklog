import { DomainError, type AppContext, type EventInput, type SourceRegistration } from '../core/contracts.js';
import { normalizeEvent } from '../core/policy.js';
import { openReadonlyDatabase } from '../core/sqlite.js';
import { historyAuthorizer } from './history-auth.js';
import { isOpenCodeV2, type PluginRecord } from './plugins/opencode-projector.js';

/**
 * Recupera atividade do OpenCode 2.x a partir do banco local (`session_v2` + `session_message`), para
 * períodos em que o plugin não capturou (ex.: auto-update para uma versão que ele recusava). O OpenCode 2.x
 * não persiste o log de eventos, então os eventos são reconstruídos dos horários das mensagens:
 * prompt → turn.submit, resposta do assistente → turn.start/turn.end, ferramenta → tool.start/tool.end.
 * São os mesmos tipos que o plugin ao vivo emitiria. Conteúdo (texto, entradas e saídas de ferramentas) nunca é lido.
 */
type Item = { value: EventInput } | { warning: string };
interface SessionRow { id: string; directory: string; parent_id: string | null; version: string; time_created: number }
interface MessageRow { id: string; type: string; seq: number; time_created: number; data: string }

const PAGE = 200;
const SCAN_LIMIT = 10_000;
const tables: Record<string, string[]> = {
  session_v2: ['id', 'directory', 'parent_id', 'version', 'time_created'],
  session_message: ['id', 'session_id', 'type', 'seq', 'time_created', 'data'],
};
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= Date.now() + 60_000;

export function* openCodeDbV2Records(ctx: AppContext, source: SourceRegistration, path: string): Generator<Item> {
  if (source.tool !== 'opencode' || !isOpenCodeV2(source.version)) throw new DomainError('HISTORY_VERSION_UNSUPPORTED');
  const db = openReadonlyDatabase(path);
  try {
    for (const [table, columns] of Object.entries(tables)) {
      const found = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name);
      if (columns.some((column) => !found.includes(column))) throw new DomainError('HISTORY_FORMAT_UNSUPPORTED');
    }
    const sessions = db.all<SessionRow>('SELECT id, directory, parent_id, version, time_created FROM session_v2 ORDER BY time_created, id LIMIT ?', SCAN_LIMIT + 1);
    if (sessions.length > SCAN_LIMIT) throw new DomainError('HISTORY_NATIVE_SCAN_LIMIT');
    const authorize = historyAuthorizer(ctx, source);
    let skipped = false;
    for (const session of sessions) {
      if (!isOpenCodeV2(session.version) || typeof session.directory !== 'string' || !validTime(session.time_created)) continue;
      // Sessões podem mudar de diretório; o cwd inicial é o `previous` da primeira troca, não o diretório atual.
      let cwd = session.directory;
      const firstSwitch = db.get<{ data: string }>("SELECT data FROM session_message WHERE session_id = ? AND type = 'location-switched' ORDER BY seq LIMIT 1", session.id);
      if (firstSwitch) {
        try { const previous = (JSON.parse(firstSwitch.data) as { previous?: { location?: { directory?: unknown } } }).previous?.location?.directory; if (typeof previous === 'string') cwd = previous; } catch { /* Mantém o diretório atual. */ }
      }
      const parent = session.parent_id ?? undefined;
      const emit = (originId: string, at: number, type: string, payload: Record<string, string>): Item | null => {
        const canonical = authorize(cwd, session.id); if (!canonical) return null;
        const record: PluginRecord = { originId, occurredAt: new Date(at).toISOString(), nativeSessionId: session.id, ...(parent ? { parentSessionId: parent } : {}), cwd: canonical, type, payload };
        const values = normalizeEvent(source, record);
        return values.length === 1 ? { value: values[0]! } : (skipped = true, null);
      };
      const start = emit(`${session.id}:db-v2-start`, session.time_created, 'session.start', { reason: parent ? 'subagent' : 'startup' });
      if (start) yield start;
      for (let after = -1;;) {
        const page = db.all<MessageRow>('SELECT id, type, seq, time_created, data FROM session_message WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?', session.id, after, PAGE);
        for (const message of page) {
          after = message.seq;
          if (message.type === 'location-switched') {
            try { const next = (JSON.parse(message.data) as { location?: { directory?: unknown } }).location?.directory; if (typeof next === 'string') cwd = next; } catch { skipped = true; }
            continue;
          }
          if (message.type !== 'user' && message.type !== 'assistant') continue;
          let data: Record<string, unknown>;
          try { const parsed: unknown = JSON.parse(message.data); if (!isObject(parsed)) throw new Error(); data = parsed; } catch { skipped = true; continue; }
          const time = isObject(data.time) ? data.time : {};
          const created = time.created;
          if (!validTime(created)) { skipped = true; continue; }
          if (message.type === 'user') {
            const item = emit(message.id, created, 'turn.submit', { turnId: message.id }); if (item) yield item;
            continue;
          }
          // Resposta ainda em andamento fica para o plugin ao vivo; sem fim não há duração observável.
          if (!validTime(time.completed) || time.completed < created) continue;
          const turn = emit(`${message.id}:start`, created, 'turn.start', { turnId: message.id }); if (turn) yield turn;
          for (const part of Array.isArray(data.content) ? data.content : []) {
            if (!isObject(part) || part.type !== 'tool' || typeof part.id !== 'string' || !isObject(part.time)) continue;
            const begin = validTime(part.time.ran) ? part.time.ran : part.time.created; const finish = part.time.completed;
            if (!validTime(begin) || !validTime(finish) || finish < begin) continue;
            const name = typeof part.name === 'string' && part.name && part.name.length <= 120 ? part.name : 'opencode-tool';
            const failed = isObject(part.state) && part.state.status === 'error';
            const open = emit(`${message.id}:${part.id}:start`, begin, 'tool.start', { toolName: name, toolUseId: part.id }); if (open) yield open;
            const close = emit(`${message.id}:${part.id}:end`, finish, 'tool.end', { toolName: name, toolUseId: part.id, outcome: failed ? 'failed' : 'completed' }); if (close) yield close;
          }
          const end = emit(`${message.id}:end`, time.completed, 'turn.end', { turnId: message.id, outcome: data.finish === 'error' ? 'failed' : 'completed' }); if (end) yield end;
        }
        if (page.length < PAGE) break;
      }
    }
    if (skipped) yield { warning: 'HISTORY_RECORDS_SKIPPED' };
  } finally { db.close(); }
}
