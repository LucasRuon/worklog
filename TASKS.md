# Worklog — Implementation Plan

> **Execução iniciada em 05/11/2026:** sequencial por tarefa com `implement-plan`, testes e atualização de evidências. Checkboxes (`- [ ]`) registram progresso; uma tarefa só fica concluída com seu aceite completo.

**Goal:** entregar um painel local que reúna trabalho, tempo, arquivos, commits e PRs por projeto, incluindo agentes locais e no Mac mini.

**Architecture:** um coletor por máquina grava eventos duráveis; o Mac principal recebe os eventos locais e busca lotes remotos por SSH. SQLite preserva origens e alimenta projeções de sessões, tempo e evidências. Uma API local serve o painel e os relatórios.

**Tech Stack:** base fixada em T01: Node.js 24 LTS, TypeScript, SQLite com `node:sqlite` isolado, React/Vite, `node:test` e Playwright. GitHub confirmado para o projeto Worklog do piloto. Não introduzir API de IA para o primeiro marco.

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

Cada tarefa termina com uma entrega verificável. Os paths são criados conforme a implementação avança; a base e T02–T08 já existem. Os testes indicados são casos necessários para regras de domínio ou integrações, não testes de estilos estáticos.

Antes de mudar comportamento: criar o teste listado, executá-lo e confirmar que falha pelo comportamento ausente; implementar o mínimo e repetir. Depois dos critérios satisfeitos, registrar evidência. **Commits, publicação e push somente após solicitação explícita.** As referências a commit nas tarefas indicam o agrupamento pretendido; nenhuma alteração foi commitada automaticamente nesta execução.

T01 disponibilizou os comandos `npm run typecheck`, `npm run test:unit -- <caminho>`, `npm run test:integration -- <caminho>`, `npm run test:e2e -- <caminho>`, `npm run build` e `npm run dev`. Os comandos aceitam o caminho passado depois de `--`.

## Índice do backlog

**Atualização vigente em 09/11/2026:** T14 conferida para fontes/perfis atualmente registrados; T18 comprovada com PR real #1, consultado e sincronizado no store pessoal. T24 iniciada às **2026-11-09T02:03Z**, com baseline de fontes, serviços e armazenamento em `.checks/piloto-t14-t24-2026-11-09.md`; janela mínima termina em **2026-11-10T02:03Z**. **T24 permanece em andamento** até completar um dia de uso e cenários reais. T12/T15 e gates técnicos anteriores permanecem conforme evidências abaixo. Alterações desta atualização ainda não foram commitadas nem publicadas.

**Registro histórico de 08/11:** T20 retomada e implementada; verificação independente de T14/T15/T18–T23 **PASS, 33/33 checks** no perfil light. Gates: **46 unitários, 25 integração e 28 E2E**, typecheck/build verdes; full-flow controlado desktop/mobile executado. Relatório: `.checks/continuacao.verified.md`. Guias: [FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md), [PRS-RESUMOS.md](docs/PRS-RESUMOS.md), [RELATORIOS-AJUSTES-RECUPERACAO.md](docs/RELATORIOS-AJUSTES-RECUPERACAO.md). Estados atuais estão resumidos acima; os registros cronológicos seguintes preservam o contexto de cada rodada.

**Continuação T15:** log durável OpenCode v2 (`opencode-log-v1`) implementado, **7/7 checks independentes**; gates daquela extensão **50/26/28 testes**. Fonte real v2 consultada sem eventos recuperáveis: `HISTORY_UNAVAILABLE`, sem alegar piloto positivo. Runtime instalado observado em **2.2.6**; suporte live entregue na revisão T13 abaixo, sem atualização da instrumentação pessoal.

**Revisão mais recente T13:** suporte live **2.2.6** implementado, preservando 2.2.5; plugin → CLI → fila, instalação/remoção, diagnóstico/API e badge local corrigidos. Smoke nativo temporário: **2 sessões / 2 eventos**, segunda sessão recebida pelo stream, origem/projeto corretos, replay zero, zero modelos/sinais humanos/revisões. Gates **54/28/30** e typecheck/build aprovados; **verificação independente PASS, 7/7 checks**, perfil light, em `.checks/t13-opencode-226.verified.md`. Instrumentação pessoal não foi atualizada; turnos/ferramentas 2.2.6 permanecem cobertos por contratos controlados, não por chamada de modelo. Checklist `.checks/t13-opencode-226.md`.

**Continuação T15 Codex:** parser `codex-rollout-0.167.0` implementado para lifecycle de turnos raiz, horários explícitos, período/contexto e IDs compartilhados com hooks; recibos individuais preservam a primeira captura, inclusive offline e entre processos. Recibos antigos e backup/restore preservados. Resultado parcial obrigatório (`HISTORY_LIFECYCLE_ONLY`), sem ferramentas/linhagens herdadas ou leitura pessoal. Gates atuais **92/30/30**, typecheck/build verdes; **verificação independente PASS, 9/9 checks**, perfil light, relatório `.checks/t15-codex-rollout.verified.md`. T15 e aceites pessoais continuam abertos.

**Extensão T15 Codex v2:** parser opt-in `codex-rollout-v2-0.167.0` acrescenta ferramentas Bash/apply_patch completed e filhos diretos com borda ordinal explícita; v1 inalterado. Gates atuais **122/31/30**, typecheck/build verdes; checklist `.checks/t15-codex-items.md`, **verificação independente PASS, 8/8**, perfil light, em `.checks/t15-codex-items.verified.md`. Resultado ainda parcial, sem leitura pessoal nem encerramento T15.

T06–T08 foram inicialmente verificadas com fixtures e depois demonstradas com eventos reais desta sessão OpenCode: coleta, fila, sessões, tempos e painel desktop/mobile. O usuário definiu que o M1 não deve depender de conta Claude. O aceite técnico usa essa fonte, mantendo a pendência de T05 explícita. P0 = primeiro marco; P1 = escopo principal; P2 = fechamento operacional.

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

**Aceite atualizado em 06/11/2026:** usar esta sessão OpenCode e o projeto Worklog como piloto local, antecipando o observador nativo de T13. Sem dependência de `claude-conta-b`. A validação especializada do Claude fica registrada em T05.

### T01 — Base executável e inventário de compatibilidade

**Arquivos:** criar `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.env.example`, `src/server/index.ts`, `src/server/auth.ts`, `src/cli/index.ts`, `src/cli/doctor.ts`, `src/core/sqlite.ts`, `src/web/main.tsx`, `tests/integration/bootstrap.test.ts`, `docs/AMBIENTE.md`.

**Interfaces:** produzir `createApp(options: {dataDir:string;port:number}): Promise<AppContext>` e `closeApp(ctx:AppContext): Promise<void>`; `AppContext` contém a conexão encapsulada, configuração e shutdown. Produzir os comandos npm definidos acima.

- [x] Inventariar versões, superfícies CLI/app, perfis e roots locais das três ferramentas sem copiar segredos. Revalidar `macmini`, OS, runtime, PATH e fontes. Evidências em `docs/AMBIENTE.md`.
- [x] Registrar remote/provedor do primeiro projeto escolhido para o piloto nesta sessão: Worklog, `github.com/LucasRuon/worklog`. Outros projetos serão escolhidos posteriormente.
- [x] Fixar Node 24 e bibliotecas compatíveis com lockfile; validar SQLite em memória no Mac e registrar necessidade de runtime remoto em `AMBIENTE.md`. Isolar a API RC do driver e não usar versão da documentação como versão instalada.
- [x] Criar base mínima API/CLI/UI, migrações por arquivo e diretório de dados fora dos repositórios monitorados. Aplicar bind local, Host/Origin e bootstrap autenticado; definir o armazenamento local do token sem colocar segredo em bundle/log.
- [x] Verificar `bootstrap.test.ts`: iniciar em diretório temporário e porta livre, responder health, recusar mutação sem token e Origin externo; fechar sem deixar processo/porta abertos. Rodar `npm run test:integration -- tests/integration/bootstrap.test.ts` e `npm run build`.
- [x] Documentar execução local e comprovar inicialização/encerramento em outra execução limpa, com processo separado e dados temporários. Git já estava inicializado.

**Progresso:** base verificada em processo separado e E2E desktop/mobile; primeiro projeto e provedor confirmados. Nenhum hook foi instalado nos perfis pessoais. O observador OpenCode do M1 não altera configurações ou credenciais da ferramenta.

**Aceite:** projeto inicia em loopback, instala de modo reproduzível e há inventário suficiente para desenvolver o primeiro adapter; nenhum hook do usuário é alterado nesta tarefa.

### T02 — Eventos, SQLite e idempotência

**Arquivos:** criar `src/core/contracts.ts`, `src/core/events.ts`, `db/migrations/001_events.sql`, `tests/core/events.test.ts`; ampliar `src/core/sqlite.ts`.

**Interfaces:** consumir `AppContext`. Produzir tipos do catálogo de `ARQUITETURA.md`, `appendEvent(ctx,input:EventInput): AppendResult`, `importBatch(ctx,batch:EventBatch): AppendResult`, `readBatch(ctx,cursor:Cursor,limit:number): EventBatch`. `EventInput` é o evento normalizado antes da atribuição de sequência/recebimento; preserva `eventId` estável em retries. `AppendResult` informa inseridos/duplicados e cursor confirmado.

- [x] Definir schemas de eventos v1 e tipos compartilhados; definir payloads permitidos por discriminante e limites. Definir `TimeSummary` com `humanEstimatedMs`, `humanAdjustedMs`, `unassignedHumanMs`, `agentAccumulatedMs`, `agentWallMs`, `sessionSpanMs`, sem campo ambíguo `totalHours`.
- [x] Criar tabelas iniciais de máquinas, instalações, fontes, eventos e cursores; migrações transacionais e sequência persistente por instalação.
- [x] Implementar append e importação com unicidade por ID e instalação+sequência. Gravar cursor e eventos na mesma transação; validar versão e identidade antes de confirmar.
- [x] Testar `events.test.ts`: importar o mesmo lote duas vezes mantém contagem; falhar no meio reverte todo o lote/cursor; reiniciar mantém sequência; instalação nova não colide; evento inválido não avança cursor. Rodar `npm run test:unit -- tests/core/events.test.ts`.
- [x] Reabrir o banco temporário após o teste de persistência e registrar as verificações em `docs/PROGRESSO.md`.

**Aceite:** perda/repetição de transporte não duplica ou descarta eventos válidos.

### T03 — Projetos, repositórios e raízes

**Arquivos:** criar `src/core/projects.ts`, `db/migrations/002_projects.sql`, `tests/core/projects.test.ts`.

**Interfaces:** consumir `AppContext` e `ProjectRoot`; produzir `registerProjectRoot(ctx,root:ProjectRoot): string` e `resolveProject(ctx,deviceId:string,cwd:string): ProjectMatch`. `ProjectMatch` contém projeto/repositório/worktree e motivo ou estado não atribuído.

- [x] Cadastrar nome, cliente opcional, raízes autorizadas e repositórios de um projeto; associação de vários repositórios e máquinas.
- [x] Normalizar remote sem credenciais, formas SSH/HTTPS e sufixo `.git`; preservar diferenças reais de host/owner/repositório. Worktree não vira projeto novo.
- [x] Implementar associação explícita e tratar pastas sem Git ou sem correspondência como não atribuídas; não unir projetos pelo basename.
- [x] Testar `projects.test.ts`: clone local/remoto com mesmo remote; worktrees; dois repositórios de mesmo nome; paths com espaços/unicode; roots aninhadas com raiz mais específica; `cwd` externo não capturado. Rodar `npm run test:unit -- tests/core/projects.test.ts`.
- [x] Registrar um projeto de teste temporário sem iniciar captura global; evidência em `docs/PROGRESSO.md`.

**Aceite:** identidade estável e explicável entre máquinas e worktrees, com opção de associação manual.

### T04 — Política de captura e normalização

**Arquivos:** criar `src/core/policy.ts`, `src/collectors/source-config.ts`, `tests/core/policy.test.ts`, `tests/fixtures/events/`.

**Interfaces:** consumir contratos e resolver de projetos; produzir `captureDecision(root:ProjectRoot,path:string,config:PolicyConfig): CaptureDecision` e `normalizeEvent(source:SourceRegistration,raw:unknown): EventInput[]`. `CaptureDecision` informa metadados/conteúdo permitidos e motivo da exclusão.

- [x] Definir política inicial de roots, ignores Git, `.env*`, chaves, dependências/builds, binários e tamanho; paths resolvidos sem escapar por symlink.
- [x] Validar/filtrar cada payload antes de persistir. Metadados mínimos por padrão; transcrição e stdout completos não são atalhos de diagnóstico.
- [x] Gerar IDs estáveis a partir da identidade nativa/posição de origem; não colapsar duas ações distintas com mesmo timestamp.
- [x] Testar `policy.test.ts`: arquivo secreto, `.env.example` sem exceção explícita, symlink externo, path traversal, payload inválido/grande, comando com credencial e duas ações distintas simultâneas. Rodar `npm run test:unit -- tests/core/policy.test.ts`.
- [x] Preservar fixtures sintéticas de contrato sem dados privados e registrar como adicionar exceções seguras em `docs/PROGRESSO.md`.

**Aceite:** conteúdo negado não aparece no banco, no log de erro ou no relatório.

### T05 — Coletor local do Claude Code

**Arquivos:** criar `src/collectors/claude.ts`, `src/cli/hooks.ts`, `tests/collectors/claude.test.ts`, `tests/fixtures/claude/`.

**Interfaces:** consumir `normalizeEvent`, `appendEvent` e configuração de fontes; produzir `normalizeClaude(source:SourceRegistration,raw:unknown): EventInput[]` e `configureClaudeHooks(configPath:string,operation:'install'|'remove'): Promise<void>`. Registrar contrato de hook/input da versão testada.

- [x] Mapear início/fim de sessão, prompt, início/fim de turno e ferramentas pelo contrato de hooks da versão alvo 2.1.318. Interrupções e eventos indisponíveis têm representação explícita.
- [x] Implementar merge preservando hooks existentes, backup e remoção só dos itens Worklog. Fila local durável testada em configuração temporária, inclusive com a UI e o banco fechados; entrypoint silencioso e fail-open.
- [x] Tratar múltiplos caminhos de configuração como fontes distintas. Não sobrescrever stdout do hook com logs e não inserir prompts adicionais na conversa.
- [x] Testar `claude.test.ts`: contrato sintético, config pré-existente, instalação repetida, fonte com espaço no path, interrupção e banco fechado. Rodar `npm run test:unit -- tests/collectors/claude.test.ts`.
- [ ] Completar a fixture com uma sequência real normalizada e validar o disparo nativo. **Bloqueio:** perfil padrão sem login e contas B/C com login expirado sem renovação automática.
- [ ] Executar uma sessão curta autenticada em repositório de teste e comprovar origem, projeto e eventos. Smoke reproduzível em `scripts/smoke-claude.ts`; tentativas atuais encerraram antes dos hooks, sem eventos.
- [x] Validação nativa adicional no macmini com Claude 2.1.319: sessão curta real, cinco eventos e origem/projeto preservados. Os 21 hooks existentes foram preservados. A pendência acima descreve os perfis locais do ensaio anterior e não bloqueia a automação remota.

**Decisão:** `UserPromptSubmit` também ocorre em automações. O adapter não o transforma em dedicação humana. Sinal explícito e regra de estimativa estão documentados em `docs/PROGRESSO.md`.

**Aceite:** uma sessão nova aparece na fila sem alterar o comportamento de desenvolvimento do usuário.

### T06 — Reconstrução de sessões

**Arquivos:** criar `src/core/sessions.ts`, `db/migrations/003_sessions.sql`, `tests/core/sessions.test.ts`.

**Interfaces:** consumir eventos ordenados por sequência da instalação; produzir `projectSessions(ctx,events:WorkEvent[]): void` e `listSessions(ctx,filter:ReportFilter): Session[]`. Sessão interna usa fonte+ID nativo+agente; pai de subagente é relação separada.

- [x] Modelar estados em execução, aguardando usuário, interrompido, encerrado e incompleto. Reabertura/compactação não cria duração humana automaticamente.
- [x] Reconciliar eventos atrasados e pares ausentes; não manter turno aberto indefinidamente após queda sem sinalizar incompletude.
- [x] Preservar vínculos de subagentes e turnos sem mesclar a atividade deles ao tempo humano do pai.
- [x] Testar `sessions.test.ts`: retomada, compactação, final ausente, eventos fora de ordem, duas contas com mesmo ID nativo e subagentes paralelos. Rodar `npm run test:unit -- tests/core/sessions.test.ts`.
- [x] Reconstruir a projeção do zero e comparar com a projeção incremental; verificações em `docs/PROGRESSO.md`.

**Aceite:** sessões são reprocessáveis sem duplicação e sem duração fictícia após falha.

### T07 — Dedicação, execução e sobreposições

**Arquivos:** criar `src/core/time.ts`, `src/collectors/focus.ts`, `db/migrations/004_intervals.sql`, `tests/core/time.test.ts`.

**Interfaces:** produzir `unionDuration(intervals:Interval[]): number`, `deriveTime(ctx,filter:ReportFilter): TimeSummary` e `recordFocus(ctx,event:EventInput): void`. Consumir sessões e eventos de interação/foco; tempos em milissegundos.

- [x] Separar execução acumulada de agentes, união de execução de relógio, duração de sessão e dedicação humana. Explicar janela inicial de 5 min e permitir trechos não atribuídos.
- [x] Implementar foco/ociosidade apenas com sinais mínimos disponíveis; Terminal não identifica aba/SSH. Atribuição explícita de projeto no painel e incerteza preservada.
- [x] Encerrar dedicação em sinais de bloqueio/pausa e lacunas de observação, sem atribuir foco local à execução remota. Usar UTC para cálculo e fuso para corte de relatórios.
- [x] Testar `time.test.ts`: união de 90 min e execução acumulada de 120 min, ambiguidade global entre máquinas, ociosidade, suspensão, corte de período e evento atrasado. `dates.test.ts` cobre virada do dia e DST.
- [x] Rodar teste unitário e documentar regra em `docs/PROGRESSO.md` e `docs/PRIMEIRO-USO.md`.

**Limite observado:** probe macOS disponível; bloqueio e suspensão físicos ainda não exercitados. Sinais de foco não confiáveis não geram dedicação automática.

**Aceite:** é impossível obter duas horas de dedicação global a partir de uma hora de relógio com agentes paralelos.

### T08 — Primeiro painel com dados reais

**Arquivos:** criar `src/server/routes.ts`, `src/web/api.ts`, `src/web/styles.css`, `src/web/pages/Overview.tsx`, `Projects.tsx`, `Activity.tsx`, `tests/integration/api-local.test.ts`, `tests/e2e/first-use.spec.ts`.

**Interfaces:** expor `/api/health`, `/api/projects`, `/api/sessions`, `/api/activity`, `/api/summary`; consumir `ReportFilter`, `Session`, `TimeSummary`. Consultas sem seleção explícita expandem projetos registrados no servidor; exportação futura exigirá seleção não vazia.

- [x] Traduzir a direção do mockup para componentes reutilizáveis, mantendo grafite/neutros, tabelas e hierarquia. Não portar seus arrays ilustrativos.
- [x] Implementar listagem e associação de projeto, visão geral e atividade com paginação de até 100 registros, filtros de período e estados vazios/erro/carregamento.
- [x] Mostrar unidade e natureza de cada tempo; fonte ainda sem dados aparece como tal, não conectada por suposição.
- [x] Testar API com dois projetos e cortes de período; em `first-use.spec.ts`, cadastrar raiz de teste, receber eventos sintéticos pelo hook CLI compilado offline e abrir a sessão correspondente. Rodar integração/E2E para esses paths.
- [x] Verificar desktop e mobile, teclado, detalhes e ausência de dados ilustrativos na base de uso; capturas inspecionadas e evidências em `docs/PROGRESSO.md`.
- [x] Demonstrar o M1 com dados da sessão nativa OpenCode escolhida pelo usuário. Smoke real, API, detalhe e fonte verificados no navegador desktop/mobile; evidências em `docs/M1.md`. Conferência visual final disponível ao usuário no painel.

**Aceite M1:** o usuário trabalha no OpenCode local desta sessão e consulta projeto, sessão, execução observada e dedicação explicitamente sinalizada no painel real. A fonte Claude permanece prevista e validada separadamente na T05.

## M2 — Evidências do trabalho

### T09 — Histórico de commits Git

**Arquivos:** implementados `src/collectors/git.ts`, `db/migrations/006_git.sql`, `src/remote/git.ts`, `src/web/pages/Commits.tsx` e testes de coleta, transporte e API. O número 005 já estava ocupado pela migração de automação.

**Interfaces:** produzir `scanCommits(ctx,root:ProjectRoot): Promise<{inserted:number;cursor:string}>`; usar subprocessos com argv, formatos NUL e identidade repositório+SHA. Consumir política e registro de projetos.

- [x] Importar hashes, parents, autoria, datas de autor/committer, mensagem, refs observadas e arquivos por commit; não inferir a branch histórica original só pela branch atual.
- [x] Registrar commit uma vez entre clones/máquinas. Ler Git sem hooks que façam commits, checkout ou alterações no repositório do usuário.
- [x] Suportar merge, rebase/force-push e commit recém-descoberto; reter evidência histórica sem afirmar que commit removido ainda está numa branch atual.
- [x] Testar `git.test.ts` com repositórios temporários: dois clones, worktree, merge, rebase, rename e paths com espaços/unicode/quebras de linha. Rodar `npm run test:unit -- tests/collectors/git.test.ts`.
- [x] Registrar a última varredura e possibilidade de reindexar pelo painel. Alterações sem commit, conforme a regra global.

**Verificação:** API paginada e filtros; coleta Git independente de horas; protocolo remoto paginado, replay, origem e rejeição atômica; E2E desktop/mobile. Agente pessoal atualizado em 06/11, com serviço ativo e commits remotos recebidos na central. Evidências e operação em `docs/GIT-EXPORTACAO.md` e `docs/ARQUIVOS.md`.

**Aceite:** commits consultáveis no projeto e sem duplicação; histórico antigo não gera horas automaticamente.

### T10 — Histórico de mudanças nos arquivos

**Arquivos:** implementados `src/collectors/files.ts`, `db/migrations/007_files.sql`, `src/remote/files.ts` e `tests/collectors/files.test.ts`. A migração 006 já pertence ao Git.

**Interfaces:** produzir `watchRoot(ctx,root:ProjectRoot): Promise<() => Promise<void>>` e `reconcileRoot(ctx,root:ProjectRoot): Promise<void>`; gerar eventos `file.change` filtrados.

- [x] Observar criar/editar/excluir/renomear, incluindo arquivos não commitados; debounce de 500 ms e reconciliação de 30 s. Distinguir horário observado de horário real desconhecido.
- [x] Reaplicar política antes de ler conteúdo; arquivos ignorados/fora das roots nunca passam só porque um evento veio do watcher.
- [x] Suportar save por arquivo temporário, substituição atômica, watcher perdido, renomeação entre diretórios e desligamento limpo. Não prometer capturar todas as edições intermediárias.
- [x] Testar `files.test.ts`: save atômico, dois writes no debounce, rename, delete, untracked, symlink externo, `.env`, binário e arquivo acima de 2 MiB; reconciliar após interrupção. Rodar `npm run test:unit -- tests/collectors/files.test.ts`.
- [x] Registrar gaps/limites e coordenação de observadores em `docs/ARQUIVOS.md`. Alterações sem commit, conforme a regra global.

**Aceite:** o histórico inclui mudanças antes do commit, com exclusões e limitações corretas.

### T11 — Revisões, diffs e relações com sessões

**Arquivos:** implementados `src/collectors/revisions.ts`, `src/collectors/relations.ts`, `db/migrations/008_evidence.sql`, `src/web/pages/Files.tsx`, testes de evidência, integração e E2E. A migração 007 contém o observador de arquivos.

**Interfaces:** produzir `storeRevision(ctx,revision:FileRevision): string`, `linkEvidence(ctx,link:EvidenceLink): void` e `getFileHistory(ctx,rootId:string,path:string): FileRevision[]`. Links carregam confiança e motivo.

- [x] Preservar revisões textuais elegíveis por hash e gerar diffs; binários/grandes mostram metadados e motivo da ausência de diff.
- [x] Relacionar sessão/arquivo e commit pela evidência disponível. Os adapters atuais omitem o caminho das ferramentas; chamada Edit não é autoria comprovada. Janela temporal é somente inferência, concorrência permanece ambígua e associação explícita prevalece.
- [x] Exibir criação/exclusão, mudança de nome quando comprovada e conteúdo removido sem perder metadados. A execução automática da retenção permanece T23.
- [x] Testar evidências concorrentes, gravação sem autoria comprovada, renome, deduplicação, conteúdo excluído, relação com commit e precedência explícita. Testes em `evidence.test.ts` e `files.test.ts`.
- [x] Disponibilizar consultas e navegação sessão → revisão → diff → commit, sem conteúdo nas listas. E2E desktop/mobile em `project-history.spec.ts`. Alterações sem commit.

**Aceite M2:** navegar de uma sessão a um arquivo e commit, com grau de confiança visível.

## M3 — Três ferramentas e histórico

### T12 — Integração local do Codex

**Arquivos:** criar `src/collectors/codex.ts`, `tests/collectors/codex.test.ts`, `tests/fixtures/codex/`; ampliar `src/cli/hooks.ts`.

**Interfaces:** produzir `normalizeCodex(source:SourceRegistration,raw:unknown): EventInput[]`; consumir o mesmo contrato dos adapters e registrar capacidade por superfície CLI/app.

- [x] Validar hooks/eventos na versão e superfície instaladas. Codex CLI **0.167.0**, schema público versionado e descoberta nativa de dez hooks; revisão de confiança preservada, sem bypass.
- [x] Mapear sessões/turnos/ferramentas/subagentes; lidar com compartilhamento do ID da sessão pai e IDs próprios de agente.
- [x] Parser de transcrição dispensado: hooks públicos atendem o fluxo ao vivo. Versão/schema desconhecidos são recusados com diagnóstico privado sem payload; importação histórica permanece T15.
- [x] Testar `codex.test.ts` com sequência suportada, interrupção, reenvio, subagente e mudança de schema; configuração existente preservada. Entry point compilado, timeout, quoting e fila com banco fechado em `codex-hook.test.ts`.
- [x] Completar smoke de **captura real** após revisão nativa local autorizada. Dez hashes Worklog `trusted` pela mesma API usada pelo `/hooks`, sem bypass; dois turnos mínimos concluídos (Worklog/Posicionadas), cinco eventos de sessão/turno por projeto, associação correta e zero ferramentas/sinais humanos. **Verificação independente PASS 3/3**, perfil light, em `.checks/codex-native-trust.verified.md`. App desktop não encontrado nos paths inventariados, sem alegar suporte testado. Sem commits.

**Estado T12:** integração CLI 0.167.0 implementada e captura real mínima validada independentemente em ambos os projetos. Dez hooks instalados/confiados somente neste Mac, quatro handlers anteriores preservados com backup. O ensaio inicial sem modelo falhou por ausência de session.start; falha preservada. Depois de autorização expressa, dois turnos mínimos concluíram o ciclo. Ferramentas/subagentes permanecem cobertos por contratos controlados, não por este smoke. Nenhuma instalação em conta remota/nuvem; inferência normal do Codex autenticado não deve ser confundida com modelo local. Contratos em [docs/CODEX.md](docs/CODEX.md).

**Aceite:** sessões suportadas do Codex entram nos mesmos projetos e métricas sem duplicar a atividade do pai.

### T13 — Integração local do OpenCode

**Arquivos:** implementados `src/collectors/opencode.ts`, `opencode-store.ts`, `queue.ts`, `plugins/opencode-projector.ts`, `plugins/worklog-opencode.ts`, `src/core/automation.ts`, `src/cli/automation.ts`, testes de collectors/automação e `scripts/smoke-automation.ts`. Leitor v1 e smoke original preservados como legado.

**Interfaces:** leitor legado 1.19.5 mantido; v2 usa `projectV2Event` antes do IPC, normalização compartilhada e `createWorklogPlugin`. CLI instala/remove somente o wrapper gerenciado. A fila/outbox não dependem da UI; descoberta automática limitada aos workspaces autorizados.

- [x] Detectar versão/geração do OpenCode e registrar contrato efetivamente suportado: 1.19.5, validado por CLI/schema/registro de sessão; não misturar gerações.
- [x] Revalidar atualização para 2.2.5 e usar contrato v2 próprio: definição id/setup, stream e schemas oficiais da versão. Plugin confirmado active na API real.
- [x] Antecipar observação nativa de IDs, mensagens, ferramentas e tempos por raiz/sessão autorizadas, sem copiar conteúdo. Fonte do M1 validada nesta sessão real.
- [x] Mapear criação, passos, submissão, interrupção/erro e ferramentas. Estado ocioso não vira encerramento. Instalar globalmente sem alterar plugins alheios; bootstrap de sessão recente cobre ativação após criação.
- [x] No observador nativo, tratar replay, atualização de parte sem turno novo, indisponibilidade, confirmação de cursor após fila durável e desconexão preservando histórico.
- [x] Testar `opencode.test.ts` e `opencode-local.test.ts`: privacidade, somente leitura, escopo, checkpoint falho, replay, versão incompatível e recuperação. Smoke real no projeto Worklog e capturas em `artifacts/m1-live/`.
- [x] Validar feed/projeção, privacidade antes do IPC/outbox, escopo e descoberta de novas raízes/sessões sem connect. Falhas transitórias geram retry; gap/overflow têm marcador explícito.
- [x] Smoke nativo em raiz nova, callback/cleanup e instalação/remoção seletiva idempotente em testes. Sessões antigas devem reabrir uma vez para garantir recarga; uso diário apenas opencode.
- [x] Revalidar compatibilidade/coleta nativa na versão **2.2.6**: plugin active em raiz/store temporários, duas sessões recebidas (incluindo stream após ativação), origem/projeto/replay conferidos. Plugin/CLI/instalação/API/UI suportam 2.2.5 e 2.2.6; versão divergente da fonte bloqueia captura. Evidência `artifacts/opencode-226/verification.json`. Sem alterar o plugin pessoal; atualização opt-in antes do piloto continua necessária.

**Estado atualizado após autorização pessoal:** wrapper reinstalado explicitamente para 2.2.6, fonte original preservada. Plugin active e captura real Worklog confirmados em 08/11 22:09 BRT, com sessões/submissões/turnos/ferramentas associados ao projeto correto. Prova read-only `scripts/verify-opencode-personal-live.mjs`, checklist `.checks/opencode-personal-live.md`. Atividade Posicionadas ainda pertence ao piloto T24. Modo manual v1 ficou como legado; recuperação ampla de eventos nunca recebidos/histórico permanece T15.

**Aceite:** OpenCode aparece no histórico compartilhado com sessão, ferramenta e origem corretas.

### T14 — Fontes, perfis e múltiplas contas

**Arquivos:** ampliar `src/collectors/source-config.ts`; criar `src/web/pages/Integrations.tsx`, `tests/integration/sources.test.ts`.

**Interfaces:** produzir `registerSource(ctx,source:SourceRegistration): string` e `getSourceDiagnostics(ctx): Diagnostic[]`; nenhuma credencial bruta faz parte de `SourceRegistration` enviado ao navegador.

- [x] Registrar fontes por máquina/ferramenta/perfil/caminho/versão; múltiplos perfis, identidade estável e API de cadastro local.
- [x] Mostrar origem, última atividade registrada, compatibilidade, presença/ausência da configuração, atraso e diagnóstico sem credenciais. Nenhuma presença de diretório vira conexão.
- [x] Habilitar/pausar sem apagar histórico; controles centrais resistem a reenvio e conservam backlog remoto. Remoção seletiva local, revisão otimista e reinstalação explícita após tombstone.
- [x] `sources.test.ts`: contas com mesmo ID nativo, filtros/totais, configuração removida, versão desconhecida, privacidade, pausa, concorrência, remoção e cursor remoto. E2E desktop/mobile com cadastro e teclado.
- [x] Verificação independente dos checks de fontes/perfis e UI controlada desktop/mobile: PASS em 08/11; relatório `.checks/continuacao.verified.md`.
- [x] Conferência final das fontes/perfis atualmente registrados em 09/11: OpenCode 2.2.6 e Codex 0.167.0 locais com eventos reais; Claude 2.1.319 remoto sincronizando sem erro, com atividade histórica mas sem evento novo hoje; OpenCode 1.19.5 pausado. Perfis Claude locais sem autenticação não foram ativados nem chamados. Evidência `.checks/piloto-t14-t24-2026-11-09.md`.

**Implementação T14 (07/11):** endpoints e UI entregues; `sourceIds` compartilhado por consultas e relatórios. Operação/limites em [docs/FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md); checklist `.checks/t14-t15.md`.

**Aceite:** trabalho de contas diferentes pode ser filtrado e consolidado sem confundir sessões ou expor tokens.

### T15 — Importação do histórico disponível

**Concluída no aceite escolhido pelo usuário (08/11):** histórico **disponível e comprovado**, com limitações explícitas; não cobertura nativa integral. Recuperação real adicional: dez recibos Codex de Worklog/Posicionadas com identidade/horários originais, replay zero após reabertura e zero dedicação/revisões fabricadas. Histórico nativo legado OpenCode reconferido: 46/46 IDs, replay zero. **Verificação independente PASS 4/4**, perfil light, em `.checks/t15-fechamento.verified.md`; oito testes focados e typecheck aprovados pelo verificador. Ampliações de formatos sem contrato não são declaradas implementadas.

**Arquivos:** criar `src/collectors/history.ts`, `tests/collectors/history.test.ts`; ampliar `src/cli/index.ts`.

**Interfaces:** produzir `importHistory(ctx,sourceId:string,range:{from:string;to:string}): Promise<{imported:number;skipped:number;warnings:string[]}>` com checkpoints e parser versionado.

- [x] Importação dos registros normalizados disponíveis das três ferramentas, recibos Codex, DB OpenCode legado 1.19.5 somente leitura e scanner Git existente. Fonte sem histórico/parser comprovado recebe aviso explícito.
- [x] Proveniência separada (`observed`/`imported`/`mixed`), limites de completude e identificação em sessão/painel/CSV/PDF; sem fabricar foco ou revisões anteriores.
- [x] Checkpoint transacional, IDs estáveis, cancelamento/retomada, prefix hash/offset de JSONL e replay idempotente, inclusive com coleta ao vivo.
- [x] `history.test.ts` e `history-cli.test.ts`: truncamento, schema desconhecido, timestamp inválido, período, sobreposição live, cancelamento, escopo e leitura sem alteração da origem.
- [x] Smoke do piloto em base temporária: **46/46 IDs importados**, replay zero, nenhum evento humano/revisão; resumo com 46 evidências. Origem legada real Worklog, 06/11 13:55–14:05 UTC.
- [x] Parser nativo `opencode-log-v1`: SSE durável v1 de fontes 2.2.5/2.2.6, IDs compartilhados com live, replay/retomada, contexto de ferramenta, escopo e privacidade. Provas unitárias/CLI e verificação independente **7/7** em `.checks/t15-opencode-log.verified.md`.
- [x] Recorte `codex-rollout-0.167.0`: lifecycle de turnos de thread raiz, horários explícitos, contexto por turno, falhas/interrupções, períodos e replay/live nas duas ordens. Recibos individuais privados com compatibilidade de batch legado, concorrência em processos, fila offline e recuperação; sem alterar imutabilidade. **Verificação independente PASS, 9/9**, em `.checks/t15-codex-rollout.verified.md`. Limitação `HISTORY_LIFECYCLE_ONLY` sempre explícita; não é cobertura integral Codex nem amostra pessoal real.
- [x] Extensão opt-in `codex-rollout-v2-0.167.0`: Bash/apply_patch completed paginados, ms explícitos, filhos diretos comprovados e descarte do prefixo ancestral; SubagentStop/IDs compartilhados com hooks, replay/reabertura e zero tempo humano. V1 preservado; resultado parcial obrigatório. Checklist/provas em `.checks/t15-codex-items.md` e `.checks/t15-codex-items.verified.md`.
- [x] Extensão opt-in `codex-rollout-v3-0.167.0`: DynamicToolCall completed/success=true, nomes canônicos do contrato 0.167.0, ms explícitos, replay/live nas duas ordens (raiz/filho direto) e privacidade. V1/v2 e testes anteriores preservados. Gates **158 unitários / 32 integração / 30 E2E**, typecheck/build verdes; **verificação independente PASS, 5/5**, perfil light, relatório `.checks/t15-native-extension.verified.md`. A implementação histórica foi testada sem ler transcrições pessoais; instalação local Codex e captura pessoal OpenCode foram verificadas separadamente nesta rodada.
- [x] Registrar a disponibilidade real de log v2: consultas retornaram somente `log.synced`, corretamente diagnosticado como indisponível, sem afirmar recuperação positiva. Pelo aceite explícito **Disponível e comprovado**, uma demonstração positiva fica condicionada a existir log com eventos e não bloqueia o fechamento atual.
- [x] Delimitar a cobertura comprovada, conforme decisão do usuário: recibos reais Codex recuperados (10/10, replay zero), rollouts v1/v2/v3 com limites contratuais preservados e histórico nativo legado OpenCode recuperado (46/46). Claude nativo/MCP/linhagens adicionais não entram por suposição: contrato insuficiente identificado e registrado em `docs/FONTES-HISTORICO.md`. Essa delimitação substitui a exigência anterior de cobertura integral; não declara suporte para formatos excluídos.

**Limite T15 preservado:** transcrições privadas Claude/Codex e SQLite v2 não são reinterpretados como legado; logs v2 sem eventos não são recuperação positiva. Histórico normalizado/legado/recibos funcionam com recuperação real delimitada; rollouts mantêm partial/warnings quando exigido. T12 CLI foi validada separadamente. O fechamento desta tarefa usa o aceite disponível e comprovado aprovado pelo usuário, sem encerrar os demais aceites pessoais/piloto M3/T24. Procedimentos em [docs/FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md).

**Aceite M3:** três ferramentas suportadas e histórico disponível reunidos, com incerteza histórica visível.

## M4 — Trabalho remoto

### T16 — Coletor e sincronização SSH no Mac mini

**Arquivos:** implementados `src/remote/protocol.ts`, `src/remote/ssh.ts`, `tests/remote/sync.test.ts`, `scripts/smoke-remote.ts`; CLI e diagnóstico ampliados.

**Interfaces:** `exportBatch` inclui manifesto/identidade e lote; `syncHost` retorna contagens, cursor, backlog e clock skew. CLI distribuído: Node absoluto + `dist/cli/index.js agent export --after <seq> --limit 500`. O transporte chama esse entrypoint sem exigir wrapper no PATH.

- [x] Empacotar sem UI/dependências npm, com Node/CLI absolutos, para Linux x86_64 validado; reaproveitar política, autorização de workspace e adapter Claude 2.1.319.
- [x] Buscar lotes pelo SSH existente, sem porta externa/cópia de banco ativo. JSON/schema/origem validados; stderr separado de stdout.
- [x] Confirmar cursor com eventos transacionalmente. Replay, instalação nova, reconexão, backoff 15 s→5 min e backlog >500 cobertos.
- [x] Sinalizar atraso/clock skew >60 s; marcador de qualidade persistido junto ao evento impede dedicação humana com horário remoto não confiável.
- [x] `sync.test.ts`: commit seguido de falha, retry, instalação nova, JSON truncado, quoting e clock skew. Logs inesperados em stdout invalidam JSON; não entram no fluxo normalizado.
- [x] Smoke real Claude no host e sincronização automática para o mesmo projeto Worklog por remote Git. Cinco eventos; repetição detectou cinco duplicados. Continuidade/reinício dos agentes confirmados fora da sessão de instalação.

**Aceite:** trabalho remoto aparece no projeto certo, preservando máquina de origem e integridade na reconexão.

### T17 — Execução contínua nas duas máquinas

**Arquivos:** implementados `src/cli/service.ts`, `src/core/runner.ts`, `tests/integration/service.test.ts` e `docs/OPERACAO.md`. Plist/unit são gerados pela função tipada `serviceDefinition` em vez de templates estáticos duplicados.

**Interfaces:** `manageService(action,options)` para o host executor; `remote service --host --action` usa o mesmo módulo via SSH. CLI inclui status/start/stop/remove, atualização idempotente e remoção da instrumentação remota preservando histórico.

- [x] Launchd local e systemd de usuário remoto instalados; Linger=yes confirmado no Linux.
- [x] Coleta independe de painel/terminal/SSH. Limites de logout/desligamento do Mac e boot/linger Linux documentados.
- [x] Arquivos gerenciados preservam configurações alheias; logs próprios rotativos sem payload; reinício/backoff e shutdown conservando fila. Cancelamento de SSH em shutdown não é falha de rede.
- [x] Definições/instalação/remoção seletiva em diretório temporário testadas; SIGKILL real dos serviços próprios em ambos os hosts seguido de PID novo e cursor preservado.
- [x] Diagnosticar, parar, atualizar e remover apenas Worklog documentados em `docs/OPERACAO.md`.

**Aceite M4:** coleta independe de painel/terminal aberto, com status correto em ambas as máquinas.

## M5 — Histórico completo

### T18 — PRs, revisões e verificações

**Arquivos:** criar `src/providers/github.ts`, `db/migrations/008_prs.sql`, `tests/providers/github.test.ts`; alterar o adapter se T01 identificou outro provedor principal.

**Interfaces:** produzir `syncPullRequests(ctx,repositoryId:string): Promise<{updated:number;stale:boolean}>`; persistir `PullRequestSnapshot` por provedor+repo+número e vínculos com SHAs.

- [x] Backend/CLI/API de leitura com `gh api --method GET`, paginação, draft, branches, autor, URL, datas, revisões/checks e SHAs vinculados.
- [x] Estados open/closed/merged separados; ausência/permissão de checks e revisões explicitamente indisponível, sem falsa aprovação.
- [x] Intervalo de 5 min após habilitação explícita, ETag/304, cache preservado, backoff/rate limit inclusive em sync manual e cancelamento no shutdown.
- [x] `github.test.ts` e `pull-requests.test.ts`: páginas, estados, permissões, cache/304, 401/403/offline/rate limit, autenticação, escopo e cancelamento seguro.
- [x] Conferir um PR real: PR #1 aberto com autorização do usuário. `npm run smoke:github` observou 1 PR com URL válida; `prs sync` gravou snapshot no store pessoal (`updated=1`, `stale=false`) e `prs list` confirmou estado aberto, branches/commits e reviews/checks sem registros. Evidência `.checks/piloto-t14-t24-2026-11-09.md`.
- [x] Verificação independente do backend/contratos: PASS em 08/11, incluindo datas, snapshots stale e review/check desconhecidos como indisponíveis.

**Implementação T18:** migração aditiva **011_pull_requests.sql** (008–010 já ocupadas), endpoints `/api/prs` e `/api/prs/sync`; composição completa do painel segue T20. Detalhes em [docs/PRS-RESUMOS.md](docs/PRS-RESUMOS.md).

**Aceite:** PRs abertos e seu estado aparecem no projeto; falhas do provedor não são exibidas como aprovação.

### T19 — Resumos de trabalho com evidências

**Arquivos:** criar `src/core/summaries.ts`, `db/migrations/009_summaries.sql`, `tests/core/summaries.test.ts`.

**Interfaces:** produzir `buildWorkSummary(ctx,filter:ReportFilter): {text:string;evidenceIds:string[];ruleVersion:string}` a partir de sessões, revisões, commits e PRs.

- [x] Resumo determinístico em português com seções solicitado/realizado/verificado/pendências; pedido ausente, falhas e interrupções explícitos, sem inferir conclusão ou êxito de teste de um commit/tool.completed.
- [x] IDs rastreáveis, regra `evidence-summary-v1` e snapshots persistidos na migração **012_work_summaries.sql**; filtros compartilhados.
- [x] Gerador isolado com resultado tipado como ponto de extensão futuro; nenhuma API de IA ou envio externo de conteúdo.
- [x] `summaries.test.ts`: check falho, ferramenta interrompida, PR aberto, lacunas, pedido ausente, referência por alegação, determinismo/filtros/persistência.
- [x] Resumo do piloto histórico Worklog gerado com **46 referências válidas**; verificação independente PASS em 08/11, incluindo exclusão por projeto/fonte/período. Alterações sem commit.

**Implementação T19:** `/api/work-summary` entregue; `/api/summary` continua sendo o resumo de tempos. UI composta do projeto segue T20. Operação em [docs/PRS-RESUMOS.md](docs/PRS-RESUMOS.md).

**Aceite:** o resumo explica trabalho com rastreabilidade e sem afirmar resultado que a fonte não comprovou.

### T20 — Painel completo e navegação das evidências

**Concluída tecnicamente em 08/11.** O novo pedido retomou o rascunho adiado em 07/11. Filtros/seleção coerentes, área sem projeto, detalhe completo, paginação, diagnósticos e cancelamento de leituras atrasadas implementados e verificados independentemente. Aceites reais de T12/T18/T24 permanecem separados.

**Arquivos:** criar/ampliar `src/web/pages/ProjectDetail.tsx`, `Exports.tsx`, `Integrations.tsx`, `Overview.tsx`, `Projects.tsx`, `Activity.tsx`, `src/server/routes.ts`, `tests/e2e/project-history.spec.ts`.

**Interfaces:** consumir contratos e endpoints de commits/arquivos/PRs/fontes; todos os filtros compartilham `ReportFilter`. Preparar página de exportação para T21 sem simular download real.

- [x] Acrescentar filtros por máquina, ferramenta e perfil, lista sem projeto, seleção múltipla e contexto por projeto/cliente.
- [x] Construir detalhe com sessões, resumo, arquivos e versões/diffs, commits e PRs; navegar nos vínculos com confiança e gaps visíveis.
- [x] Mostrar fonte offline, sincronização atrasada, origem histórica/estimada e conteúdo indisponível por política ou retenção.
- [x] Em `project-history.spec.ts`, percorrer projeto→sessão→arquivo→commit→PR, alternar máquina/ferramenta/fonte/período, excluir evidências de outro projeto e tratar vazio/erro; provar recuperação do conteúdo após retry e corrida de detalhe atrasado. E2E e build aprovados.
- [x] Inspecionar desktop/mobile, teclado e contraste; visual grafite e temas preservados. Oito pares de tokens medidos em cada tema/viewport: mínimos 4,86:1 claro e 4,75:1 escuro, sem overflow. Commit depende de solicitação explícita, conforme regra global.

**Aceite M5:** histórico completo consultável por projeto e origem, com interface coerente com a prévia.

## M6 — Exportação e uso cotidiano

### T21 — Exportação por projetos e período

**Atualização T21:** notas, PRs, revisões e diffs opcionais incorporados ao ReportData, prévia e CSV/PDF. Seleção explícita e filtros compartilhados. T20 retomada e verificação independente PASS em 08/11; piloto real T24 continua pendente.

**Arquivos:** criar `src/reports/query.ts`, `csv.ts`, `pdf.ts`, `tests/reports/exports.test.ts`, `tests/e2e/exports.spec.ts`; ampliar `Exports.tsx`.

**Interfaces:** produzir `queryReport(ctx,filter:ReportFilter,options:ReportOptions): ReportData`, `renderCsv(data:ReportData): Uint8Array` e `renderPdf(data:ReportData): Promise<Uint8Array>`. `ReportOptions` contém sessões, notas, arquivos, commits, PRs e diff completo opcional. `projectIds=[]` é seleção inválida para exportar, nunca equivale a todos.

- [x] Reutilizar a consulta/semântica dos filtros; selecionar vários projetos, período, máquina e ferramenta. Prévia do relatório usa o mesmo `ReportData` do arquivo.
- [x] Gerar CSV UTF-8 com BOM, acentos, separação consistente, aspas/quebras de linha e neutralização de fórmula inclusive após espaços iniciais.
- [x] PDF com título/período/fuso, tempos separados, notas, PRs, revisões/diffs selecionados e paginação; indisponibilidade de conteúdo explícita.
- [x] `exports.test.ts`, `full-report.test.ts`, `adjustments.test.ts`: seleção/período/fuso, CSV seguro, seções completas, versões congeladas e revogação de snapshot por segurança/retenção.
- [x] Downloads CSV/PDF e totais conferidos em `exports.spec.ts`/`adjustments.spec.ts`, desktop/mobile, incluindo relatório longo; revogação de downloads por política atravessa HTTP 410. Verificação independente PASS em 08/11; sem commit automático.

**Limites:** 100 revisões para diffs, prazo de geração 1500 ms, 512 KiB/10 mil linhas por patch; limite retorna erro explícito. Guia em [RELATORIOS-AJUSTES-RECUPERACAO.md](docs/RELATORIOS-AJUSTES-RECUPERACAO.md).

**Aceite:** nenhum registro fora da seleção/período aparece; PDF e CSV preservam as distinções de tempo.

### T22 — Notas e ajustes auditáveis de tempo

**Arquivos:** implementados `src/core/adjustments.ts`, migração aditiva **013_adjustments_notes.sql**, `Notes.tsx`, `Adjustments.tsx` e testes. O número 010 já pertence ao histórico.

**Interfaces:** produzir `applyAdjustment(ctx,input:Adjustment): string` e `saveNote(ctx,targetId:string,text:string): string`; `Adjustment` inclui intervalo, projeto, valor anterior/novo, motivo e data. Reutilizar `deriveTime` e `queryReport`.

- [x] Notas versionadas/classificadas e ajuste explícito global com atribuição ao projeto escolhido, inclusive fora de sinais previamente observados.
- [x] Ledger append-only com antes/depois/motivo; desfazer por compensação; sobreposição/revisão concorrente retornam 409. Intervalo passado e valor limitado ao span.
- [x] Estimado/ajustado/não atribuído separados no cálculo e no relatório, sem somar execução de IA como dedicação ou faturamento.
- [x] `adjustments.test.ts`: reatribuição, cortes proporcionais exatos por BigInt, conflitos, concorrência, desfazer, notas e prévia antes/depois preservada.
- [x] `adjustments.spec.ts`: teclado, persistência de nota, downloads e compensação em desktop/mobile; conflitos 409 também provados pela API. Verificação independente PASS em 08/11; alterações sem commit.

**Aceite:** usuário corrige a estimativa com rastreabilidade, sem perder o registro original.

### T23 — Configurações, retenção e recuperação

**Arquivos:** criar `src/core/maintenance.ts`, `tests/integration/recovery.test.ts`; ampliar `Integrations.tsx`, CLI e `docs/OPERACAO.md`.

**Interfaces:** produzir `backupData(ctx,destination:string): Promise<Diagnostic>`, `restoreData(options:{backup:string;dataDir:string}): Promise<Diagnostic>` com serviço parado, e `runRetention(ctx,now:string): Diagnostic`. Persistir os defaults de captura, tempo e sincronização.

- [x] Configuração persistida, exclusões, idle, retenção, SSH, orçamento e controles de raízes/fontes em Integrações/CLI; pausa interna de arquivos/focus respeitada.
- [x] Retenção diária padrão 30 dias: conteúdo intermediário anterior ao corte, hashes recentes/últimos protegidos, metadados/eventos/cursores preservados e diff perdido identificado.
- [x] SQLite backup consistente com revisões, fila normalizada e recibos Codex; restore em destino novo com digest/identidade/contagens, marcador de recuperação incompleta e sem sobrescrever base ativa.
- [x] Amostra real delimitada: 46 eventos, replay zero, 564.926→4.665.686 bytes (inclui WAL), SQLite 487.424 bytes, 2416 ms. Orçamento inicial configurável 1 GiB, alerta 80%, suspensão de conteúdo volumoso; crescimento de um dia permanece T24.
- [x] `recovery.test.ts` e `maintenance-cli.test.ts`: corte/deduplicação, conteúdo/totais restaurados, fila pendente, replay de recibos, IO/disco cheio/permissão simulados, marcador incompleto, configuração persistida e processos CLI separados. A recuperação de lotes/cursor também permanece coberta pelos testes de sync existentes.
- [x] Procedimentos documentados em `docs/RELATORIOS-AJUSTES-RECUPERACAO.md` e `OPERACAO.md`. Verificação independente PASS em 08/11, incluindo corte/cursor da retenção e serviço ativo controlado. Sem redeploy/commit; confirmação operacional prolongada permanece T24.

**Aceite:** uso contínuo recuperável, sem crescimento silencioso ou apagamento inesperado de dados não sincronizados.

### T24 — Piloto completo e entrega do primeiro produto

**Progresso operacional em09/11 02:50UTC:** ambos os projetos têm captura OpenCode real (Posicionadas novo às23:39BRT); Codex mínimo e PR#1 já comprovados em registros posteriores à preparação abaixo. Prova segura em `.checks/t24-safe-acceptance.md`: snapshot pessoal7156 eventos/42 sessões, restore isolado/identidade e11 recibos preservados; fila real recuperada e replay0; CSV/PDF por projeto/período/máquina e nota/ajuste/undo somente no clone. Sem mudar ledger pessoal. Esses resultados são parciais: não comprovam bloqueio/suspensão/SSH offline reais, dedicação humana, cadeia completa de evidências, inspeção visual ou crescimento diário. T24 continua aberta; checklist original preservado. Resumo vigente em docs/PILOTO.md.

**Piloto real pendente:** `full-flow.spec.ts` passou em desktop/mobile na retomada de 08/11, inclusive em verificação independente. Isso prova o fluxo controlado, não um dia de uso real. Pré-requisitos e cenários em `docs/PILOTO.md`.

**Preparação pessoal posterior (08/11):** Worklog e Posicionadas escolhidos pelo usuário e cadastrados como raízes habilitadas distintas. Plugin OpenCode pessoal atualizado com autorização para 2.2.6, identidade preservada; captura após recarga ainda pendente. Coletor rodando, baseline de armazenamento 128759975 bytes. Worklog sem PRs na nova consulta GET; Posicionadas sem remote. Prova de preparação `.checks/piloto-posicionadas.md`; um dia real e demais cenários continuam abertos.

**Arquivos:** criar `tests/e2e/full-flow.spec.ts`, `docs/PILOTO.md`, `docs/ENTREGA.md`; atualizar README com execução real.

**Interfaces:** consumir CLI, adapters, UI e contratos entregues; produzir registro de validação com versões, cenários, contagens e limitações reais.

- [ ] Escolher dois projetos e executar um dia de piloto com Claude/Codex/OpenCode locais, Claude remoto confirmado, Git, arquivo ainda sem commit e PR existente de leitura.
- [ ] Exercitar agentes simultâneos, trabalho humano em outro projeto, pausa/bloqueio, terminal fechado, SSH offline e reconexão com backlog; registrar amostra de tempo observada para avaliar a estimativa.
- [ ] Validar arquivo editado→revisão→sessão→commit→PR e associação ambígua com rótulo correto. Validar importação histórica sem inventar horas ou revisões ausentes.
- [ ] Testar exportação de só um dos projetos, por período e máquina, antes/depois de ajuste; comparar contagens/totais com o painel e abrir o PDF final.
- [x] Rodar `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e -- tests/e2e/full-flow.spec.ts` e `npm run build`; resultados e limitações registrados em 08/11. Suites completas: 46/25/28 testes. Marco mantido incompleto pelos aceites reais acima; ver `.checks/continuacao.verified.md`.
- [ ] Publicar apenas a documentação local de entrega e versionar as mudanças revisadas. Não fazer deploy externo nem escrever em PRs como parte do monitoramento.

**Aceite M6:** o usuário consegue acompanhar trabalho real nas duas máquinas, consultar evidências e exportar uma seleção correta, com fontes e limitações visíveis.

## Fora do backlog inicial

XLSX nativo, síntese opcional por LLM, painel em nuvem, equipes e faturamento poderão ganhar tarefas após o piloto. Não são dependências para começar M1 e não devem surgir como infraestrutura antecipada.

## Registro de revisão do plano

- Cobertura: requisitos locais, SSH/Mac mini, três ferramentas, perfis, tempos, Git, PRs, arquivos, notas e exportação mapeados nas tarefas acima.
- Contratos: eventos e filtros definidos em `ARQUITETURA.md`; T02 completa tipos compartilhados antes dos adapters.
- Dependências: índice sem ciclos; M1 chega a uma entrega utilizável antes das integrações remotas.
- Revisão de risco: os cinco casos em Review Focus têm tarefas e validações explícitas.
- Estado vigente: T12 CLI validada em uso real e T15 concluída no aceite disponível/comprovado, PASS independente 4/4. Cobertura nativa adicional permanece limitação documentada, não suporte presumido. PR real, demais perfis pessoais e T24 continuam pendentes. Implementação e prova de recuperação commitadas localmente com autorização; sem push/redeploy externo. Evidências em `.checks/t15-fechamento.verified.md` e `.checks/PROXIMA-SESSAO.md`.
