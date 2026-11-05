# Worklog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Método de execução ainda não escolhido; este documento não inicia implementação ou delegação.

**Goal:** entregar um painel local que reúna trabalho, tempo, arquivos, commits e PRs por projeto, incluindo agentes locais e no Mac mini.

**Architecture:** um coletor por máquina grava eventos duráveis; o Mac principal recebe os eventos locais e busca lotes remotos por SSH. SQLite preserva origens e alimenta projeções de sessões, tempo e evidências. Uma API local serve o painel e os relatórios.

**Tech Stack:** proposta: Node.js 24 LTS, TypeScript, SQLite com `node:sqlite` isolado, React/Vite, `node:test`, Playwright e GitHub REST. Validar runtimes, versões e provedor real em T01. Não introduzir API de IA para o primeiro marco.

**Spec:** [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md). Interfaces, estrutura e defaults: [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Referência visual: [referencias/mockup/index.html](referencias/mockup/index.html).

## Global Constraints

- Uso pessoal e local; API inicial em `127.0.0.1:4320`; dados reais da aplicação separados do mockup.
- macOS local e host remoto observado como Linux x86_64; revalidar antes da instalação.
- Dedicação estimada, execução de IA e duração da sessão são medidas independentes; não somar como horas humanas.
- Instalação e conta de origem identificadas; reprocessamento e sincronização idempotentes.
- Pausa por inatividade e janela inicial de estimativa: 5 min; defaults visíveis e configuráveis.
- Datas persistidas em UTC; apresentação inicial `America/Sao_Paulo`; filtros `[from,to)`.
- Arquivos: debounce 500 ms, reconciliação 30 s, revisão textual até 2 MiB, retenção inicial 30 dias.
- Coleta restrita às raízes cadastradas e à política de exclusão; sem keylogging ou gravação de tela.
- Hooks não interrompem agentes; PRs e Git são integrações de leitura.
- Layout aprovado; paleta grafite e neutros frios. Preservar a direção impeccable do mockup.
- Eventos brutos imutáveis; ajustes auditáveis; toda correlação inferida explicitamente identificada.
- CSV/PDF somente com seleção e filtros aplicados. XLSX nativo e síntese por LLM não entram nesta primeira versão.

## Review Focus

1. Sessões paralelas em duas máquinas: dedicação global sem duplicação e trecho ambíguo não atribuído — T07/T16/T24.
2. Queda entre importação e confirmação do cursor: repetir lote sem perder/duplicar eventos — T02/T16.
3. Mesmo projeto em caminhos/worktrees diferentes e nomes com espaços/unicode: identidade correta e Git sem parsing de shell — T03/T09/T10.
4. Credenciais, paths externos e payloads grandes: negar captura antes da persistência e manter o coletor operacional — T04/T10/T23.
5. Exportação parcial, datas/fusos e provedor offline: somente os projetos do período, estimativas identificadas e PRs desatualizados sinalizados — T18/T21/T24.

## Como executar

Cada tarefa termina com uma entrega verificável. Os paths abaixo são propostos e devem ser criados durante a implementação, não existem nesta entrega de planejamento. Os testes indicados são casos necessários para regras de domínio ou integrações, não testes de estilos estáticos.

Antes de mudar comportamento: criar o teste listado, executá-lo e confirmar que falha pelo comportamento ausente; implementar o mínimo e repetir. Depois dos critérios satisfeitos, registrar evidência e fazer um commit daquela tarefa quando o repositório estiver inicializado. Não publicar ou fazer push por consequência automática deste plano.

T01 define os comandos `npm run typecheck`, `npm run test:unit -- <caminho>`, `npm run test:integration -- <caminho>`, `npm run test:e2e -- <caminho>`, `npm run build` e `npm run dev`. Os comandos de teste devem aceitar explicitamente o caminho passado depois de `--`. Os comandos abaixo se referem a esse contrato; eles ainda não estão disponíveis.

## Índice do backlog

Todos os itens começam com status **Pendente**. P0 = primeiro marco; P1 = escopo principal; P2 = fechamento operacional.

| ID | Tarefa | Marco | Prioridade | Dependências |
|---|---|---|---|---|
| T01 | Base executável e inventário de compatibilidade | M1 | P0 | — |
| T02 | Eventos, SQLite e idempotência | M1 | P0 | T01 |
| T03 | Projetos, repositórios e raízes | M1 | P0 | T02 |
| T04 | Política de captura e normalização | M1 | P0 | T02,T03 |
| T05 | Coletor local do Claude Code | M1 | P0 | T04 |
| T06 | Reconstrução de sessões | M1 | P0 | T05 |
| T07 | Dedicação, execução e sobreposições | M1 | P0 | T06 |
| T08 | Primeiro painel com dados reais | M1 | P0 | T03,T06,T07 |
| T09 | Histórico de commits Git | M2 | P1 | T03,T04 |
| T10 | Histórico de mudanças nos arquivos | M2 | P1 | T04,T09 |
| T11 | Revisões, diffs e relações com sessões | M2 | P1 | T06,T09,T10 |
| T12 | Integração local do Codex | M3 | P1 | T04,T06 |
| T13 | Integração local do OpenCode | M3 | P1 | T04,T06 |
| T14 | Fontes, perfis e múltiplas contas | M3 | P1 | T05,T08,T12,T13 |
| T15 | Importação do histórico disponível | M3 | P1 | T09,T12,T13,T14 |
| T16 | Coletor e sincronização SSH no Mac mini | M4 | P1 | T02,T03,T05,T07,T14 |
| T17 | Execução contínua nas duas máquinas | M4 | P1 | T16 |
| T18 | PRs, revisões e verificações | M5 | P1 | T03,T09,T14 |
| T19 | Resumos de trabalho com evidências | M5 | P1 | T06,T11,T18 |
| T20 | Painel completo e navegação das evidências | M5 | P1 | T08,T11,T14,T16,T18,T19 |
| T21 | Exportação por projetos e período | M6 | P1 | T20 |
| T22 | Notas e ajustes auditáveis de tempo | M6 | P1 | T07,T20,T21 |
| T23 | Configurações, retenção e recuperação | M6 | P2 | T10,T16,T17,T22 |
| T24 | Piloto completo e entrega do primeiro produto | M6 | P2 | T15,T17,T18,T21,T22,T23 |

## M1 — Primeiro uso local

### T01 — Base executável e inventário de compatibilidade

**Arquivos:** criar `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.env.example`, `src/server/index.ts`, `src/server/auth.ts`, `src/cli/index.ts`, `src/cli/doctor.ts`, `src/core/sqlite.ts`, `src/web/main.tsx`, `tests/integration/bootstrap.test.ts`, `docs/AMBIENTE.md`.

**Interfaces:** produzir `createApp(options: {dataDir:string;port:number}): Promise<AppContext>` e `closeApp(ctx:AppContext): Promise<void>`; `AppContext` contém a conexão encapsulada, configuração e shutdown. Produzir os comandos npm definidos acima.

- [ ] Inventariar versões, superfícies CLI/app, perfis e roots locais das três ferramentas sem copiar segredos. Revalidar `macmini`, OS, runtime, PATH e fontes. Registrar remotes/provedores apenas dos projetos escolhidos para o piloto.
- [ ] Fixar Node 24 e bibliotecas compatíveis com lockfile; validar SQLite em memória no Mac e registrar necessidade de runtime remoto em `AMBIENTE.md`. Isolar a API RC do driver e não usar versão da documentação como versão instalada.
- [ ] Criar base mínima API/CLI/UI, migrações por arquivo e diretório de dados fora dos repositórios monitorados. Aplicar bind local, Host/Origin e bootstrap autenticado; definir o armazenamento local do token sem colocar segredo em bundle/log.
- [ ] Verificar `bootstrap.test.ts`: iniciar em diretório temporário e porta livre, responder health, recusar mutação sem token e Origin externo; fechar sem deixar processo/porta abertos. Rodar `npm run test:integration -- tests/integration/bootstrap.test.ts` e `npm run build`.
- [ ] Documentar execução local e marcar esta tarefa somente quando outra execução limpa conseguir iniciar e encerrar a base. Inicializar Git para o projeto caso ainda não exista e versionar somente os arquivos da tarefa.

**Aceite:** projeto inicia em loopback, instala de modo reproduzível e há inventário suficiente para desenvolver o primeiro adapter; nenhum hook do usuário é alterado nesta tarefa.

### T02 — Eventos, SQLite e idempotência

**Arquivos:** criar `src/core/contracts.ts`, `src/core/events.ts`, `db/migrations/001_events.sql`, `tests/core/events.test.ts`; ampliar `src/core/sqlite.ts`.

**Interfaces:** consumir `AppContext`. Produzir tipos do catálogo de `ARQUITETURA.md`, `appendEvent(ctx,input:EventInput): AppendResult`, `importBatch(ctx,batch:EventBatch): AppendResult`, `readBatch(ctx,cursor:Cursor,limit:number): EventBatch`. `EventInput` é o evento normalizado antes da atribuição de sequência/recebimento; preserva `eventId` estável em retries. `AppendResult` informa inseridos/duplicados e cursor confirmado.

- [ ] Definir schemas de eventos v1 e tipos compartilhados; definir payloads permitidos por discriminante e limites. Definir `TimeSummary` com `humanEstimatedMs`, `humanAdjustedMs`, `unassignedHumanMs`, `agentAccumulatedMs`, `agentWallMs`, `sessionSpanMs`, sem campo ambíguo `totalHours`.
- [ ] Criar tabelas iniciais de máquinas, instalações, fontes, eventos e cursores; migrações transacionais e sequência persistente por instalação.
- [ ] Implementar append e importação com unicidade por ID e instalação+sequência. Gravar cursor e eventos na mesma transação; validar versão e identidade antes de confirmar.
- [ ] Testar `events.test.ts`: importar o mesmo lote duas vezes mantém contagem; falhar no meio reverte todo o lote/cursor; reiniciar mantém sequência; instalação nova não colide; evento inválido não avança cursor. Rodar `npm run test:unit -- tests/core/events.test.ts`.
- [ ] Reabrir o banco temporário após o teste de persistência e registrar as verificações; commit da tarefa.

**Aceite:** perda/repetição de transporte não duplica ou descarta eventos válidos.

### T03 — Projetos, repositórios e raízes

**Arquivos:** criar `src/core/projects.ts`, `db/migrations/002_projects.sql`, `tests/core/projects.test.ts`.

**Interfaces:** consumir `AppContext` e `ProjectRoot`; produzir `registerProjectRoot(ctx,root:ProjectRoot): string` e `resolveProject(ctx,deviceId:string,cwd:string): ProjectMatch`. `ProjectMatch` contém projeto/repositório/worktree e motivo ou estado não atribuído.

- [ ] Cadastrar nome, cliente opcional, raízes autorizadas e repositórios de um projeto; associação de vários repositórios e máquinas.
- [ ] Normalizar remote sem credenciais, formas SSH/HTTPS e sufixo `.git`; preservar diferenças reais de host/owner/repositório. Worktree não vira projeto novo.
- [ ] Implementar associação explícita e tratar pastas sem Git ou sem correspondência como não atribuídas; não unir projetos pelo basename.
- [ ] Testar `projects.test.ts`: clone local/remoto com mesmo remote; worktrees; dois repositórios de mesmo nome; paths com espaços/unicode; roots aninhadas com raiz mais específica; `cwd` externo não capturado. Rodar `npm run test:unit -- tests/core/projects.test.ts`.
- [ ] Registrar um projeto de teste sem iniciar captura global; commit da tarefa.

**Aceite:** identidade estável e explicável entre máquinas e worktrees, com opção de associação manual.

### T04 — Política de captura e normalização

**Arquivos:** criar `src/core/policy.ts`, `src/collectors/source-config.ts`, `tests/core/policy.test.ts`, `tests/fixtures/events/`.

**Interfaces:** consumir contratos e resolver de projetos; produzir `captureDecision(root:ProjectRoot,path:string,config:PolicyConfig): CaptureDecision` e `normalizeEvent(source:SourceRegistration,raw:unknown): EventInput[]`. `CaptureDecision` informa metadados/conteúdo permitidos e motivo da exclusão.

- [ ] Definir política inicial de roots, ignores Git, `.env*`, chaves, dependências/builds, binários e tamanho; paths resolvidos sem escapar por symlink.
- [ ] Validar/filtrar cada payload antes de persistir. Metadados mínimos por padrão; transcrição e stdout completos não são atalhos de diagnóstico.
- [ ] Gerar IDs estáveis a partir da identidade nativa/posição de origem; não colapsar duas ações distintas com mesmo timestamp.
- [ ] Testar `policy.test.ts`: arquivo secreto, `.env.example` sem exceção explícita, symlink externo, path traversal, payload inválido/grande, comando com credencial e duas ações distintas simultâneas. Rodar `npm run test:unit -- tests/core/policy.test.ts`.
- [ ] Preservar fixtures anonimizadas e registrar como adicionar exceções seguras; commit da tarefa.

**Aceite:** conteúdo negado não aparece no banco, no log de erro ou no relatório.

### T05 — Coletor local do Claude Code

**Arquivos:** criar `src/collectors/claude.ts`, `src/cli/hooks.ts`, `tests/collectors/claude.test.ts`, `tests/fixtures/claude/`.

**Interfaces:** consumir `normalizeEvent`, `appendEvent` e configuração de fontes; produzir `normalizeClaude(source:SourceRegistration,raw:unknown): EventInput[]` e `configureClaudeHooks(configPath:string,operation:'install'|'remove'): Promise<void>`. Registrar contrato de hook/input da versão testada.

- [ ] Mapear início/fim de sessão, prompt, início/fim de turno e ferramentas disponíveis na versão instalada. Interrupções e eventos indisponíveis precisam de representação explícita.
- [ ] Instalar hooks com merge preservando hooks existentes, backup e remoção só dos itens Worklog. Registrar na fila local durável, inclusive com a UI fechada; falha de coleta não interrompe Claude.
- [ ] Tratar múltiplos caminhos de configuração como fontes distintas. Não sobrescrever stdout do hook com logs e não inserir prompts adicionais na conversa.
- [ ] Testar `claude.test.ts`: sequência real anonimizada, config pré-existente, instalação repetida, fonte com espaço no path, sessão interrompida e banco temporariamente indisponível. Rodar `npm run test:unit -- tests/collectors/claude.test.ts`.
- [ ] Executar uma sessão curta em repositório de teste e comprovar origem, projeto e eventos; documentar a compatibilidade testada e fazer commit.

**Aceite:** uma sessão nova aparece na fila sem alterar o comportamento de desenvolvimento do usuário.

### T06 — Reconstrução de sessões

**Arquivos:** criar `src/core/sessions.ts`, `db/migrations/003_sessions.sql`, `tests/core/sessions.test.ts`.

**Interfaces:** consumir eventos ordenados por sequência da instalação; produzir `projectSessions(ctx,events:WorkEvent[]): void` e `listSessions(ctx,filter:ReportFilter): Session[]`. Sessão interna usa fonte+ID nativo+agente; pai de subagente é relação separada.

- [ ] Modelar estados em execução, aguardando usuário, interrompido, encerrado e incompleto. Reabertura/compactação não cria duração humana automaticamente.
- [ ] Reconciliar eventos atrasados e pares ausentes; não manter turno aberto indefinidamente após queda sem sinalizar incompletude.
- [ ] Preservar vínculos de subagentes e turnos sem mesclar a atividade deles ao tempo humano do pai.
- [ ] Testar `sessions.test.ts`: retomada, compactação, final ausente, eventos fora de ordem, duas contas com mesmo ID nativo e subagentes paralelos. Rodar `npm run test:unit -- tests/core/sessions.test.ts`.
- [ ] Reconstruir a projeção do zero e comparar com a projeção incremental; commit da tarefa.

**Aceite:** sessões são reprocessáveis sem duplicação e sem duração fictícia após falha.

### T07 — Dedicação, execução e sobreposições

**Arquivos:** criar `src/core/time.ts`, `src/collectors/focus.ts`, `db/migrations/004_intervals.sql`, `tests/core/time.test.ts`.

**Interfaces:** produzir `unionDuration(intervals:Interval[]): number`, `deriveTime(ctx,filter:ReportFilter): TimeSummary` e `recordFocus(ctx,event:EventInput): void`. Consumir sessões e eventos de interação/foco; tempos em milissegundos.

- [ ] Separar execução acumulada de agentes, união de execução de relógio, duração de sessão e dedicação humana. Explicar janela inicial de 5 min e permitir trechos não atribuídos.
- [ ] Implementar foco/ociosidade apenas com sinais mínimos disponíveis; não tratar o app Terminal inteiro como identificação confiável de cada aba/SSH. Se não for possível resolver a sessão, oferecer atribuição explícita e preservar incerteza.
- [ ] Encerrar dedicação em bloqueio/suspensão/pausa e evitar atribuir foco local à execução remota. Usar UTC para cálculo e fuso para corte de relatórios.
- [ ] Testar `time.test.ts`: intervalos 09:00–10:00 e 09:30–10:30 resultam em união de 90 min e execução acumulada de 120 min; foco humano ambíguo não vira 120 min. Testar ociosidade, suspensão, virada do dia, DST e evento atrasado.
- [ ] Rodar `npm run test:unit -- tests/core/time.test.ts`; documentar regra em linguagem de produto e fazer commit.

**Aceite:** é impossível obter duas horas de dedicação global a partir de uma hora de relógio com agentes paralelos.

### T08 — Primeiro painel com dados reais

**Arquivos:** criar `src/server/routes.ts`, `src/web/api.ts`, `src/web/styles.css`, `src/web/pages/Overview.tsx`, `Projects.tsx`, `Activity.tsx`, `tests/integration/api-local.test.ts`, `tests/e2e/first-use.spec.ts`.

**Interfaces:** expor `/api/health`, `/api/projects`, `/api/sessions`, `/api/activity`, `/api/summary`; consumir `ReportFilter`, `Session`, `TimeSummary`. Consultas sem seleção explícita expandem projetos registrados no servidor; exportação futura exigirá seleção não vazia.

- [ ] Traduzir o mockup aprovado para componentes reutilizáveis, mantendo grafite/neutros, tabelas e hierarquia. Não portar seus arrays ilustrativos.
- [ ] Implementar listagem e associação de projeto, visão geral e atividade com paginação de até 100 registros, filtros de período e estados vazios/erro/carregamento.
- [ ] Mostrar unidade e natureza de cada tempo; fonte ainda sem dados deve aparecer como tal, não conectada por suposição.
- [ ] Testar API com dois projetos e cortes de período; em `first-use.spec.ts`, cadastrar raiz de teste, receber eventos pelo coletor e abrir a sessão correspondente. Rodar os comandos de integração/E2E para esses paths.
- [ ] Verificar desktop e mobile, teclado e ausência de dados fictícios; registrar evidência e commit. Demonstrar o marco M1 antes de expandir as integrações.

**Aceite M1:** o usuário trabalha no Claude Code local e consulta projeto, sessão e dedicação estimada no painel real.

## M2 — Evidências do trabalho

### T09 — Histórico de commits Git

**Arquivos:** criar `src/collectors/git.ts`, `db/migrations/005_git.sql`, `tests/collectors/git.test.ts`.

**Interfaces:** produzir `scanCommits(ctx,root:ProjectRoot): Promise<{inserted:number;cursor:string}>`; usar subprocessos com argv, formatos NUL e identidade repositório+SHA. Consumir política e registro de projetos.

- [ ] Importar hashes, parents, autoria, datas de autor/committer, mensagem, refs observadas e arquivos por commit; não inferir a branch histórica original só pela branch atual.
- [ ] Registrar commit uma vez entre clones/máquinas. Ler Git sem hooks que façam commits, checkout ou alterações no repositório do usuário.
- [ ] Suportar merge, rebase/force-push e commit recém-descoberto; reter evidência histórica sem afirmar que commit removido ainda está numa branch atual.
- [ ] Testar `git.test.ts` com repositórios temporários: dois clones, worktree, merge, rebase, rename e paths com espaços/unicode/quebras de linha. Rodar `npm run test:unit -- tests/collectors/git.test.ts`.
- [ ] Registrar a última varredura e possibilidade de reindexar; commit da tarefa.

**Aceite:** commits consultáveis no projeto e sem duplicação; histórico antigo não gera horas automaticamente.

### T10 — Histórico de mudanças nos arquivos

**Arquivos:** criar `src/collectors/files.ts`, `db/migrations/006_files.sql`, `tests/collectors/files.test.ts`.

**Interfaces:** produzir `watchRoot(ctx,root:ProjectRoot): Promise<() => Promise<void>>` e `reconcileRoot(ctx,root:ProjectRoot): Promise<void>`; gerar eventos `file.change` filtrados.

- [ ] Observar criar/editar/excluir/renomear, incluindo arquivos não commitados; debounce de 500 ms e reconciliação de 30 s. Distinguir horário observado de horário real desconhecido.
- [ ] Reaplicar política antes de ler conteúdo; arquivos ignorados/fora das roots nunca passam só porque um evento veio do watcher.
- [ ] Suportar save por arquivo temporário, substituição atômica, watcher perdido, renomeação entre diretórios e desligamento limpo. Não prometer capturar todas as edições intermediárias.
- [ ] Testar `files.test.ts`: save atômico, dois writes no debounce, rename, delete, untracked, symlink externo, `.env`, binário e arquivo acima de 2 MiB; reconciliar após interrupção. Rodar `npm run test:unit -- tests/collectors/files.test.ts`.
- [ ] Registrar gaps/limites observados e commit da tarefa.

**Aceite:** o histórico inclui mudanças antes do commit, com exclusões e limitações corretas.

### T11 — Revisões, diffs e relações com sessões

**Arquivos:** criar `src/collectors/revisions.ts`, `src/collectors/relations.ts`, `db/migrations/007_evidence.sql`, `tests/collectors/evidence.test.ts`.

**Interfaces:** produzir `storeRevision(ctx,revision:FileRevision): string`, `linkEvidence(ctx,link:EvidenceLink): void` e `getFileHistory(ctx,rootId:string,path:string): FileRevision[]`. Links carregam confiança e motivo.

- [ ] Preservar revisões textuais elegíveis por hash e gerar diffs; binários/grandes mostram metadados e motivo da ausência de diff.
- [ ] Relacionar chamada de edição/sessão/arquivo e commit pela evidência disponível. Janela temporal isolada gera somente inferência; concorrência não gera autoria certa.
- [ ] Exibir criação/exclusão, mudança de nome quando comprovada e revisões removidas por retenção sem perder metadados da ocorrência.
- [ ] Testar `evidence.test.ts`: duas sessões editando mesmo arquivo, edição manual no editor, rename, revisão idêntica, conteúdo excluído e commit com arquivo compartilhado. Verificar que associação explícita prevalece. Rodar o teste unitário desse path.
- [ ] Disponibilizar consultas para UI sem carregar diffs completos nas listas; commit da tarefa.

**Aceite M2:** navegar de uma sessão a um arquivo e commit, com grau de confiança visível.

## M3 — Três ferramentas e histórico

### T12 — Integração local do Codex

**Arquivos:** criar `src/collectors/codex.ts`, `tests/collectors/codex.test.ts`, `tests/fixtures/codex/`; ampliar `src/cli/hooks.ts`.

**Interfaces:** produzir `normalizeCodex(source:SourceRegistration,raw:unknown): EventInput[]`; consumir o mesmo contrato dos adapters e registrar capacidade por superfície CLI/app.

- [ ] Validar hooks/eventos na versão e superfície instaladas. Respeitar revisão de confiança dos hooks; não bypassar políticas do Codex.
- [ ] Mapear sessões/turnos/ferramentas/subagentes; lidar com compartilhamento do ID da sessão pai e IDs próprios de agente.
- [ ] Se necessário, isolar parser de histórico por versão com checkpoints; não tratar formato interno de transcrição como API estável. Falha de parser fica visível.
- [ ] Testar `codex.test.ts` com sequência suportada, interrupção, reenvio, subagente e mudança de schema; configuração existente preservada. Rodar teste unitário desse path.
- [ ] Fazer smoke com CLI e aplicativo local quando ambos existirem; registrar cobertura e limitações separadas, sem marcar superfície não testada como ativa; commit.

**Aceite:** sessões suportadas do Codex entram nos mesmos projetos e métricas sem duplicar a atividade do pai.

### T13 — Integração local do OpenCode

**Arquivos:** criar `src/collectors/opencode.ts`, `src/collectors/plugins/worklog-opencode.ts`, `tests/collectors/opencode.test.ts`, `tests/fixtures/opencode/`.

**Interfaces:** produzir `normalizeOpenCode(source:SourceRegistration,raw:unknown): EventInput[]`; plugin encaminha payload filtrado à fila local e não depende de UI aberta.

- [ ] Detectar versão/geração do OpenCode e registrar contrato efetivamente suportado; não misturar documentação de gerações diferentes.
- [ ] Mapear criação/status/idle da sessão, mensagens e execução de ferramentas disponíveis. Instalar plugin preservando configuração e plugins existentes.
- [ ] Tratar emissões repetidas, partes de mensagem atualizadas e indisponibilidade do coletor sem prejudicar o OpenCode.
- [ ] Testar `opencode.test.ts`: sequência real anonimizada, parte atualizada sem turno novo, idle, erro, reenvio e config existente. Rodar teste unitário desse path.
- [ ] Smoke local em projeto de teste, remoção limpa do plugin e commit.

**Aceite:** OpenCode aparece no histórico compartilhado com sessão, ferramenta e origem corretas.

### T14 — Fontes, perfis e múltiplas contas

**Arquivos:** ampliar `src/collectors/source-config.ts`; criar `src/web/pages/Integrations.tsx`, `tests/integration/sources.test.ts`.

**Interfaces:** produzir `registerSource(ctx,source:SourceRegistration): string` e `getSourceDiagnostics(ctx): Diagnostic[]`; nenhuma credencial bruta faz parte de `SourceRegistration` enviado ao navegador.

- [ ] Registrar fontes por máquina/ferramenta/perfil/caminho/versão e status detectado; suportar múltiplos diretórios de configuração do Claude Code.
- [ ] Mostrar origem, última atividade, compatibilidade, atraso e erro recuperável. Não mostrar conectado por apenas existir um diretório.
- [ ] Permitir habilitar/pausar uma fonte sem apagar histórico; remover só os hooks/plugins Worklog daquela instalação.
- [ ] Testar `sources.test.ts`: duas contas com sessão nativa igual, fonte removida, versão não suportada, credencial omitida da resposta e pausa. Rodar teste de integração desse path.
- [ ] Conferir UI de integrações com fontes reais disponíveis e commit.

**Aceite:** trabalho de contas diferentes pode ser filtrado e consolidado sem confundir sessões ou expor tokens.

### T15 — Importação do histórico disponível

**Arquivos:** criar `src/collectors/history.ts`, `tests/collectors/history.test.ts`; ampliar `src/cli/index.ts`.

**Interfaces:** produzir `importHistory(ctx,sourceId:string,range:{from:string;to:string}): Promise<{imported:number;skipped:number;warnings:string[]}>` com checkpoints e parser versionado.

- [ ] Importar registros disponíveis de cada fonte suportada e Git, sem exigir existência de histórico em todas as instalações.
- [ ] Identificar importado/observado/estimado e completude. Não reconstruir foco ou revisões pré-commit inexistentes a partir de mensagens/commits.
- [ ] Impedir duplicação com coleta ao vivo, inclusive no limite do checkpoint; permitir cancelar e retomar a importação.
- [ ] Testar `history.test.ts`: arquivo truncado, schema antigo/desconhecido, live+import sobreposto, cancelamento e eventos sem timestamps válidos. Rodar teste unitário desse path.
- [ ] Executar importação limitada no piloto e comparar contagens com a origem; commit.

**Aceite M3:** três ferramentas suportadas e histórico disponível reunidos, com incerteza histórica visível.

## M4 — Trabalho remoto

### T16 — Coletor e sincronização SSH no Mac mini

**Arquivos:** criar `src/remote/protocol.ts`, `src/remote/ssh.ts`, `tests/remote/sync.test.ts`; ampliar CLI e diagnóstico.

**Interfaces:** produzir `exportBatch(ctx,cursor:Cursor,limit:number): EventBatch` e `syncHost(ctx,hostAlias:string): Promise<AppendResult>`; consumir `importBatch`, protocolo e identidade por instalação. CLI `worklog-agent export --after <seq> --limit 500`.

- [ ] Empacotar o coletor sem UI para o sistema remoto validado; configurar executáveis absolutos quando PATH não interativo não os resolver. Reaproveitar política, registro de roots e adapter Claude.
- [ ] Buscar lotes via SSH existente, sem abrir porta externa nem copiar SQLite ativo. Validar JSON/schema/origem e manter stderr fora do fluxo de eventos.
- [ ] Fazer cursor avançar somente após persistir. Repetir lotes em falha; suportar mudança de instalação, reconexão, backoff 15 s→5 min e backlog acima de 500 eventos.
- [ ] Sinalizar atraso e relógio divergente acima de 60 s; não usar eventos remotos imprecisos para atribuir dedicação humana entre máquinas.
- [ ] Testar `sync.test.ts`: desconectar após gravar antes do ACK, lote repetido, instalação nova, resposta truncada, stderr de login e clock skew. Rodar teste unitário desse path.
- [ ] Smoke real: mesma identidade de projeto em paths diferentes, agente remoto ativo junto de atividade local; fechar SSH, produzir eventos e comprovar recuperação sem horas humanas duplicadas. Commit.

**Aceite:** trabalho remoto aparece no projeto certo, preservando máquina de origem e integridade na reconexão.

### T17 — Execução contínua nas duas máquinas

**Arquivos:** criar `src/cli/service.ts`, `scripts/service-macos.plist`, `scripts/service-linux.service`, `tests/integration/service.test.ts`, `docs/OPERACAO.md`.

**Interfaces:** produzir `manageService(action:'install'|'start'|'stop'|'status'|'remove',target:'local'|'remote'): Promise<Diagnostic>` e comandos CLI correspondentes.

- [ ] Configurar serviço de usuário macOS via launchd e remoto conforme OS validado; para Linux, verificar se systemd de usuário/linger está disponível antes de escolher esse caminho.
- [ ] Garantir continuidade após fechar terminal/SSH e descrever limitações de logout, reboot e sessão do usuário. tmux sozinho não é garantia de serviço permanente.
- [ ] Preservar configuração existente, logs rotativos sem payload secreto, reinício com backoff e encerramento que confirme eventos pendentes.
- [ ] Testar instalação/remoção em diretório temporário e recuperação após kill em `service.test.ts`; smoke real de reinício sem duplicação. Rodar teste de integração desse path.
- [ ] Documentar diagnóstico, parar, atualizar e desinstalar apenas Worklog; commit.

**Aceite M4:** coleta independe de painel/terminal aberto, com status correto em ambas as máquinas.

## M5 — Histórico completo

### T18 — PRs, revisões e verificações

**Arquivos:** criar `src/providers/github.ts`, `db/migrations/008_prs.sql`, `tests/providers/github.test.ts`; alterar o adapter se T01 identificou outro provedor principal.

**Interfaces:** produzir `syncPullRequests(ctx,repositoryId:string): Promise<{updated:number;stale:boolean}>`; persistir `PullRequestSnapshot` por provedor+repo+número e vínculos com SHAs.

- [ ] Usar acesso de leitura ao provedor real do piloto. Listar PRs com paginação, rascunho, branches, autor, URL, datas e estado; enriquecer revisões e checks quando permitidos.
- [ ] Distinguir fechado sem merge de mesclado e checks ausentes de checks aprovados. Relacionar commits da head sem assumir que todo commit local tem PR.
- [ ] Sincronizar inicialmente a cada 5 min; ETag/cache quando disponível, backoff e respeito a rate limit. Offline/401/403 mantêm cache marcado como desatualizado.
- [ ] Testar `github.test.ts`: mais de uma página, draft, merge, closed sem merge, 304, 401/403, rate limit e revisão/check sem permissão. Rodar teste unitário desse path.
- [ ] Conferir PR real com links corretos, sem qualquer escrita no provedor, e commit.

**Aceite:** PRs abertos e seu estado aparecem no projeto; falhas do provedor não são exibidas como aprovação.

### T19 — Resumos de trabalho com evidências

**Arquivos:** criar `src/core/summaries.ts`, `db/migrations/009_summaries.sql`, `tests/core/summaries.test.ts`.

**Interfaces:** produzir `buildWorkSummary(ctx,filter:ReportFilter): {text:string;evidenceIds:string[];ruleVersion:string}` a partir de sessões, revisões, commits e PRs.

- [ ] Gerar resumo determinístico em português: pedido disponível, ações observadas, arquivos, verificações registradas e pendências explícitas. Não fabricar causa, sucesso de teste ou conclusão por existir um commit.
- [ ] Guardar IDs de evidências e versão da regra. Separar solicitado, realizado e verificado; dado ausente permanece ausente.
- [ ] Deixar preparado ponto de extensão para síntese futura sem dependência de API ou envio de conteúdo na primeira versão.
- [ ] Testar `summaries.test.ts`: teste falho, ferramenta interrompida, PR não mesclado, histórico incompleto e ausência de transcrição. Conferir que cada alegação verificável aponta para evidência. Rodar teste unitário desse path.
- [ ] Revisar resumo com um projeto do piloto e commit.

**Aceite:** o resumo explica trabalho com rastreabilidade e sem afirmar resultado que a fonte não comprovou.

### T20 — Painel completo e navegação das evidências

**Arquivos:** criar/ampliar `src/web/pages/ProjectDetail.tsx`, `Exports.tsx`, `Integrations.tsx`, `Overview.tsx`, `Projects.tsx`, `Activity.tsx`, `src/server/routes.ts`, `tests/e2e/project-history.spec.ts`.

**Interfaces:** consumir contratos e endpoints de commits/arquivos/PRs/fontes; todos os filtros compartilham `ReportFilter`. Preparar página de exportação para T21 sem simular download real.

- [ ] Acrescentar filtros por máquina, ferramenta e perfil, lista sem projeto, seleção múltipla e contexto por projeto/cliente.
- [ ] Construir detalhe com sessões, resumo, arquivos e versões/diffs, commits e PRs; navegar nos vínculos com confiança e gaps visíveis.
- [ ] Mostrar fonte offline, sincronização atrasada, origem histórica/estimada e conteúdo indisponível por política ou retenção.
- [ ] Em `project-history.spec.ts`, percorrer projeto→sessão→arquivo→commit→PR, alternar máquina/ferramenta e tratar vazio/erro. Rodar E2E desse path e `npm run build`.
- [ ] Inspecionar desktop/mobile em uma rodada, teclado e contraste; manter visual grafite aprovado, sem instalar imagem/decoração desnecessária. Commit.

**Aceite M5:** histórico completo consultável por projeto e origem, com interface coerente com a prévia.

## M6 — Exportação e uso cotidiano

### T21 — Exportação por projetos e período

**Arquivos:** criar `src/reports/query.ts`, `csv.ts`, `pdf.ts`, `tests/reports/exports.test.ts`, `tests/e2e/exports.spec.ts`; ampliar `Exports.tsx`.

**Interfaces:** produzir `queryReport(ctx,filter:ReportFilter,options:ReportOptions): ReportData`, `renderCsv(data:ReportData): Uint8Array` e `renderPdf(data:ReportData): Promise<Uint8Array>`. `ReportOptions` contém sessões, notas, arquivos, commits, PRs e diff completo opcional. `projectIds=[]` é seleção inválida para exportar, nunca equivale a todos.

- [ ] Reutilizar a consulta/semântica dos filtros; selecionar vários projetos, período, máquina e ferramenta. Prévia do relatório usa o mesmo `ReportData` do arquivo.
- [ ] Gerar CSV UTF-8 com BOM, acentos, separação consistente, aspas/quebras de linha e neutralização de fórmula inclusive após espaços iniciais.
- [ ] Gerar PDF com título, período/fuso, tempos com qualidade indicada, seções selecionadas, links e paginação. Diffs completos são opcionais e continuam sujeitos à política.
- [ ] Testar `exports.test.ts`: apenas dois de quatro projetos, intervalos na virada do dia/fuso, seleção vazia, nota começando com fórmula, múltiplas máquinas, dado excluído e CSV reimportável. Rodar teste unitário desse path.
- [ ] Em `exports.spec.ts`, baixar arquivo e conferir conteúdo; renderizar o PDF e abrir as páginas, incluindo relatório longo. Rodar E2E desse path, conferir totals contra a UI e commit.

**Aceite:** nenhum registro fora da seleção/período aparece; PDF e CSV preservam as distinções de tempo.

### T22 — Notas e ajustes auditáveis de tempo

**Arquivos:** criar `src/core/adjustments.ts`, `db/migrations/010_adjustments.sql`, `tests/core/adjustments.test.ts`; ampliar detalhe e relatórios.

**Interfaces:** produzir `applyAdjustment(ctx,input:Adjustment): string` e `saveNote(ctx,targetId:string,text:string): string`; `Adjustment` inclui intervalo, projeto, valor anterior/novo, motivo e data. Reutilizar `deriveTime` e `queryReport`.

- [ ] Permitir notas, classificação e correção explícita de dedicação, incluindo atribuir trecho anteriormente indefinido.
- [ ] Manter antes/depois e motivo; desfazer por ajuste compensatório, sem editar evento bruto. Ajuste não pode gerar tempo humano global sobreposto sem mostrar conflito.
- [ ] Atualizar painel/relatório com dedicação estimada e ajustada identificadas. Não tratar automaticamente como cobrança/faturamento.
- [ ] Testar `adjustments.test.ts`: atribuição entre projetos, overlap inválido, desfazer, edição concorrente e exportação antes/depois; totais globais reconciliados. Rodar teste unitário desse path.
- [ ] Verificar edição por teclado, notas preservadas e versão do relatório; commit.

**Aceite:** usuário corrige a estimativa com rastreabilidade, sem perder o registro original.

### T23 — Configurações, retenção e recuperação

**Arquivos:** criar `src/core/maintenance.ts`, `tests/integration/recovery.test.ts`; ampliar `Integrations.tsx`, CLI e `docs/OPERACAO.md`.

**Interfaces:** produzir `backupData(ctx,destination:string): Promise<Diagnostic>`, `restoreData(options:{backup:string;dataDir:string}): Promise<Diagnostic>` com serviço parado, e `runRetention(ctx,now:string): Diagnostic`. Persistir os defaults de captura, tempo e sincronização.

- [ ] Expor pause por fonte/projeto, roots e exclusões, janela de inatividade, retenção, frequência de sincronização e status de capacidade.
- [ ] Aplicar retenção de 30 dias às revisões intermediárias; manter metadados necessários e informar perda de diff. Nunca purgar eventos ainda não sincronizados silenciosamente.
- [ ] Usar backup consistente do SQLite e conteúdo de revisões referenciadas; testar restauração isolada. Tratar disco cheio, permissão negada, lock e serviço interrompido com erro acionável.
- [ ] Medir crescimento/custo em piloto e definir orçamento documentado de armazenamento, alertas e comportamento no limite; não inventar número de performance sem medir.
- [ ] Testar `recovery.test.ts`: retenção no corte exato, disco/permite simulado, restart no meio de lote e backup→restore com contagens/totais iguais. Rodar teste de integração desse path.
- [ ] Documentar procedimentos de exportar, atualizar, diagnosticar e remover a instalação; commit.

**Aceite:** uso contínuo recuperável, sem crescimento silencioso ou apagamento inesperado de dados não sincronizados.

### T24 — Piloto completo e entrega do primeiro produto

**Arquivos:** criar `tests/e2e/full-flow.spec.ts`, `docs/PILOTO.md`, `docs/ENTREGA.md`; atualizar README com execução real.

**Interfaces:** consumir CLI, adapters, UI e contratos entregues; produzir registro de validação com versões, cenários, contagens e limitações reais.

- [ ] Escolher dois projetos e executar um dia de piloto com Claude/Codex/OpenCode locais, Claude remoto confirmado, Git, arquivo ainda sem commit e PR existente de leitura.
- [ ] Exercitar agentes simultâneos, trabalho humano em outro projeto, pausa/bloqueio, terminal fechado, SSH offline e reconexão com backlog; registrar amostra de tempo observada para avaliar a estimativa.
- [ ] Validar arquivo editado→revisão→sessão→commit→PR e associação ambígua com rótulo correto. Validar importação histórica sem inventar horas ou revisões ausentes.
- [ ] Testar exportação de só um dos projetos, por período e máquina, antes/depois de ajuste; comparar contagens/totais com o painel e abrir o PDF final.
- [ ] Rodar `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e -- tests/e2e/full-flow.spec.ts` e `npm run build`; registrar resultados e limitações. Se uma integração obrigatória não funcionar, manter o marco incompleto e descrever o bloqueio.
- [ ] Publicar apenas a documentação local de entrega e versionar as mudanças revisadas. Não fazer deploy externo nem escrever em PRs como parte do monitoramento.

**Aceite M6:** o usuário consegue acompanhar trabalho real nas duas máquinas, consultar evidências e exportar uma seleção correta, com fontes e limitações visíveis.

## Fora do backlog inicial

XLSX nativo, síntese opcional por LLM, painel em nuvem, equipes e faturamento poderão ganhar tarefas após o piloto. Não são dependências para começar M1 e não devem surgir como infraestrutura antecipada.

## Registro de revisão do plano

- Cobertura: requisitos locais, SSH/Mac mini, três ferramentas, perfis, tempos, Git, PRs, arquivos, notas e exportação mapeados nas tarefas acima.
- Contratos: eventos e filtros definidos em `ARQUITETURA.md`; T02 completa tipos compartilhados antes dos adapters.
- Dependências: índice sem ciclos; M1 chega a uma entrega utilizável antes das integrações remotas.
- Revisão de risco: os cinco casos em Review Focus têm tarefas e validações explícitas.
- Estado: nenhum item executado; stack e defaults identificados como proposta técnica.
