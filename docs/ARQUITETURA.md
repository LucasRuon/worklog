# Arquitetura e contratos propostos

Escolhas técnicas deste planejamento. Ler junto com `ESPECIFICACAO.md`; nenhum módulo descrito abaixo já está implementado.

## Componentes

```text
Claude / Codex / OpenCode + Git + observação de arquivos
                    ↓
             coletor por máquina
         SQLite local + fila de eventos
                    ↓
      local: ingestão no mesmo serviço
      remoto: lotes buscados por SSH
                    ↓
       SQLite central no Mac principal
                    ↓
   sessões / intervalos / relações / consultas
                    ↓
        API local → painel → CSV / PDF
```

O mesmo código do coletor deve executar em macOS e Linux. Não instalar interface gráfica no Mac mini. O painel não precisa estar aberto para a coleta funcionar. Serviço e CLI compartilham funções; não criar infraestrutura distribuída além do transporte SSH necessário.

## Stack proposta

| Parte | Decisão |
|---|---|
| Runtime | Node.js 24 LTS; baseline observada no Mac: 24.19.0. T01 fixa patch com suporte e lockfile após validar compatibilidade. |
| Linguagem | TypeScript em modo estrito. |
| Persistência | SQLite, SQL versionado, WAL, foreign keys, transações e driver `node:sqlite` isolado. API do driver classificada como RC na fonte consultada. |
| API/CLI | `node:http` e subprocessos com argumentos separados; nada de montar comandos de shell com paths ou dados externos. |
| Frontend | React + Vite; CSS próprio baseado no mockup grafite. |
| Testes | `node:test` + `tsx` para TS, Playwright somente para os fluxos de interface e exportação. |
| PRs | REST do GitHub com autenticação já disponível ou credencial de leitura apropriada. Não persistir token no banco de eventos. |
| PDF | Página de relatório própria e impressão/PDF pelo Chromium local. |

Evitar ORM, Redis, Docker obrigatório, servidor de banco separado, Electron e APIs de IA para o primeiro uso. Pinagem de bibliotecas e comandos de desenvolvimento é parte de T01.

## Estrutura a criar durante a implementação

```text
src/
  core/
    contracts.ts        # tipos de eventos, sessões, intervalos e filtros
    sqlite.ts           # única dependência direta do driver SQLite
    events.ts           # persistência idempotente e cursores
    projects.ts         # identidade de projetos e raízes por máquina
    policy.ts           # exclusões, limites e filtragem
    sessions.ts         # reconstrução de sessões e estados
    time.ts             # união de intervalos e atribuição humana
    summaries.ts        # resumo com referências às evidências
    adjustments.ts      # notas e ajustes auditáveis
  collectors/
    claude.ts
    codex.ts
    opencode.ts
    source-config.ts
    history.ts
    git.ts
    files.ts
    revisions.ts
    relations.ts
    focus.ts            # sinais mínimos de atividade, não keylogging
  remote/
    protocol.ts         # protocolo de lotes e cursores
    ssh.ts              # transporte de leitura pelo SSH existente
  providers/github.ts
  reports/
    query.ts
    csv.ts
    pdf.ts
  server/
    index.ts
    routes.ts
    auth.ts
  cli/
    index.ts
    doctor.ts
    service.ts
  web/
    main.tsx
    api.ts
    styles.css
    pages/
      Overview.tsx
      Projects.tsx
      ProjectDetail.tsx
      Activity.tsx
      Exports.tsx
      Integrations.tsx
db/migrations/
tests/
  core/
  collectors/
  remote/
  providers/
  reports/
  integration/
  e2e/
  fixtures/
scripts/
```

Esses paths são alvos do backlog, não scaffolding já criado. Criar só o que a tarefa em execução precisa.

## Contratos entre módulos

Os nomes abaixo são normativos para o plano. T01 introduz `AppContext`; T02 define os demais tipos compartilhados em `src/core/contracts.ts`. IDs são strings UUID, horários ISO 8601 UTC, durações inteiros em milissegundos. Tipos discriminados devem carregar apenas payload permitido pela política.

```ts
type Tool = 'claude' | 'codex' | 'opencode' | 'git' | 'files' | 'focus';
type Confidence = 'explicit' | 'inferred' | 'unlinked';
type EventType =
  | 'session.start' | 'session.end' | 'session.interrupt'
  | 'turn.submit' | 'turn.start' | 'turn.end'
  | 'tool.start' | 'tool.end' | 'human.interaction'
  | 'focus.change' | 'machine.idle' | 'machine.resume'
  | 'file.change' | 'git.commit';
interface WorkEvent {
  schemaVersion: 1;
  eventId: string;
  deviceId: string;
  installationId: string;
  originSeq: number;
  sourceId: string;
  tool: Tool;
  type: EventType;
  occurredAt: string;
  receivedAt: string;
  nativeSessionId?: string;
  nativeAgentId?: string;
  parentSessionId?: string;
  cwd?: string;
  payload: Record<string, unknown>; // validar pelo discriminante; nunca aceitar JSON irrestrito
}
interface Interval {
  start: string;
  end: string;
  sessionId: string;
  projectId?: string;
  quality: 'observed' | 'estimated' | 'adjusted';
}
interface ReportFilter {
  projectIds: string[];
  from: string;
  to: string;
  timezone: string;
  deviceIds?: string[];
  tools?: Tool[];
}
```

T02 completa o catálogo de tipos `AppContext`, `EventInput`, `SourceRegistration`, `AppendResult`, `EventBatch`, `Cursor`, `ProjectRoot`, `ProjectMatch`, `Session`, `TimeSummary`, `PolicyConfig`, `CaptureDecision`, `FileRevision`, `EvidenceLink`, `ReportData`, `ReportOptions`, `PullRequestSnapshot`, `Adjustment`, `Diagnostic`. Derivar cada um dos contratos de domínio acima e das colunas abaixo, evitando abstrações genéricas. O `payload` de cada evento deve ter seu schema concreto antes de um adapter produzi-lo.

## Persistência

| Tabela | Chaves e responsabilidades |
|---|---|
| devices | UUID persistente, nome, OS, fuso e última conexão. |
| installations | UUID persistente por instalação do coletor; nova instalação nunca reutiliza sequência antiga. |
| sources | Máquina, instalação, ferramenta, perfil/conta, versão e capacidades detectadas. |
| projects | Identidade do projeto, nome e cliente opcional. |
| repositories | Identidade canônica do remote ou identidade local associada manualmente; sem credenciais na URL. |
| project_roots | Projeto/repositório, máquina, caminho real e worktree; unicidade máquina+caminho. |
| events | `event_id` único; chave alternativa `(installation_id, origin_seq)`; payload filtrado, origem e recebimento. |
| sync_cursors | Origem e última sequência confirmada na mesma transação dos eventos. |
| sessions | Fonte+sessão nativa+agente; pai opcional, estado, início/fim e completude. |
| intervals | Dedicação/execução, sessão, qualidade e regra aplicada; sem destruir eventos brutos. |
| file_changes / revisions | Paths relativos, operação, hashes/conteúdo elegível, limites e retenção; conteúdo fora dos logs. |
| commits / commit_files | Unicidade repositório+SHA; metadados e arquivos; deduplicação entre máquinas. |
| pull_requests | Unicidade provedor+repositório+número; estados e última sincronização. |
| evidence_links | Origem/destino, confiança e motivo; inferência nunca sobrescreve associação explícita. |
| notes / adjustments | Texto filtrado e mudanças auditáveis com antes/depois, autor local e motivo. |
| summaries | Texto, intervalo, versão da regra e IDs de evidências utilizadas. |

Migrações posteriores acrescentam tabelas quando a tarefa correspondente chega; T02 cria só a fundação. Importação de lote é transacional e cursor só é confirmado no mesmo commit. Sequência monotônica sobrevive a reinícios. Falha/cancelamento não confirma lote incompleto.

## Processamento

- Normalizar e filtrar antes da persistência. Payload bruto não vai para banco/logs como mecanismo de diagnóstico.
- Projeções de sessões e tempos são reconstruíveis; mudar regra não exige editar evento de origem.
- Eventos atrasados atualizam a sessão correspondente, em vez de criar nova sessão arbitrária.
- Para custo limitado, usar lotes de até 500 eventos; trabalhos demorados devem ceder o loop entre lotes. Avaliar worker apenas se a medição demonstrar bloqueio.
- Watcher não garante cada gravação; reconciliação deve detectar divergência e registrar lacuna quando não puder restaurar estados intermediários.

## Sincronização SSH

CLI remota proposta: `worklog-agent export --after <seq> --limit 500`. Resposta JSON validada `EventBatch`, emitida apenas em stdout; diagnóstico em stderr. Executável e host vêm da configuração validada, não de payload de evento.

`EventBatch = { schemaVersion: 1, installationId, events, nextCursor, hasMore }`. O cursor acompanha a instalação; uma reinstalação demanda nova origem. Se um lote for repetido após queda de conexão, o armazenamento central deve aceitá-lo sem duplicação. Ordenar consumo por sequência, não por relógio de parede.

Não desativar verificação de host SSH. Não armazenar chave privada em configuração do Worklog. Se o relógio remoto divergir além de 60 s, sinalizar tempo potencialmente impreciso e não usar esse dado para atribuição automática de dedicação entre máquinas até reconciliar; execução por durações confiáveis continua identificada.

## API local e filtros

Rotas propostas: `/api/health`, `/api/projects`, `/api/sessions`, `/api/activity`, `/api/summary`, `/api/commits`, `/api/files`, `/api/prs`, `/api/sources`, `/api/adjustments`, `/api/reports`.

T08 implementa apenas rotas necessárias ao primeiro painel; tarefas seguintes ampliam. `ReportFilter` é compartilhado entre consultas e exportação. Paginação por cursor e limite de 100 registros por página para listas. Consulta de gráfico agrega no servidor; não carregar todos os eventos no navegador.

Bind inicial `127.0.0.1:4320` (configurável; diferente da prévia 4318). Validar Host/Origin e token de sessão local. Endpoints mutáveis e ingestão exigem autenticação; API não deve aceitar requisições arbitrárias de páginas externas. O token de bootstrap pode ser entregue ao abrir a UI local sem permanecer na URL/histórico; não embutir segredo no bundle.

## Defaults operacionais propostos

| Configuração | Valor inicial |
|---|---|
| Janela estimada após interação | Até 5 min; encerrada por troca de projeto/pausa/ociosidade. |
| Pausa por inatividade | 5 min; bloqueio/suspensão pausam imediatamente quando observados. |
| Debounce de arquivo | 500 ms. |
| Reconciliação de arquivos | 30 s. |
| Revisão textual máxima | 2 MiB. |
| Retenção de revisões intermediárias | 30 dias, configurável. |
| Consulta de PRs | 5 min quando online; respeitar rate limit e backoff. |
| Busca de eventos remotos | 15 s conectado, backoff até 5 min desconectado. |
| Lote remoto | Até 500 eventos. |

Defaults devem ser exibidos nas configurações relevantes, nunca apresentados como escolhas já feitas pelo usuário. Definir orçamento de armazenamento e crescimento dos demais eventos em T23; não excluir eventos não sincronizados para liberar espaço silenciosamente.
