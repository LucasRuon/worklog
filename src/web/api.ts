import type { Project, Session, TimeSummary, WorkEvent, Tool } from '../core/contracts.js';

export interface Page<T> { items: T[]; nextCursor: string | null }
export type Activity = WorkEvent & { projectId: string | null; profile: string };
export interface Summary {
  summary: TimeSummary; sessionCount: number; activityCount: number; totalProjects: number;
  byProject: { id: string; name: string; client: string | null; summary: TimeSummary; sessionCount: number }[];
}
export type Source = import('../collectors/source-status.js').SourceStatus;
export interface Settings {
  deviceId: string; timezone: string; humanWindowMs: number; idleMs: number; focusObservation: string;
  devices?: { id: string; name: string }[];
  automation?: { workspaces: string[]; localService: { installed: boolean; running: boolean; manager: string }; remotes: { host: string; device_id: string | null; last_sync_at: string | null; last_error: string | null; clock_skew_ms: number; enabled: number }[] };
}
export function machineName(settings: Settings, deviceId: string) { return deviceId === settings.deviceId ? 'Local' : settings.devices?.find((device) => device.id === deviceId)?.name ?? deviceId.slice(0, 8); }
export interface DashboardData { projects: Page<Project>; sessions: Page<Session>; activity: Page<Activity>; summary: Summary; sources: { items: Source[]; collectorStatus: string }; settings: Settings }
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    try { const data = await response.json() as { error?: string }; if (typeof data.error === 'string') code = data.error; } catch { /* Não expor resposta inesperada. */ }
    throw new ApiError(response.status, code);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
export function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Não foi possível acessar a base local. Confirme que o servidor está ativo.';
  const messages: Record<string, string> = {
    ROOT_UNAVAILABLE: 'A pasta não está disponível nesta máquina. Confira o caminho absoluto.',
    DATA_ROOT_OVERLAP: 'Escolha uma raiz que não contenha o diretório de dados do Worklog.',
    INVALID_ROOT: 'Confira o nome do projeto e o caminho absoluto da pasta.',
    INVALID_REMOTE: 'O remote Git não tem um formato suportado.',
    LOCAL_PROJECT_REQUIRED: 'Cadastre uma raiz local desse projeto para registrar dedicação.',
    INVALID_PERIOD: 'O início do período deve ser anterior ao fim.',
    INVALID_WINDOW: 'Escolha uma janela entre 1 e 60 minutos.',
    REPORT_PROJECTS_REQUIRED: 'Selecione ao menos um projeto para exportar.',
    UNKNOWN_PROJECT: 'Um projeto selecionado não está mais disponível. Atualize e confira a seleção.',
    REPORT_SECTION_UNAVAILABLE: 'Uma seção solicitada ainda não está disponível.',
    REPORT_TOO_LARGE: 'O relatório excede o limite de 10 mil sessões/commits ou 16 MiB. Reduza o período ou a seleção.',
    REPORT_EXPIRED: 'A prévia expirou ou o servidor reiniciou. Gere uma nova prévia para baixar.',
    REVISION_NOT_FOUND: 'A revisão não está disponível nesta seleção ou foi bloqueada pela política atual.',
    EVIDENCE_SCOPE_MISMATCH: 'Escolha uma sessão do mesmo projeto e máquina da revisão.',
    INVALID_EVIDENCE_LINK: 'Não foi possível registrar essa associação.',
    SOURCE_CHANGED: 'A fonte mudou em outra operação. Atualize os dados e tente novamente.',
    SOURCE_REINSTALL_REQUIRED: 'Reinstale a instrumentação pelo CLI antes de habilitar esta fonte.',
    SOURCE_LOCAL_ACTION_REQUIRED: 'Remova a instrumentação na máquina de origem. A pausa central continua disponível.',
    INVALID_SOURCE: 'Confira ferramenta, perfil, versão e caminho absoluto da configuração.',
    PLUGIN_FILE_NOT_OWNED: 'Este arquivo pertence a outra instalação. Nenhum plugin alheio foi removido.',
    ADJUSTMENT_OVERLAP: 'Já existe um ajuste ativo neste intervalo global. Desfaça-o antes de reatribuir o período.',
    ADJUSTMENT_CHANGED: 'O tempo ou a revisão mudou em outra operação. Atualize e confira antes de salvar.',
    INVALID_ADJUSTMENT: 'Use um intervalo passado em UTC e informe o motivo. A duração corrigida não pode superar esse intervalo.',
    NOTE_CHANGED: 'A nota foi alterada em outra operação. Reabra o detalhe para carregar a versão atual.',
    INVALID_NOTE: 'Confira o texto (até 8192 caracteres), a classificação e a data da nota.',
    REPORT_DIFF_LIMIT: 'A seleção de diffs excede o limite de geração. Reduza o período ou desmarque os diffs.',
    REPORT_DIFF_REQUIRES_FILES: 'Selecione revisões de arquivos para incluir os diffs.',
    CONFIG_CHANGED: 'A configuração mudou em outra operação. Confira os valores atuais antes de salvar.',
    INVALID_CONFIGURATION: 'Confira os limites de tempo, retenção, orçamento e os caminhos relativos sem .. nas exclusões.',
    SOURCE_PAUSED: 'Esta fonte está pausada. Habilite-a em Integrações para receber novos sinais.',
  };
  return error.status === 401 ? 'A sessão local expirou. Reabra com npm run cli -- open.' : messages[error.code] ?? 'Não foi possível concluir a operação. Confira os campos e tente novamente.';
}
export function duration(ms: number) {
  if (ms > 0 && ms < 60_000) return '<1 min';
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}
export function timestamp(value: string, timezone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}
export const stateLabels: Record<Session['state'], string> = { running: 'Em execução', waiting: 'Aguardando usuário', closed: 'Encerrada', interrupted: 'Interrompida', incomplete: 'Incompleta' };
export const eventLabels: Record<WorkEvent['type'], string> = {
  'session.start': 'Sessão iniciada / retomada', 'session.end': 'Sessão encerrada', 'session.interrupt': 'Sessão interrompida',
  'turn.submit': 'Prompt submetido', 'turn.start': 'Turno iniciado', 'turn.end': 'Turno finalizado', 'tool.start': 'Ferramenta iniciada', 'tool.end': 'Ferramenta finalizada',
  'human.interaction': 'Dedicação sinalizada', 'focus.change': 'Atribuição de foco', 'machine.idle': 'Pausa / inatividade', 'machine.resume': 'Máquina retomada', 'file.change': 'Arquivo alterado', 'git.commit': 'Commit observado',
};
