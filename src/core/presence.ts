import type { Tool, WorkEvent } from './contracts.js';

/**
 * Regra `presence-attribution-v2`: separa "o humano estava na máquina?" de "em qual projeto?".
 *
 * - Presença: só existe entre `machine.resume` e `machine.idle` (teclado/mouse observados pelo coletor de foco).
 *   Agente rodando a noite toda ou computador esquecido ligado não geram dedicação. Ociosidade por tempo
 *   (`reason: 'idle'`) é recortada para o último uso real (`ocorrido − idleMs`), não para o momento da detecção.
 * - Projeto: cada trecho presente vai para os projetos com atividade recente (até `CONTEXT_MS`): prompt raiz,
 *   resposta concluída do agente (quando começa a revisão), arquivo alterado, sinal explícito ou foco. Projetos
 *   simultâneos dividem o trecho no cálculo; presença sem contexto fica como não atribuída, nunca é descartada.
 * - Sinal explícito ou foco resolvido declara "estou neste projeto agora" e descarta os demais contextos;
 *   foco não resolvido descarta todos (trecho não atribuído).
 */
export const CONTEXT_MS = 30 * 60_000;
export const OPEN_END = Date.parse('9999-12-31T23:59:59.999Z');

export interface PresenceRow { id: string; projectId: string | null; deviceId: string; sourceId: string; tool: Tool; start: number; end: number }
interface Context { at: number; id: string; sourceId: string; tool: Tool }
interface Device { present: { at: number; id: string; sourceId: string; tool: Tool } | null; cursor: number; contexts: Map<string, Context>; rows: PresenceRow[] }

export const presenceEventTypes = ['human.interaction', 'focus.change', 'machine.idle', 'machine.resume', 'turn.submit', 'turn.end', 'file.change'] as const;

/**
 * `events` ordenados por horário, apenas de máquinas com presença acompanhada e a partir do primeiro retorno.
 * `projectOf` devolve o projeto do evento ou `null` quando a pasta não pertence a nenhum projeto.
 */
export function presenceRows(events: readonly WorkEvent[], projectOf: (event: WorkEvent) => string | null, idleMs: number): PresenceRow[] {
  const devices = new Map<string, Device>();
  const device = (id: string) => { let state = devices.get(id); if (!state) devices.set(id, state = { present: null, cursor: 0, contexts: new Map(), rows: [] }); return state; };
  const emit = (deviceId: string, state: Device, start: number, end: number) => {
    const active = [...state.contexts.entries()].filter(([, context]) => context.at > start - CONTEXT_MS);
    const owners = active.length ? active.map(([key, context]) => ({ projectId: key || null, ...context })) : [{ projectId: null, ...state.present! }];
    for (const owner of owners) {
      const previous = state.rows.findLast((row) => row.end === start && row.projectId === owner.projectId && row.sourceId === owner.sourceId);
      if (previous) previous.end = end;
      else state.rows.push({ id: owner.id, projectId: owner.projectId, deviceId, sourceId: owner.sourceId, tool: owner.tool, start, end });
    }
  };
  /** Avança o tempo até `until`, cortando os trechos sempre que um contexto expira. */
  const advance = (deviceId: string, state: Device, until: number) => {
    if (!state.present) { state.cursor = until; return; }
    while (state.cursor < until) {
      const start = state.cursor;
      const expiries = [...state.contexts.values()].map((context) => context.at + CONTEXT_MS).filter((at) => at > start);
      const end = Math.min(until, ...expiries);
      emit(deviceId, state, start, end); state.cursor = end;
    }
    for (const [key, context] of state.contexts) if (context.at + CONTEXT_MS <= until) state.contexts.delete(key);
  };
  /** Ociosidade detectada depois do último uso: remove o que foi emitido após o corte. */
  const trim = (state: Device, cut: number) => {
    state.rows = state.rows.filter((row) => row.start < cut);
    for (const row of state.rows) if (row.end > cut) row.end = cut;
  };
  for (const event of events) {
    if (event.nativeAgentId) continue;
    const at = Date.parse(event.occurredAt);
    const state = device(event.deviceId);
    advance(event.deviceId, state, at);
    const mark = (key: string) => state.contexts.set(key, { at, id: event.eventId, sourceId: event.sourceId, tool: event.tool });
    const begin = () => { if (!state.present) { state.present = { at, id: event.eventId, sourceId: event.sourceId, tool: event.tool }; state.cursor = at; } };
    switch (event.type) {
      case 'machine.resume': begin(); break;
      case 'machine.idle':
        if (state.present) { if (event.payload.reason === 'idle') trim(state, Math.max(state.present.at, at - idleMs)); state.present = null; }
        break;
      case 'human.interaction': begin(); state.contexts.clear(); mark(projectOf(event) ?? ''); break;
      case 'focus.change': {
        state.contexts.clear();
        const project = event.payload.confidence === 'unresolved' ? null : projectOf(event);
        if (project) mark(project);
        break;
      }
      // Prompt com a máquina ociosa é automação, não presença; o de subagente não é do humano.
      case 'turn.submit': if (state.present && !event.parentSessionId) mark(projectOf(event) ?? ''); break;
      // Resposta concluída vale mesmo sem presença: quem volta à máquina revisa o que o agente entregou.
      case 'turn.end': if (!event.parentSessionId) { const project = projectOf(event); if (project) mark(project); } break;
      case 'file.change': { const project = projectOf(event); if (project) mark(project); break; }
    }
  }
  const rows: PresenceRow[] = [];
  for (const [deviceId, state] of devices) { advance(deviceId, state, OPEN_END); rows.push(...state.rows); }
  return rows;
}
