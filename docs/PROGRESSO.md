# Progresso de implementação

Atualizado em 08/11/2026. Execução autorizada pelo usuário com `/tlc-implement`. Alterações locais, ainda sem commit/redeploy.

## Extensão T15 — ferramentas e filhos diretos Codex

- **Implementado:** parser opt-in `codex-rollout-v2-0.167.0`; contrato anterior inalterado. ItemCompleted paginado recupera Bash (`CommandExecution`, unified_exec_startup/completed) e apply_patch (`FileChange`/completed), só com horários explícitos em ms. Filho exige raiz/pai/depth=1 e borda ordinal; ignora prefixo ancestral antes de validar contextos próprios e usa SubagentStop para terminar.
- **Provas:** 30 testes novos falharam antes do código por parser ausente. Gates completos **122 unitários / 31 integração / 30 E2E**, typecheck/build aprovados, sem skips. Corrigida inferência TypeScript de uma tupla de teste (`as const`), sem mudar assertions. Provas verificam duas ordens live/replay, primeira observação imutável, reabertura, contexto tardio, recusa antes de recibos e 90 s acumulados/60 s de relógio/zero humano. Checklist `.checks/t15-codex-items.md`; verificação independente `.checks/t15-codex-items.verified.md`.
- **Limites:** HLC/complete=false/exit1 preservados. Não cobre demais ferramentas/status/source, filhos aninhados/review/internal, páginas externas ou interrupção de filho sem identidade comprovada. Sem novas dependências/migrações, perfis pessoais, confiança a hooks, transcrição pessoal, modelo, commit/push/deploy ou piloto real. T15 permanece aberta.
- **Verificação independente PASS, 8/8**, perfil light: 68 unitários e 3 integrações reexecutados, typecheck aprovado, hashes/diff conferidos contra snapshot real. Nenhuma lacuna bloqueante; sem fault injection neste perfil. Relatório `.checks/t15-codex-items.verified.md` explicita amostragem e limites. Código/provas não foram alterados após a verificação.

As seções abaixo registram as entregas anteriores; seus limites v1 continuam válidos para aquele parser, não descrevem o novo opt-in v2.

## Continuação T15 — rollout Codex 0.167.0

- **Implementado:** parser opt-in `codex-rollout-0.167.0`, JSONL nativo versionado de thread raiz, lifecycle de turnos com segundos Unix explícitos, contexto por turno mesmo após task_started, falhas/interrupção, limites/períodos, privacidade e retomada. Recorte sempre sinalizado `HISTORY_LIFECYCLE_ONLY`, `complete=false`, CLI exit1 inclusive quando HISTORY_MORE_AVAILABLE pede continuação. Não fabrica submissão, início/fim de sessão, ferramenta, foco ou revisão histórica.
- **Sobreposição live resolvida no recorte:** IDs compartilhados com hooks; recibos individuais no diretório privado existente escolhem a primeira observação durável via hard link. Hook continua sem SQLite/UI; importação aplica autorização/período antes do recibo e transação ao evento/proveniência/checkpoint. Batch legado, replay, reabertura e backup/restore preservados. Corpo divergente gera conflito explícito, sem mudar eventos originais.
- **Provas:** testes novos escritos antes do código falharam pela ausência do parser (`HISTORY_INPUT_INVALID`); corrigidas somente precondições de montagem (cwd canônico e recibo legado via prepareCapture como antes), não assertions. Gates completos **92 unitários (incluindo subtestes), 30 integração, 30 E2E**, typecheck/build aprovados, sem skips. **Verificação independente PASS, 9/9 checks**, perfil light, rodada 2, em `.checks/t15-codex-rollout.verified.md`: provas reexecutadas pelo verificador (47 unitários/7 integração) e 12 reproduções sintéticas adicionais aprovadas, sem gaps restantes no recorte.
- **Correções exigidas pelo Verifier:** a rodada 1 reproduziu três lacunas apesar dos gates verdes: marcadores `source.subagent`/`thread_source` eram aceitos, thread divergente era validada só após o prefixo e `--limit` permitia exit0 com HLC. Novos contraexemplos foram escritos e falharam antes do fix; preflight agora recusa linhagem/thread antes de eventos/recibos e HLC mantém exit1 mesmo com MORE. Nenhum critério/assertion foi reduzido; histórico do FAIL em `.checks/t15-codex-rollout.verified.md`.
- **Concorrência real de processos de teste:** quatro entrypoints CLI compilados gravam offline o mesmo turno; dois IDs inseridos/seis duplicados, um horário por ID e zero rejeições. Não é uma sessão real autenticada do Codex, nem dispensa revisão nativa de confiança T12.
- **Limites deliberados:** somente thread raiz sem forks/herança/subagentes/páginas externas; ferramentas e razões de aborto adicionais não inferidas. Snapshot global de cwd alterado sem vínculo por turno é recusado. Horários ausentes/zero continuam ausentes; timestamp de escrita/duration_ms não viram execução. Dados privados só em memória do leitor delimitado; não são gravados em eventos/recibos/diagnósticos.
- **Aceites reais:** nenhum perfil/serviço pessoal atualizado, nenhum hook recebeu confiança, nenhuma transcrição/credencial pessoal lida e nenhuma chamada de modelo/SSH realizada. Histórico OpenCode v2 positivo, cobertura Codex adicional, contrato Claude e piloto T24 continuam pendentes. Guias [FONTES-HISTORICO.md](FONTES-HISTORICO.md) e [CODEX.md](CODEX.md).

As seções seguintes preservam as etapas anteriores; o parser Codex raiz já não é apenas pesquisa pendente.

## Revisão de pendências — suporte live OpenCode 2.2.6

- **Pendências separadas de implementação:** T15 ainda precisa de parser rollout Codex e de contrato suficiente para histórico Claude; os demais itens abertos em T05/T12/T14/T18/T24 são aceites reais, confiança/login, escolha de projetos/PR ou piloto de um dia. T13 tinha uma regressão técnica concreta após atualização do runtime.
- **T13 implementada:** allowlist única 2.2.5/2.2.6 compartilhada por setup, instalação, IPC, diagnóstico e remoção. Instalação recebe a versão efetivamente detectada; remoção não a rebaixa para 2.2.5. Fonte/runtime divergentes não assinam eventos. Badge usa a versão da fonte local/presente, sem confundir fonte remota ou arquivo ausente com instalação local.
- **Provas red → green:** antes da correção, coleta 2.2.6 não iniciava, diagnóstico de divergência era incorreto e instalador persistia 2.2.5. Os testes foram escritos antes da implementação; as assertions foram preservadas.
- **Smoke nativo:** runtime 2.2.6, plugin de ID exclusivo `worklog-native-smoke` carregado active, duas sessões próprias em raiz/store temporários, duas evidências, segunda sessão comprovada pelo stream (`startup`, não só bootstrap), origem/projeto corretos, replay zero, zero modelos/humanos/revisões. Sessões e área temporária removidas; artefato sanitizado `artifacts/opencode-226/verification.json`. Não é um dia de piloto nem exercício nativo de turnos/ferramentas com modelo.
- **Regressão completa:** typecheck/build; **54 unitários (incluindo subtestes por versão), 28 integração e 30 E2E**, sem falhas/skips. **Verificação independente PASS, 7/7 checks, perfil light**, relatório `.checks/t13-opencode-226.verified.md`. A primeira rodada encontrou TS2339 na assertion de stream do smoke; corrigido com narrowing explícito, sem reduzir a assertion. Segunda rodada reexecutou todos os gates/provas e aprovou; histórico do FAIL preservado no relatório.
- **Operação pessoal:** nenhum wrapper/perfil/serviço pessoal foi instalado ou atualizado, sem SSH, push, deploy ou commit. Fonte pessoal precisa de reinstalação explícita com a versão revisada antes do piloto; não editar versão manualmente para contornar o guard.
- **Investigação T15 somente leitura:** contrato rollout oficial Codex `rust-v0.167.0` localizado; persistência varia por modo e sobreposição com IDs/horários de hooks exige implementação/provas próprias. SDK Claude correspondente às versões 2.1.318/2.1.319 declara o payload JSONL interno e opaco; não há fundamento para inventar lifecycle. Nenhuma transcrição pessoal/credencial foi lida. Referências em [FONTES-HISTORICO.md](FONTES-HISTORICO.md).

As seções abaixo são registros anteriores; os avisos de incompatibilidade 2.2.6 do código foram superados por esta entrega, não pela atualização da instrumentação pessoal.

## Continuação T15 — parser do log durável OpenCode v2

- **Implementado `opencode-log-v1`:** input SSE nativo com envelope durable v1, fonte local 2.2.5/2.2.6, início da sessão e watermark `log.synced`. Reutiliza projector/IDs do plugin, CLI configure/import e proveniência existentes. Sem migração, dependência ou novo endpoint.
- **Garantias:** replay/live idempotentes, canonicalização de caminhos, período `[from,to)`, nomes de ferramenta por contexto, falhas/interrupção/compactação preservadas. Input aberto somente leitura; diretórios externos/pausados, origem/versão divergentes, sequência inválida, schema futuro e truncamento têm diagnóstico fixo. Não preserva prompts/args/outputs nem fabrica foco/revisões/fim de sessão.
- **Retomada/limites:** relê metadados desde início para reconstruir contexto e pula IDs confirmados; 64 MiB por arquivo, 1 MiB por frame e 10000 frames. Cancelamento e limite de inserções conservam prefixo confirmado.
- **Provas:** testes red antes de registrar o parser; cinco testes nomeados novos (quatro unitários, um CLI compilado). Typecheck/build e suites completas **50 unitários + 26 integração + 28 E2E** aprovadas, sem skips.
- **Verifier independente:** **PASS, 7/7 checks**, perfil light, relatório `.checks/t15-opencode-log.verified.md`. Esse aceite é da extensão; o relatório anterior dos 33 checks permanece separado.
- **Smoke real delimitado:** OpenCode **2.2.6**, GET de uma sessão autorizada e de seu log finito, sem pedido de modelo; dados privados removidos antes de escrever metadados temporários. Resultado: **1 frame, 0 IDs/eventos, replay 0, complete=false, HISTORY_UNAVAILABLE, nativeHistoryProven=false**. A ausência foi corretamente diagnosticada; não constitui recuperação positiva nem encerra T15/M3.
- **Atualização de ambiente:** runtime OpenCode mudou de 2.2.5 para **2.2.6**. O plugin ao vivo permanece com guard 2.2.5 neste código, e a compatibilidade/ativação pessoal 2.2.6 precisa ser revalidada. Nada foi reinstalado ou reiniciado nesta continuação.
- **Pendências:** recuperação positiva de log v2 quando disponível; parsers privados Claude/Codex; captura real Codex/confiança; perfis/PR real e piloto T24. Guia atualizado: [FONTES-HISTORICO.md](FONTES-HISTORICO.md).

## Retomada 08/11 — T20 e verificação independente concluídas

**Estado vigente:** o novo pedido retomou a T20 e a verificação reservadas para outra sessão. As seções de 07/11 abaixo são histórico; seus adiamentos foram superados por esta rodada.

- **T20 implementada:** seleção múltipla aplicada ao catálogo; alterar seleção sai do detalhe fixo; busca por projeto/cliente; filtros máquina/ferramenta/fonte/período; área “Somente sem projeto” com retorno ao histórico. Detalhe reúne sessões, resumo, revisões/diffs, commits, PRs e cobertura dos observadores.
- **Navegação e falhas:** continuação por cursor em revisões/commits/PRs; polling pausa após expansão. Fontes offline/atrasadas, última sincronização, gaps, proveniência e conteúdo indisponível permanecem explícitos. Retry conserva evidências anteriores sinalizadas e recupera conteúdo novo.
- **Correções verificadas:** resposta atrasada de sessão podia substituir a sessão aberta depois; sessão/commit agora abortam no fechamento e ignoram retorno obsoleto. Estado de review/check desconhecido passa a recurso indisponível, preservando o PR.
- **Verificação independente:** **PASS, 33/33 checks**, perfil light, cobrindo `.checks/t14-t15.md`, `t18-t19.md`, `t20-t23.md` e `t20-retomada.md`. Primeiro relatório encontrou 16 lacunas de prova e uma ressalva de concorrência; todas encerradas até a terceira rodada, com histórico preservado em `.checks/continuacao.verified.md`. Sem fault injection do verificador ou auditoria UI do perfil ui.
- **Provas finais independentes:** typecheck/build; **46 unitários + 25 integração + 28 E2E**, sem falhas/skips. Cenário completo controlado passou em desktop/mobile. A retomada CLI de 1000 registros exigiu orçamento de ensaio de 30 s, mantendo SIGINT/exit130, confirmação parcial, contagens finais e replay zero.
- **Histórico real delimitado:** o verificador repetiu a leitura do período legado 06/11 13:55–14:05 UTC em store temporário: **46/46 IDs**, replay zero, zero sinais humanos/arquivo e zero revisões. Amostra final 564.926→4.657.446 bytes, SQLite 487.424 bytes, 6886 ms; não é crescimento diário.
- **UI:** capturas desktop/mobile de histórico/cobertura inspecionadas; rodada de confirmação nos temas claro/escuro sem overflow. Oito pares de tokens de texto medidos em cada tema/viewport: mínimo **4,86:1 claro / 4,75:1 escuro**. Capturas `test-results/t20-{desktop,mobile}-{light,dark}.png`; CSS/identidade grafite preservados. Detector mecânico nos quatro alvos UI retornou `[]`.
- **Endpoints:** T20 reutiliza `/api/projects`, `/api/sessions`, `/api/activity`, `/api/files`, `/api/commits`, `/api/prs`, `/api/work-summary`, `/api/sources` e `/api/settings`; nenhum endpoint adicional necessário nesta entrega.
- **Pendências reais:** captura pessoal Codex/confiança nativa, perfis Claude locais opcionais, conferência com perfis pessoais/PR real, parsers históricos nativos adicionais e piloto de um dia T24 (bloqueio/suspensão físicos, SSH/backlog e crescimento diário). Nenhum serviço pessoal/host remoto foi atualizado; HTTP pessoal 4320 não foi reaberto.

Próximas ações: `.checks/PROXIMA-SESSAO.md`; piloto: [PILOTO.md](PILOTO.md). As provas controladas não encerram os aceites operacionais de M3/M5/M6.

## Histórico 07/11 — T21/T22/T23 e adiamento explícito da T20

**Decisão vigente em 07/11, superada pela retomada acima:** o usuário adiou a **T20 para outra sessão** durante o trabalho. Havia rascunho de detalhe/navegação e provas anteriores à decisão; a task não foi marcada concluída naquela rodada. `full-flow.spec.ts` e Verifier também ficaram reservados à sessão futura, agora executados em 08/11.

- **T21:** ReportData/CSV/PDF e prévia incluem notas, revisões/diffs e PRs selecionados; cortes/filtros, neutralização de fórmula, limites e expiração após revogação preservados. Downloads e extração de PDF conferidos em desktop/mobile.
- **T22:** notas/classificação com versões, ledger append-only, antes/depois/motivo, revisão global, recusa de overlap/futuro e desfazer compensatório. Dedicação ajustada substitui estimativa no intervalo; cortes conservam ms via BigInt, sem somar execução de IA como humano.
- **T23:** configuração/raízes/fontes, retenção diária com corte exato e hashes compartilhados protegidos, orçamento, backup SQLite consistente incluindo fila/recibos e restore novo/verificado. Disco cheio/permissão foram simulados; arquivo corrompido, destino ocupado e recuperação incompleta foram recusados. Conteúdo, totais e replay de pendências foram testados, também via CLI compilado em processos separados.
- **Provas finais direcionadas após o adiamento:** typecheck/build; **16 testes unitários + 5 de integração** aprovados, cobrindo tempo/ajustes/arquivos/plugin/relatórios e manutenção/API. Os quatro cenários E2E de ajustes/configuração (desktop/mobile) também passaram. Não transformar isso em nova execução da T20 ou em Verifier independente.
- **Medição real delimitada:** 46 IDs importados, replay zero; amostra 564.926→4.665.686 bytes (com WAL), SQLite 487.424 bytes, 2416 ms. Crescimento de um dia permanece T24; não é promessa de throughput. Uma tentativa anterior de medição excedeu o prazo; o leitor foi ajustado para evitar IO por registro fora do período, mantendo autorização prévia da sessão nativa e validação de identidade.
- **Migrações aditivas:** `013_adjustments_notes.sql` e `014_operating_config.sql`. Serviços pessoais/host remoto não foram atualizados; HTTP 4320 não foi reaberto. GUI/tema já existentes foram preservados.

Guia: [RELATORIOS-AJUSTES-RECUPERACAO.md](RELATORIOS-AJUSTES-RECUPERACAO.md). Aceite real: [PILOTO.md](PILOTO.md). Handoff: `.checks/PROXIMA-SESSAO.md`; critérios: `.checks/t20-t23.md`.

## Rodada 07/11 — implementação antes do verificador

O usuário pediu continuar com `/tlc-implement` em ciclos de implementação/testes e **adiar o verificador independente completo para outra sessão**. Nenhum Verifier foi despachado nesta rodada. O relatório independente anterior de T12 não cobre estas mudanças.

- **T14:** cadastro/diagnóstico de fontes e perfis, controles centrais com revisão otimista, pausa/retomada/remoção seletiva e filtros por fonte em sessões, atividade, totais e relatórios. Reenvio não desfaz pausa; fonte remota pausada conserva backlog/cursor. UI e teclado testados em desktop/mobile, sem credenciais no GET.
- **T15:** importação/exportação normalizada v1, recibos Codex e SQLite OpenCode legado somente leitura; cancelamento, checkpoint transacional, validação e proveniência. Parsers privados Claude/Codex e DB OpenCode v2 não foram presumidos compatíveis. Fonte sem contrato comprovado fica indisponível explicitamente.
- **Piloto histórico:** store temporário com raiz real Worklog; período 06/11 **13:55–14:05 UTC**, **46 IDs esperados/46 importados**, replay zero, nenhum sinal humano/revisão fabricado. Gerador de resumo produziu `evidence-summary-v1` com 46 referências válidas. Banco nativo não foi alterado.
- **T18:** backend/CLI/API GitHub GET, paginação, estados corretos, cache/ETag/304, revisões/checks indisponíveis, rate limit/backoff e cancelamento no shutdown. Consulta real autenticada do Worklog retornou **zero PRs**; conferência de um PR real segue pendente.
- **T19:** resumo determinístico, seções solicitado/realizado/verificado/pendências, evidências por alegação e snapshots; sem API de IA. UI completa de projeto/PRs/resumo pertence a T20.
- **Provas locais:** typecheck/build aprovados; **42 unitários + 18 integração + 12 E2E = 72 testes aprovados**, sem skips. As provas do autor não substituem a verificação independente futura. Capturas desktop/mobile de Integrações inspecionadas; alterações paralelas de tema/CSS foram preservadas.
- **Operação:** HTTP pessoal 4320 permaneceu encerrado; testes usaram portas efêmeras e stores temporários. Nenhum serviço pessoal/host remoto foi atualizado nesta rodada.

Checklists: `.checks/t14-t15.md`, `.checks/t18-t19.md`. Handoff e comandos do verificador futuro: **`.checks/PROXIMA-SESSAO.md`**. Guias: [FONTES-HISTORICO.md](FONTES-HISTORICO.md), [PRS-RESUMOS.md](PRS-RESUMOS.md).

## Atualização: automação entregue

### Continuação T12 — Codex (06/11/2026)

- Próxima tarefa desbloqueada após T09–T11: **T12**. Adapter de hooks Codex CLI **0.167.0**, configuração seletiva/backup, entrada compilada fail-open e fila offline implementados com `/tlc-implement` (perfil light).
- Sessões, turnos, ferramentas, interrupção e subagentes seguem os contratos compartilhados; replay mantém IDs/horários em recibos privados normalizados. Prompts, comandos, saídas e transcrições são descartados antes da persistência; nenhum evento da IA gera dedicação humana.
- Teste red inicial confirmou ausência do adapter. Cinco testes novos de domínio e um de entrypoint compilado passaram; suite unitária completa passou com **32 testes**. Typecheck/build aprovados.
- **Smoke nativo de descoberta aprovado:** Codex 0.167.0 reconheceu dez hooks, todos `untrusted`, timeout 2 s; **zero requisições de modelo**. A captura real permanece pendente de revisão em `/hooks`; a T12 não foi marcada como inteiramente concluída. App não encontrado nos paths inventariados. Nenhuma configuração pessoal/política/confiança foi alterada.
- Checklist: `.checks/t12-codex.md`; verificação independente: `.checks/t12-codex.verified.md`. Operação, endpoints reutilizados e limites: [CODEX.md](CODEX.md). Próximas dependências são T14/T15; demais pendências permanecem no backlog.

T13/T16/T17 foram priorizadas e implementadas por solicitação do usuário: plugin OpenCode **2.2.5**, descoberta sob workspaces autorizados, hooks Claude **2.1.319** no macmini, sincronização SSH e agentes launchd/systemd. Fonte nativa remota comprovada com cinco eventos, sem duplicação; abertura local comprovada em raiz nova. Serviços recuperaram após SIGKILL. **32 testes passaram**, além dos smokes reais; detalhes em [AUTOMACAO.md](AUTOMACAO.md).

Estado atual de T13: automação v2 instalada e validada. T16/T17: instaladas e validadas em ambos os hosts. A validação do adapter Claude 2.1.319 foi feita com a conta funcional do próprio macmini; perfis Claude locais são opcionais. O leitor manual 1.19.5 e os bloqueios locais descritos abaixo registram a etapa anterior.

## Situação do primeiro marco

| Task | Entrega | Estado |
|---|---|---|
| T01 | Base executável e inventário local/remoto | Base verificada; Worklog escolhido como primeiro projeto do piloto, remote GitHub confirmado |
| T02 | Eventos v1, identidades persistentes, lotes e cursores transacionais | Implementada e validada |
| T03 | Projetos, raízes, remotes sem credenciais e worktrees | Implementada e validada |
| T04 | Política de captura e normalização antes da persistência | Implementada e validada |
| T05 | Adapter Claude, merge/remoção de hooks e fila durável offline | Nativo 2.1.319 validado no macmini; perfis locais são opcionais |
| T06 | Sessões e execuções reprocessáveis, subagentes e incompletude | Implementada e validada |
| T07 | Dedicação explícita estimada, união global e execução de agentes | Implementada e validada; ensaio físico de bloqueio/suspensão pendente |
| T08 | Visão geral, projetos, atividade, detalhe da sessão e fontes | M1 técnico validado com esta sessão nativa OpenCode e painel desktop/mobile |
| T13 | Observador legado e plugin de eventos v2 | Suporte 2.2.5/2.2.6 implementado, smoke nativo isolado aprovado; atualização pessoal opt-in pendente |
| T16–T17 | Coletor SSH e serviços | Instalados e validados no Mac e macmini |
| T09–T11 | Git, arquivos, revisões/diffs e relações | Implementadas e validadas; evidências abaixo |
| T12 | Adapter Codex CLI 0.167.0 | Implementado; captura real pendente de revisão nativa de confiança |
| T14 | Fontes/perfis, controles e filtros | Verificação independente PASS; conferência pessoal pendente |
| T15 | Histórico versionado disponível e proveniência | Log v2 7/7 e Codex raiz 9/9 verificados; piloto legado 46/46; cobertura nativa integral/amostras reais pendentes |
| T18–T19 | GitHub GET/cache e resumos com evidências | Verificação independente PASS; PR real pendente |
| T20 | Painel completo | Implementada e verificada em 08/11; desktop/mobile e temas preservados |
| T21–T23 | Relatórios completos, ledger/notas, configuração/retenção/recuperação | Verificação independente PASS; confirmação operacional prolongada em T24 |
| T24 | Piloto de um dia e entrega | Piloto real pendente; full-flow controlado executado e aprovado em 08/11 |

**M1 validado com fonte nativa real:** o usuário orientou seguir nesta sessão, sem depender de `claude-conta-b`. A integração mínima do OpenCode foi antecipada da T13. Sessão e eventos reais foram coletados e conferidos no painel; evidências em [M1.md](M1.md). Fixtures sintéticas continuam isoladas nos testes, separadas da base de uso pessoal. A validação específica do Claude permanece na T05.

## Evidência por tarefa

### T02 — Eventos

- `tests/core/events.test.ts`: lote repetido, conflito de identidade, falha SQL no segundo evento revertendo eventos e cursor, versão inválida sem avanço, eventos imutáveis, instalação nova com sequência própria e reabertura mantendo a sequência.
- Cursor de exportação desconhecido ou além da sequência persistida é recusado.
- Discriminantes de payload têm campos, enums, IDs, timestamps UTC e limites validados. `TimeSummary` separa dedicação atribuída, ajustes, trechos não atribuídos, execução acumulada, união de relógio e duração de sessão.

### T03 — Identidades

- `tests/core/projects.test.ts`: SSH/HTTPS equivalentes sem credenciais, host/owner distintos, clone remoto, worktree real, pasta aninhada com associação explícita, unicode/espaços, escape por symlink e sobreposição com diretório de dados.
- Caminhos históricos continuam resolvíveis após a remoção de uma subpasta; a captura atual continua exigindo uma pasta real autorizada.
- Pastas sem Git podem ser cadastradas explicitamente. Nomes de pastas não unificam projetos automaticamente.

### T04 — Política

- `tests/core/policy.test.ts` + `tests/fixtures/events/tool.json`: `.env*`, chaves, diretórios internos de ferramentas, dependências/builds, ignores Git, traversal, symlink externo, binários, revisão acima de 2 MiB, payload inválido/grande e IDs distintos no mesmo timestamp.
- `.env.example` é negado por padrão. Exceção somente por path explícito em `PolicyConfig.allowExamples`, para arquivos de exemplo; ignores Git ainda têm precedência. A edição dessas políticas pela interface fica em T23.
- Prompts, comandos, argumentos de ferramentas, stdout e respostas não são persistidos. O adapter extrai apenas ciclo de vida, IDs de correlação e nomes de ferramenta.

### T05 — Claude e fila

- Contrato alvo: Claude Code **2.1.318**. Referência: documentação oficial de hooks consultada na sessão e `claude --help` da instalação real.
- Hooks: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`.
- Instalação em exec form (`command` absoluto e `args`, sem shell), timeout de 2 s e `onFailure: continue`. O entrypoint de hook sai silenciosamente com código zero em falha; não devolve decisões, contexto ou prompts ao agente.
- `tests/collectors/claude.test.ts`: configuração existente preservada, backup, instalação idempotente, remoção seletiva, perfil com espaço, interrupção e fila com a base fechada. O teste usa repositório Git temporário.
- Manifesto privado `capture.json` permite verificar fonte, raiz e política antes de gravar a fila, sem abrir SQLite. Arquivos da fila são normalizados, escritos atomicamente e sincronizados em disco. Replay após persistência parcial é idempotente; só se remove o arquivo após todos os eventos estarem gravados.
- Consumo limitado a 500 eventos por rodada. Arquivos inválidos são separados com sufixo `.rejected`, e o diagnóstico permanece sinalizado enquanto existirem. Falha transitória no banco mantém arquivos pendentes.
- `tests/e2e/first-use.spec.ts` executa o hook **compilado** em processos independentes enquanto o servidor está fechado. Depois reinicia a base, consome a fila e abre a sessão correspondente no navegador.

#### Smoke nativo e autenticação

`scripts/smoke-claude.ts` cria repositório, dados e settings temporários, instala apenas hooks Worklog nesse settings, executa um prompt sintético com ferramentas desabilitadas e orçamento máximo de US$ 0,10 e limpa a área temporária. Não altera settings dos perfis pessoais.

Resultados observados:

| Perfil | Metadado de `auth status` | Tentativa real `claude -p` |
|---|---|---|
| Padrão | `loggedIn: false`, método `none` | `Not logged in · Please run /login` |
| Conta B | Credenciais presentes, método `claude.ai` | Login expirado, sem renovação automática |
| Conta C | Credenciais presentes, método `claude.ai` | Login expirado, sem renovação automática |

O CLI encerrou antes dos hooks: **zero eventos** nos três smokes Claude. Nenhuma sessão Claude foi marcada como coletada. `auth status` sozinho não prova acesso funcional. Login interativo é uma evidência futura da T05; não é pré-requisito do M1 com OpenCode.

### T06 — Sessões

- `tests/core/sessions.test.ts`: retomada, compactação, evento atrasado, final ausente, duas fontes com mesmo ID nativo, subagentes paralelos e reconstrução do zero igual à projeção incremental.
- Chave: fonte + sessão nativa + agente. A relação de pai não mescla identidades ou tempos.
- Estado em execução sem atividade por mais de 5 min aparece incompleto. Execuções sem fechamento são limitadas à última evidência; não crescem até o horário da consulta.

### T07 — Tempo

- `tests/core/time.test.ts`: 09h–10h e 09h30–10h30 produzem **120 min acumulados e 90 min de relógio**, sem gerar dedicação humana.
- Sinais humanos de máquinas concorrentes são unidos globalmente. Se apontarem para projetos diferentes, o trecho permanece não atribuído. Filtrar uma máquina não elimina essa ambiguidade global.
- Troca explícita de projeto encerra o trecho anterior; pausa, bloqueio e lacunas de observação encerram janelas. Retomada de máquina e execução de IA não iniciam dedicação.
- `tests/core/dates.test.ts`: virada local de dia, limites em UTC, DST com 23/25 horas e meia-noite inexistente em São Paulo.
- Probe real macOS via `ioreg` confirmou disponibilidade de `HIDIdleTime`; foram retidos apenas estado/tempo ocioso, nunca teclas ou tela. Bloqueio/suspensão físicos não foram provocados nesta rodada. Amostragem a cada 5 s; lacunas acima de 15 s encerram conservadoramente na última amostra. Em ambiente sem sinal disponível, a UI mostra a limitação.

#### Decisão sobre dedicação

A documentação atual informa que `UserPromptSubmit` também dispara em `/loop`, tarefas agendadas e mensagens de agentes, sem um discriminante humano confiável no contrato consultado. Portanto, o hook gera submissão/início de turno, **não** `human.interaction`.

A estimativa começa por **Registrar dedicação**, escolhendo um projeto local. Janela padrão de 5 min, configurável entre 1 e 60 min em Integrações. Alterar a janela reprocessa a estimativa preservando os sinais originais. `humanEstimatedMs` contém somente trechos atribuídos; `unassignedHumanMs` é apresentado separadamente. Ajustes auditáveis continuam em T22.

**Revisão em 09/11/2026 — regra `presence-split-v1`, pedida pelo usuário.** Substitui `explicit-signal-window-v1`:

- `turn.submit` de sessão raiz (sem `nativeAgentId`/`parentSessionId`) de Claude, Codex e OpenCode abre a mesma janela configurável no projeto do `cwd`. Ele não vira `human.interaction`; a decisão acima sobre o hook continua valendo.
- O observador macOS agora emite `machine.resume` na partida e ao sair de ociosidade/bloqueio/suspensão. A partir do primeiro retorno observado em cada máquina, prompts enviados entre `machine.idle` e `machine.resume` são ignorados, o que filtra automações com o usuário ausente. Antes desse marco (histórico legado) e em máquinas sem observação (Linux remoto), prompts contam sempre; não há como distinguir automações ali.
- Cada máquina mantém uma janela por projeto. O sinal explícito continua exclusivo: encerra as demais janelas da máquina.
- Trechos com projetos simultâneos, mesmo em máquinas diferentes, são divididos em partes iguais, inclusive a parte "sem projeto". O total humano nunca passa do relógio. A divisão é global, calculada antes dos filtros; antes, ambiguidade ia inteira para não atribuído.
- Testes: `tests/core/time.test.ts` ("dedicação por prompts…" e concorrência entre máquinas atualizada) e `tests/integration/recovery.test.ts` (retorno observado).

**Tempo manual aditivo (09/11/2026, migração `015_manual_time`).** "Lançar tempo" na Visão geral registra projeto, dia local, duração (1 min a 24 h, sem datas futuras) e nota opcional. Diferente do ajuste T22, **soma** à dedicação automática, não substitui intervalos e não afeta outros projetos. Fica em `TimeSummary.humanManualMs`, no CSV/PDF ("Dedicação humana lançada manualmente") e na prévia de exportação. Entra no período quando o início do dia local está dentro do filtro. A tabela é append-only (triggers), e a remoção é feita por registro compensatório (`removes`). API: `GET/POST /api/manual-time`, `POST /api/manual-time/:id/remove`. Testes: `tests/core/manual-time.test.ts`.

### T08 — API e painel

- `tests/integration/api-local.test.ts`: dois projetos, seleção, período `[from,to)`, paginação sem repetição, cursor inválido, limite máximo de 100, fonte sem credencial/configPath, cadastro inválido, foco e configuração da janela.
- `tests/e2e/first-use.spec.ts`: cadastro pela UI, hook CLI offline, reinício, sete eventos de contrato filtrados, sessão encerrada, detalhe, sinal/pausa de dedicação, atividade, erro de rede recuperável e período vazio. Desktop e celular.
- `tests/e2e/bootstrap.spec.ts`: autenticação, remoção do fragmento de bootstrap, reload, teclado, logout e ausência de erro JS/overflow em produção e desenvolvimento.
- Capturas em `test-results/` inspecionadas. Corrigida a abertura da sessão no celular: ação acessível na primeira coluna, sem exigir rolagem horizontal até uma última coluna de ações.
- A distribuição exibe até 20 projetos por consulta, com indicação do limite. Listas usam páginas de até 100. Ao expandir uma página na UI, o auto-refresh é pausado para preservar a navegação; o botão Atualizar volta à primeira página.

### Registro do M1 — observador OpenCode v1

- `opencode.ts` normaliza IDs, estados e tempos do armazenamento nativo da versão **1.19.5**. `opencode-store.ts` contém as queries de projeção; `node:sqlite` continua isolado em `core/sqlite.ts`, com conexão somente leitura separada.
- Conexão opt-in por raiz autorizada e sessão. Captura a partir do último pedido existente, sem importar outras sessões ou histórico anterior. Não altera plugins/configurações do OpenCode e não precisa reiniciá-lo.
- Eventos filtrados usam a mesma fila privada. O checkpoint avança somente após escrita durável; falha entre fila/checkpoint gera replay idempotente. Paginação de 100 mensagens/100 partes e janela de replay de 1 s preservam atualizações de partes sem criar outro turno.
- Não existe conversão de prompt em dedicação humana, de idle em sessão encerrada ou de conteúdo textual em evidência persistida.
- Testes em `tests/collectors/opencode.test.ts` e `tests/integration/opencode-local.test.ts`: conteúdo omitido, escopo autorizado, somente leitura/hashes, replay, falha de checkpoint, versão incompatível com erro visível, recuperação e desconexão sem perda de histórico.
- Smoke real em `scripts/smoke-opencode.ts`, sem chamada de modelo: observou esta sessão, conferiu fonte/sessão no painel, capturou desktop/mobile e preservou a base pessoal. Na fotografia de 14:04:09 UTC: 116 eventos, uma sessão e zero sinais humanos derivados de IA.
- Essa foi a conexão inicial do M1. Na etapa seguinte, o plugin v2 substituiu o comando manual para uso diário; a fonte v1 foi pausada e seu histórico permaneceu preservado.

## Limites ainda abertos

- Perfis Claude locais: opcionais; o fluxo real remoto 2.1.319 já foi comprovado.
- Piloto de um dia e cenários completos de T24 ainda pendentes; a automação cobre os workspaces expressamente autorizados em ambos os hosts.
- Ensaio manual de bloqueio/suspensão no macOS e validação visual pelo usuário.
- Disponibilidade durante desligamento/logout segue os limites dos serviços de usuário documentados em `AUTOMACAO.md`; coleta e sincronização já continuam com terminal/SSH fechados.
- Conferência de PR real e parsers históricos nativos adicionais permanecem pendentes. Backend/UI de PRs, histórico suportado, Git, revisões/diffs e CSV/PDF foram implementados e verificados; coleta pessoal depende do release efetivamente instalado.
- Configuração/orçamento/retenção/restauração de T23 foram implementados e verificados. Crescimento de um dia e aceite prolongado permanecem T24; não há promessa de throughput a partir da amostra limitada.

## Verificação reproduzível

### T10/T11 — arquivos, diffs e atualização dos coletores (06/11/2026)

- Menu **Arquivos**, revisões por hash, diffs sob demanda e histórico por identidade de arquivo. Save atômico, debounce de 500 ms, reconciliação de 30 s e renomes comprovados por identidade única. Política antes de persistir/consultar, roots aninhadas/pausadas, symlinks, binários, UTF-8 e limite de 2 MiB verificados.
- Lease de 120 s coordena os observadores do servidor e do agente. Gaps, captura parcial e conteúdo removido permanecem explícitos; a retenção automática ainda pertence a T23. Migrações aditivas 007/008, sem alterar migrações existentes.
- Navegação sessão → revisão → diff → commit e volta à sessão, com inferências visíveis e associação explícita prevalecendo. Os adapters atuais não preservam os caminhos editados nas chamadas; chamadas Edit e proximidade temporal não viram autoria certa.
- Protocolo `files-v1`, journal/cursor próprio, replay idempotente, integridade de conteúdo por hash, importação transacional e revogação por política. Exportação SSH lê dados persistidos; não inicia indexação longa na requisição. Orçamento de 10 s entre páginas e continuação do backlog. Ajustado o prazo de reinício do serviço Linux para respeitar encerramento da rodada.
- **47 testes aprovados: 27 unitários, 10 de integração e 10 E2E**, sem skips. Typecheck/build aprovados. Capturas desktop/mobile do histórico e do diff inspecionadas em `test-results/project-history-*/`.
- Serviços launchd local e systemd remoto atualizados e ativos. Release remoto confirmado: `207a9f087f7e347c3e1d`, Claude 2.1.319, identidade/cursor preservados. Na amostra de **19:42 UTC**, a central tinha **1.741 revisões locais e 1.950 remotas**, cursor de revisões **3.900**, sem erro de sincronização. O backlog inicial remoto/Git ainda estava em andamento e continua automaticamente.
- HTTP local iniciado em `127.0.0.1:4320`. Consultas autenticadas confirmaram lista local, revisões remotas e diff de uma edição real do README desta implementação. Pastas temporárias de ensaios anteriores já removidas são diagnosticadas como `FILE_ROOT_UNAVAILABLE`; os dados e cadastros não foram apagados.
- Uso, endpoints e limites em [ARQUIVOS.md](ARQUIVOS.md). CSV/PDF continuam no escopo já entregue; a incorporação das novas revisões/diffs aos relatórios permanece em T21. Alterações sem commit.

### Entrega adicional — commits e exportação (06/11/2026)

- Menus **Commits** e **Exportação** implementados. Coleta Git em lotes e consulta paginada; botão Reindexar Git, datas de autor/committer, parents, mensagens e arquivos elegíveis. Merge comparado ao primeiro parent, identidade repositório+SHA, refs atuais separados do histórico preservado após rebase/reset.
- Migração aditiva `006_git.sql`; a migração 005 da automação foi preservada. Nenhum commit Git foi criado nos repositórios pessoais como parte da coleta.
- Agentes atualizado local/remoto suportam coleta Git; protocolo `git-v1` pagina observações com cursor independente de eventos. Testado com transporte controlado e snapshots estáveis entre verificações sem mudanças. Não houve atualização automática do release remoto pessoal.
- Prévia e downloads reutilizam o mesmo `ReportData`, expiram em 15 min e exigem seleção explícita de projetos. Filtros de máquina, ferramenta e período compartilhados; CSV UTF-8/BOM, escaping e neutralização de fórmulas; PDF com fonte incorporada, acentos, paginação e links GitHub quando disponíveis. Notas/PRs/diffs completos continuam indisponíveis de forma explícita.
- **Validação final: 22 testes unitários + 8 de integração + 8 E2E = 38 aprovados**, sem skips. `npm run typecheck` e `npm run build` passaram. Downloads reais de dois entre quatro projetos e totais confirmados em desktop/mobile. PDF longo de nove páginas extraído e primeira/última página renderizadas; capturas do PDF e das telas inspecionadas em `test-results/exports-*/`.
- Procedimentos, limites e endpoints: [GIT-EXPORTACAO.md](GIT-EXPORTACAO.md). Reinicie o servidor existente para carregar as rotas novas. Fontes que ainda não existem não foram simuladas para concluir T20/T21 integralmente.

### Registro anterior — M1

Rodada de 06/11: **12 testes unitários + 6 de integração + 6 E2E = 24 aprovados**, sem skips; typecheck e build passaram. O smoke nativo OpenCode passou separadamente. Na rodada anterior eram 21 testes, com auditoria sem vulnerabilidades. Os smokes Claude falhos permanecem registrados como evidência da T05, separados do aceite M1 atual.

```sh
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Smoke nativo do M1, com o OpenCode local já instalado:

```sh
npm run smoke:opencode -- --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --session ses_e52e1e695ffehIwDvVlVDDW3qt
```

Capturas e relatório em `artifacts/m1-live/`, separados dos artefatos sintéticos de `test-results/`. A conferência visual pelo usuário pode ser feita no painel; não há dependência de conta Claude para seguir com este M1.
