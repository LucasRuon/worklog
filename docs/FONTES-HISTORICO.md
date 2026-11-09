# Fontes, perfis e histórico — T14/T15

## Ampliação posterior — 09/11/2026

O aceite T15 abaixo permanece preservado. Nova cobertura **somente por contrato/fixtures**: `opencode-log-v1` aceita gaps públicos de **2.2.6**, com `HISTORY_PUBLIC_LOG_GAPS`/complete=false; novo opt-in `codex-rollout-v4-0.167.0` importa MCP completed apenas com FunctionCall canônico namespaced de mesmo call_id. V1/v2/v3 não foram ampliados silenciosamente. Nenhuma nova amostra pessoal lida. Matriz das quatro classes, fontes fixadas e limites em [HISTORICO-CONTRATOS.md](HISTORICO-CONTRATOS.md); checklist `.checks/history-expansion.md`. Relatos anteriores de MCP/gaps não suportados descrevem aquele momento, não apagam esta ampliação nem constituem prova nativa nova.

## Aceite vigente da T15 — disponível e comprovado

Em 08/11/2026 o usuário aprovou explicitamente o fechamento pelo **histórico disponível e comprovado**, com lacunas visíveis, em vez de exigir cobertura nativa integral. **T15 concluída nesse aceite, com verificação independente PASS 4/4**, perfil light, em `.checks/t15-fechamento.verified.md`. O verificador reexecutou a recuperação real Codex, oito testes focados e typecheck; nenhum gap bloqueante no escopo acordado. Commits locais `fa121cc` e `b162071`, sem push.

- **Codex real recuperado:** `npm exec -- tsx scripts/smoke-codex-recovery.ts` lê somente os dez recibos filtrados de duas sessões de teste próprias (Worklog/Posicionadas). Recuperou **10/10 eventos**, replay após reabrir o store **zero**, duas sessões importadas/projetos corretos, seleção de um projeto retorna uma sessão, zero dedicação humana/revisões. Origem aberta read-only e hashes dos recibos originais inalterados. sourceId/installationId/eventId/horários preservados em store isolado, sem serviço ativo da identidade restaurada. Evidência local `artifacts/t15-recovery/codex-receipts.json`.
- **OpenCode nativo legado reconferido:** parser `opencode-db-1.19.5`, período 06/11 13:55–14:05 UTC: **46/46 IDs**, replay zero, resumo com 46 referências, zero sinais humanos/revisões. O ensaio usa origem somente leitura e destino temporário.
- **Normalizado das três ferramentas:** provas de identidade/proveniência/replay/live/período, truncamento e cancelamento/retomada existentes continuam verdes. Claude recebe histórico normalizado comprovado; isso não equivale a interpretar sua transcrição nativa opaca.
- **OpenCode v2:** parser do contrato público implementado/testado; logs reais consultados retornaram somente `log.synced`. Diagnóstico `HISTORY_UNAVAILABLE`, sem recuperação positiva alegada. Disponibilidade de um log com eventos não é criada pelo Worklog.
- **Rollout nativo Codex:** v1/v2/v3 preservados e verificados com fixtures contratuais; o smoke real acima comprova recibos, **não** ferramentas/linhagens dos rollouts. MCP, relações adicionais e formatos sem contrato continuam fora da cobertura declarada.

Não serão removidos warnings/saídas parciais dos parsers para fechar a tarefa. Esses limites deixam de bloquear **o aceite de histórico disponível escolhido pelo usuário**, sem se tornarem capacidades implementadas. Os registros cronológicos abaixo refletem os aceites mais amplos anteriores; esta seção define o aceite vigente.

**Restrição adicional identificada na pesquisa de fechamento:** `opencode-log-v1` exige sequência contígua. O contrato público OpenCode 2.2.6 pode omitir eventos não decodificáveis/fora do manifesto público e apresentar lacunas legítimas ([teste oficial](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/test/session-log.test.ts#L71-L92)); esse caso é conservadoramente recusado com `HISTORY_SEQUENCE_INVALID`, não suportado silenciosamente. Ampliar esse subconjunto é melhoria futura, fora do aceite disponível/provado acordado nesta rodada; nenhuma prova atual afirma importar logs públicos com lacunas. Sessões migradas também podem retornar somente `log.synced` legitimamente ([teste oficial](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/test/session-log.test.ts#L96-L120)). Export projetado não substitui o log, pois não contém os mesmos IDs de evento da coleta ao vivo.

Implementado em 07/11/2026. **Verificação independente PASS em 08/11**, incluindo cancelamento SIGINT/retomada CLI e smoke real legado 46/46 IDs, replay zero e zero revisões/sinais humanos fabricados. Relatório em `.checks/continuacao.verified.md`; pendências pessoais e parsers adicionais em `.checks/PROXIMA-SESSAO.md`.

**Continuação T15 em 08/11:** parser offline do log durável v2 implementado e verificado independentemente, **7/7 checks**, em `.checks/t15-opencode-log.verified.md`. Runtime instalado revalidado como **2.2.6**. O novo parser não altera o plugin/coleta ao vivo anteriormente validado para 2.2.5.

**Continuação Codex:** `codex-rollout-0.167.0` implementado para lifecycle de turnos de thread raiz, com horários explícitos e identidade compartilhada com hooks. Resultado sempre parcial (`HISTORY_LIFECYCLE_ONLY`); ferramentas, linhagens herdadas e Claude não são declarados cobertos. Gates completos: **92 unitários / 30 integração / 30 E2E**, typecheck/build aprovados. **Verificação independente PASS, 9/9 checks**, perfil light, rodada 2; relatório `.checks/t15-codex-rollout.verified.md` preserva o FAIL inicial e o fechamento de suas três lacunas. Nenhuma transcrição pessoal foi lida.

**Extensão Codex v2:** `codex-rollout-v2-0.167.0` acrescenta ferramentas comprovadas e filhos diretos com borda ordinal explícita, sem expandir silenciosamente o parser anterior. Gates atuais **122 unitários / 31 integração / 30 E2E**, typecheck/build aprovados. Checklist `.checks/t15-codex-items.md`; **verificação independente PASS, 8/8**, perfil light, em `.checks/t15-codex-items.verified.md`. Continua parcial, sem amostra histórica pessoal.

**Extensão Codex v3:** `codex-rollout-v3-0.167.0` acrescenta `DynamicToolCall` completed/success=true com nomes canônicos e horários explícitos. **Verificação independente PASS, 5/5**, perfil light, em `.checks/t15-native-extension.verified.md`. Checklist pré-build e investigação oficial em `.checks/t15-native-extension.md`; gates completos do builder **158 unitários / 32 integração / 30 E2E**, typecheck/build aprovados; verifier executou 104 unitários + 4 integrações focados e typecheck/build. V1/v2 preservados. MCP, demais ferramentas/linhagens e Claude permanecem delimitados abaixo; nenhuma recuperação histórica pessoal foi alegada.

## Fontes e contas

Integrações permite cadastrar ferramenta, perfil, caminho absoluto da configuração e versão instalada. O cadastro não instala hooks nem concede confiança. Os instaladores CLI continuam sendo o caminho explícito para instrumentação.

Cada instalação/ferramenta/caminho mantém fonte própria. Duas contas com o mesmo ID nativo de sessão não se confundem. O navegador recebe somente metadados permitidos: máquina, ferramenta, perfil, versão, compatibilidade, presença/ausência da configuração, atividade recebida, atraso remoto e códigos recuperáveis. Não recebe `configPath`, credenciais ou conteúdo dos arquivos de configuração.

- **Sem dados:** nenhum evento recebido; a existência de configuração não comprova coleta.
- **Eventos recebidos:** há evidência preservada, não promessa de conexão contínua.
- **Configuração ausente:** histórico permanece; verifique o perfil na máquina de origem.
- **Versão não suportada:** revalidar o adapter; não há interpretação automática de schemas futuros.
- **Pausada:** novas capturas locais são negadas no manifesto. A pausa central de fonte remota também impede confirmar lotes que a contenham; o backlog/cursor é conservado até a retomada.
- **Instrumentação removida:** tombstone preserva origem e eventos. Habilitar novamente exige reinstalação explícita pelo CLI, que limpa esse tombstone.

Pausa/retomada usa revisão otimista; outra alteração retorna `409 SOURCE_CHANGED`. A sincronização de cadastros não desfaz a pausa central. Remover instrumentação é ação separada, confirmada na interface e limitada à instalação local; hooks alheios, wrappers de outra instalação e histórico não são apagados. Remover instrumentação remota deve ser feito na origem.

O filtro **Fonte / perfil** participa de sessões, atividade, totais e relatórios por `ReportFilter.sourceIds`. A ambiguidade humana global continua calculada antes do filtro. Commits/arquivos/PRs independentes não são atribuídos à conta apenas por proximidade; ficam fora da seleção por fonte quando não existe autoria comprovada.

## Importar registros disponíveis

| Parser | Cobertura |
|---|---|
| `normalized-v1` | JSONL exportado pelo Worklog: header versionado + `EventInput` v1, para Claude/Codex/OpenCode; preserva identidade/horário e exige a mesma origem registrada |
| `codex-receipts-v1` | Recibos locais filtrados do adapter Codex 0.167.0; seleção automática quando a fonte não tem input configurado |
| `codex-rollout-0.167.0` | JSONL nativo 0.167.0 escolhido explicitamente; lifecycle de turnos de thread raiz, sem forks/contexto herdado, com horários de execução explícitos; resultado parcial obrigatório |
| `codex-rollout-v2-0.167.0` | Opt-in separado: turnos raiz + `CommandExecution`/`FileChange` completed paginados e filhos diretos comprovados; ignora prefixo herdado e mantém resultado parcial |
| `codex-rollout-v3-0.167.0` | Opt-in separado: cobertura v2 + `DynamicToolCall` completed/success=true paginado; nomes canônicos/call_id compartilhados com hooks, horários explícitos; parcial |
| `codex-rollout-v4-0.167.0` | Opt-in separado: v3 + MCP completed com FunctionCall namespaced próprio de mesmo call_id; nome canônico preservado, nunca deduzido de server/tool; parcial |
| `opencode-db-1.19.5` | Banco legado somente leitura, schema e versão conferidos; projeta apenas IDs, estados e tempos de sessões/mensagens/ferramentas autorizadas |
| `opencode-log-v1` | Log durável nativo SSE de sessão OpenCode 2.2.5/2.2.6, envelope `durable.version=1`; mesmos IDs/projetor do plugin, contexto de ferramenta e origem preservados |
| `git-v1` | Para uma fonte Git registrada internamente, reutiliza a indexação existente em lotes; no uso diário, `npm run cli -- collect` já indexa as raízes Git autorizadas sem exigir fonte manual. Git indexa objetos do repositório e a consulta/relatório aplica o período, sem gerar horas |

**Limite importante:** transcrições privadas Claude/Codex e o SQLite v2 não são reinterpretados como contratos antigos. OpenCode v2 passa a ter o caminho do log durável público, quando disponível; export de transcrição JSON não é esse log. Ausência de input/recibos/log recuperável retorna `HISTORY_UNAVAILABLE`. Recuperação positiva de histórico v2 real ainda pendente; M3 não deve ser declarado integralmente aceito, nem a pendência nativa do Codex T12 é apagada.

### Contratos nativos investigados na revisão de pendências

Somente documentação/schema/versionamento foram consultados; nenhuma transcrição pessoal ou credencial foi aberta. Estes achados fundamentaram o recorte Codex abaixo, **não uma cobertura histórica integral**:

- **Codex CLI 0.167.0:** contrato oficial versionado na tag [`rust-v0.167.0`](https://github.com/openai/codex/tree/rust-v0.167.0), commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`. [`rollout_payload.rs`](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/history/src/rollout_payload.rs) define envelopes `type/payload` (`session_meta`, `turn_context`, `event_msg`); [`history/src/lib.rs`](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/history/src/lib.rs) define timestamp/ordinal. [`protocol.rs`](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/protocol.rs) fornece versão/cwd/IDs/parentesco e lifecycle `task_started`/`task_complete` (aliases `turn_started`/`turn_complete`), com horários opcionais.
- **Limite Codex:** [`rollout/src/policy.rs`](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/rollout/src/policy.rs) distingue persistência legacy/paginated; início de item/ferramenta e fim de sessão não são garantidos. Timestamp externo é horário de escrita, não necessariamente execução. A correlação de turnos raiz com hooks já foi implementada; cobertura de forks/contexto herdado e arquivos comprimidos/paginados externos continua fora do recorte. Não usar outro sourceId para esconder duplicação; não fabricar pares/horários ausentes.
- **Claude Code 2.1.318/2.1.319:** os pacotes oficiais [`claude-agent-sdk@0.3.318`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/package.json) e [`@0.3.319`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/package.json) declaram as versões correspondentes de Claude Code. Seus tipos [`0.3.318/sdk.d.ts`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/sdk.d.ts) e [`0.3.319/sdk.d.ts`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/sdk.d.ts) fornecem inventário de sessão, mas declaram a união JSONL concreta interna à CLI e o payload opaco. Não bastam para reconstruir turnos/ferramentas/horários completos; modificação de arquivo não é encerramento de sessão. Histórico normalizado/filtrado existente continua sendo o caminho comprovado.

Os recortes Codex descritos abaixo implementam lifecycle de turnos raiz e sobreposição live; v2 acrescenta ferramentas e filhos diretos comprovados, v3 chamadas dinâmicas delimitadas. Ferramentas/linhagens fora desses recortes e amostra histórica nativa real continuam pendentes; Claude aguarda contrato suficiente. Isso não depende de conceder confiança silenciosamente aos hooks da T12.

## Rollout Codex 0.167.0 — contrato v1 preservado

```sh
npm run cli -- history configure --source-id UUID --parser codex-rollout-0.167.0 --input '/caminho/privado/rollout.jsonl'
npm run cli -- history import --source-id UUID --from '2026-11-05T00:00:00.000Z' --to '2026-11-06T00:00:00.000Z'
```

O arquivo precisa ser escolhido explicitamente para uma fonte Codex local habilitada, versão 0.167.0, e começar com `session_meta` da mesma versão e raiz autorizada. Não há descoberta de transcrições nem leitura de diretórios pessoais. Não usar um sourceId novo para esconder duplicação com hooks existentes.

Marcadores nativos de subagente/revisão em `source`/`thread_source`, fontes custom/internal não comprovadas como raiz e `thread_id` divergente em qualquer evento/contexto são recusados no preflight, antes de gravar um novo prefixo de eventos/recibos. Dados já importados não são apagados para acomodar arquivo alterado.

- **Cobertura:** `task_started`/alias `turn_started`, `task_complete`/alias `turn_complete`, e `turn_aborted` com `reason=interrupted`. Preserva falha de task_complete quando `error` está presente, sem copiar o erro bruto. Interrupção não é fim de sessão.
- **Horários:** usa somente `started_at`/`completed_at` positivos, inteiros em segundos Unix. Timestamp externo do JSONL é de escrita e nunca gera duração. Campo ausente/zero retorna `HISTORY_TIMESTAMPS_UNAVAILABLE`, sem derivar horário por `duration_ms`. Pares ausentes continuam incompletos; horário de início declarado somente no registro final não é transformado em um evento adicional neste recorte.
- **Diretório:** `turn_context` por ID de turno é resolvido antes de emitir suas bordas, mesmo quando vem depois de task_started. Contextos conflitantes são recusados. Snapshot global thread_settings_applied com cwd diferente do inicial é recusado neste recorte, em vez de supor a quais turnos se aplica.
- **Identidade:** IDs de turn.start/end/interrupção são os mesmos dos hooks correspondentes. O parser não inventa `turn.submit`, session.start/end, eventos humanos ou revisões. Metadados de criação de sessão não são um hook de início; a projeção de sessão continua sinalizando incompletude.
- **Primeiro recibo durável:** hook e importador usam recibo privado individual `[EventInput]` no diretório existente `codex-receipts/`. Criação exclusiva por hard link escolhe o primeiro evento entre processos, mesmo offline. Preserva o horário de recibos antigos em batch; replay/live não mudam um evento imutável. Corpo divergente além do horário retorna `HISTORY_EVENT_CONFLICT` na importação ou `CODEX_EVENT_CONFLICT` no hook fail-open. Não se troca um resultado conhecido por outro para fazer o import passar.
- **Período e persistência:** seleção `[from,to)` usa o horário canônico da primeira captura. Política/fonte/raiz são conferidas antes de criar o recibo. Eventos, proveniência e checkpoint continuam transacionais; falha de append deixa recibo normalizado recuperável pelo caminho já existente. Backup/restore continua incluindo o diretório de recibos.
- **Limites:** arquivo regular somente leitura, sem symlink final, até **64 MiB / 10000 linhas / 1 MiB por linha**, UTF-8 válido. Ordinais fornecidos devem ser contínuos. Mudança de tamanho/mtime durante a leitura é recusada; linha final truncada é diagnosticada e pode ser completada/retomada. A retomada relê o snapshot delimitado e deduplica por IDs; não há offset que perca o contexto.
- **Fora do recorte:** subagentes/forks/revert/herança (`history_base` e marcadores relacionados), páginas externas, arquivos comprimidos, lifecycle de ferramentas, razões de aborto diferentes de interrupted e schemas desconhecidos. Não transformar output textual em evidência de êxito.

**Resultado parcial intencional:** `HISTORY_LIFECYCLE_ONLY` acompanha toda importação desse parser, inclusive replay; `complete=false` e CLI **exit 1**, embora `imported` indique os eventos recuperados com sucesso. Isso vale também com `HISTORY_MORE_AVAILABLE`: repetir o comando continua a importação, mas não torna a cobertura integral. Outros parsers mantêm sua convenção existente de exit0 para continuação por limite. Isso não encerra T15/M3 nem substitui o smoke pessoal Codex T12. Sem novas tabelas, dependências ou endpoints.

### Opt-in v2 — ferramentas e filhos diretos

```sh
npm run cli -- history configure --source-id UUID --parser codex-rollout-v2-0.167.0 --input '/caminho/privado/rollout.jsonl'
npm run cli -- history import --source-id UUID --from '2026-11-05T00:00:00.000Z' --to '2026-11-06T00:00:00.000Z'
```

- **Ferramentas:** `event_msg/item_completed` em histórico `paginated`, ordinais explícitos e contínuos. `CommandExecution` com `source=unified_exec_startup`/`status=completed` mapeia para `Bash`; `FileChange`/`completed` para `apply_patch`. O ID nativo é o call_id dos hooks. Só `started_at_ms`/`completed_at_ms` positivos geram bordas; zero/ausente não é reconstruído de duration ou timestamp externo. Diretório é o contexto host do turno, não cwd/paths privados da ferramenta.
- **Privacidade/identidade:** comandos, outputs e diffs são descartados. PreToolUse/PostToolUse usam os recibos existentes, preservando o primeiro horário nas duas ordens e conflitos de corpo. Conclusão de chamada não comprova que comando/teste passou. Não cria revisões, foco, submissão ou lifecycle de sessão.
- **Filho direto:** metadata inicial exige UUIDs root/child distintos, `session_id=root`, `parent_thread_id=root`, `source.subagent.thread_spawn` com pai igual à raiz e `depth=1`, modo paginado e `subagent_history_start_ordinal` positivo. O prefixo abaixo dessa borda é ancestral e não participa de projeção/autorização de contextos próprios; continua contado nos limites do leitor. Não segue `history_base` nem abre páginas/arquivos referenciados. Ausência de faixa própria retorna `HISTORY_OWN_HISTORY_UNAVAILABLE`.
- **Preflight:** contexto próprio externo/pausado, symlink externo, thread divergente tardia e segunda metadata própria são recusados antes de eventos/recibos. Filho usa `agent_id=child`, sessão/pai raiz e término `SubagentStop`, não `Stop`. Pai/filho com mesmo turn_id não se confundem; intervalos paralelos são acumulados por agente e unidos para tempo de relógio, sem tempo humano.
- **Limitações explícitas:** tipos/source/status de ferramenta não suportados retornam `HISTORY_TOOL_TYPE_UNSUPPORTED`, `HISTORY_TOOL_SOURCE_UNSUPPORTED`, `HISTORY_TOOL_STATUS_UNSUPPORTED`; ferramenta em história não paginada/sem ordinal retorna `HISTORY_TOOL_HISTORY_UNSUPPORTED`. MCP/dynamic/extensions, failed/declined/in_progress, user_shell/interações e descendentes aninhados/review/internal permanecem fora. Interrupção de filho não tem agent_id comprovado no hook: `HISTORY_CHILD_INTERRUPT_UNAVAILABLE`, sem fabricar interrupção da raiz.
- **Operação:** limites, leitura readonly, proveniência, replay/cancelamento/retomada e período canônico permanecem os do v1. `HISTORY_LIFECYCLE_ONLY`, `complete=false` e CLI exit1 continuam obrigatórios, inclusive com limite. O nome do aviso é mantido por compatibilidade; não significa cobertura integral nem ausência de ferramentas no v2.

Provas: `tests/collectors/codex-history-items.test.ts` e `tests/integration/codex-history-items-cli.test.ts`. Nenhum histórico pessoal foi usado; fixtures e processos de teste não encerram T15/T12/T24.

### Opt-in v3 — chamadas dinâmicas comprovadas

```sh
npm run cli -- history configure --source-id UUID --parser codex-rollout-v3-0.167.0 --input '/caminho/privado/rollout.jsonl'
```

Importação usa o mesmo comando/período do v2. Além da cobertura v2, aceita `event_msg/item_completed` com `item.type=DynamicToolCall`, `status=completed` e `success=true`. [Contrato DynamicToolCall](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/items.rs#L294-L321) e [emissor versionado](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/handlers/dynamic.rs#L190-L275) comprovam ID=call_id e estado.

- **Nome do hook:** namespace ausente/null/vazio/`functions` usa `tool`; demais namespaces concatenam literalmente `namespace + tool`, sem acrescentar ponto. `multi_agent_v1` + `spawn_agent` usa `spawn_agent`. Regras oficiais em [registry.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/registry.rs#L1129-L1138) e [flat_tool_name](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/mod.rs#L47-L64). Segmentos não vazios e nome final limitados a 1–160 caracteres `[A-Za-z0-9_.:-]`; fora disso, `HISTORY_RECORD_INVALID`, sem copiar texto bruto.
- **Bordas:** somente `started_at_ms`/`completed_at_ms` explícitos positivos. Campo ausente/zero mantém aviso e apenas a borda disponível; duração/timestamp externo não geram execução. failed/in_progress ou success ausente/false => `HISTORY_TOOL_STATUS_UNSUPPORTED`.
- **Privacidade e replay:** argumentos/resultados descartados; mesmo normalizador, contexto host, autorização, recibos e primeiro horário durável do live. Não cria sessão, revisão ou tempo humano. Filhos diretos continuam com a borda ordinal v2; não estende linhagem. `HISTORY_LIFECYCLE_ONLY`, complete=false e CLI exit1 continuam obrigatórios.
- **MCP ainda bloqueado:** [ToolInfo](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/codex-mcp/src/tools.rs#L34-L60) contém callable_name/callable_namespace distintos de server/tool originais guardados em McpToolCall. O [handler](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/handlers/mcp.rs#L139-L165) constrói o nome do hook a partir desses campos canônicos. Não assumir `mcp__server__tool` sem provar o mapeamento das variantes.
- **Linhagens ainda bloqueadas:** SessionMeta distingue raiz (`session_id`), pai imediato, prefixo físico (`history_base`) e limite lógico de fork; revert pode trocar o prefixo físico. O normalizador Worklog atribui parentSessionId à raiz; importar descendentes aninhados como filhos diretos perderia parentesco. Necessita recorte próprio, sem alterar silenciosamente a semântica aprovada.
- **Claude 0.3.318/319 reconsultado:** `SessionMessage` oferece `message:unknown` e `parent_agent_id` nullable, mas não horário de execução; null também representa metadado ausente. `SessionStoreEntry` declara união CLI-internal e timestamp opcional; inventário/listSubagents não estabelece bordas nem identidade de hooks. Mantém-se investigação bloqueada para parser nativo, não uma alegação de inexistência de histórico.

Provas sintéticas: `tests/collectors/codex-history-native.test.ts` e `tests/integration/codex-history-native-cli.test.ts`. Worklog/Posicionadas continuam pilotos autorizados, sem leitura de transcrições, alteração de perfis/stores pessoais ou conclusão de aceite real nesta rodada.

Para localizar o ID da fonte, consulte Integrações/API autenticada. Configure e importe um arquivo normalizado:

```sh
npm run cli -- history configure --source-id UUID --parser normalized-v1 --input "/caminho/historico.jsonl"
npm run cli -- history import --source-id UUID --from "2026-11-05T00:00:00.000Z" --to "2026-11-07T00:00:00.000Z"
```

Exportar metadados normalizados já preservados, sem sobrescrever o destino:

```sh
npm run cli -- history export --source-id UUID --from "2026-11-05T00:00:00.000Z" --to "2026-11-07T00:00:00.000Z" --output "/caminho/arquivo-novo.jsonl"
```

O formato começa com:

```json
{"format":"worklog-history","schemaVersion":1,"tool":"claude","version":"2.1.318"}
```

As linhas seguintes são eventos normalizados v1 da mesma fonte/instalação. Campos extras, sinais humanos, revisões de arquivos e origem divergente são recusados. Não editar IDs/horários para contornar conflitos.

## Log durável nativo OpenCode v2

Contrato confirmado no OpenAPI do servidor **2.2.6**, por `opencode api GET /openapi.json`: GET `/api/experimental/session/{sessionID}/log?follow=false`, resposta **SSE** (`text/event-stream`). Não há consulta de rede automática ao configurar/importar o parser; o input é um arquivo local escolhido explicitamente.

Para obter o arquivo, uma leitura explícita do CLI nativo pode ser direcionada a um arquivo privado fora das raízes monitoradas:

```sh
(umask 077; opencode api GET '/api/experimental/session/SESSION_ID/log?follow=false' > '/caminho/privado/session.sse')
npm run cli -- history configure --source-id UUID --parser opencode-log-v1 --input '/caminho/privado/session.sse'
npm run cli -- history import --source-id UUID --from '2026-11-06T00:00:00.000Z' --to '2026-11-09T00:00:00.000Z'
```

- Fonte deve ser OpenCode da instalação local, habilitada, com versão **2.2.5 ou 2.2.6**, igual à versão original declarada em `session.created.data.version`. Não mudar a versão de uma fonte coletora apenas para aceitar o arquivo.
- Input exige início da sessão (`session.created`), identidade consistente, IDs únicos e sequência durável crescente; cada envelope tem `durable.version=1`. Em **2.2.5** a sequência continua contígua e marcador igual à última sequência. Em **2.2.6** gaps públicos internos/finais são aceitos com `HISTORY_PUBLIC_LOG_GAPS`/complete=false; `log.synced.seq` deve ser inteiro >= último seq e ter mesma identidade. Isso não autentica se um frame público foi removido manualmente. Log iniciado no meio, truncado ou desconhecido continua recusado.
- Autoriza a raiz antes de projetar os demais eventos; mudança de diretório reaplica autorização. Não cadastra automaticamente pastas trazidas pelo histórico. Roots pausadas/externas e fontes pausadas continuam negadas.
- Captura do arquivo SSE pode conter dados privados da ferramenta; o importador preserva somente a projeção permitida. Prompts/args/resultados não entram no banco Worklog, warnings, revisões ou relatórios.
- IDs usam o mesmo `normalizeEvent`/`projectV2Event` do plugin. Replay e sobreposição ao vivo não duplicam eventos; caminhos são canonicalizados pela política compartilhada, incluindo aliases por symlink.
- Nome de ferramenta é recuperado de `session.tool.input.started`. Turno/ferramenta falhos, interrupção e compactação preservam os estados originais. Eventos de idle, execução concluída ou arquivamento não encerram uma sessão por suposição nem produzem dedicação humana.
- Limites: **64 MiB por arquivo, 1 MiB por frame SSE e 10000 frames de dados**. Symlink de input recusado; leitura de snapshot detecta mudança de tamanho/mtime durante a leitura.
- Retomada relê o log desde o início para reconstruir contexto/nome das ferramentas e pula IDs já persistidos. O limite por inserções da CLI permanece; nenhum offset cego perde o contexto. Custo é linear no log delimitado.
- `complete` confirma consumo do input disponível até seu watermark, não toda a história de uma ferramenta. Log contendo apenas `log.synced` retorna **`HISTORY_UNAVAILABLE`, complete=false**.

Correção do teste de watermark aprovada explicitamente pelo usuário nesta ampliação: watermark superior não é corrupção em2.2.6; a prova negativa usa marcador regressivo e novas provas positivas/negativas cobrem gaps e integridade. A limitação a contíguos mencionada no relato do fechamento anterior foi ampliada apenas para2.2.6, sem reescrever o aceite anterior. Não há marca-d'água visual; watermark é posição técnica.

### Prova real delimitada da continuação

`npm run smoke:opencode-history` lê **uma sessão explicitamente autorizada**, somente GET, e redige campos antes de escrever metadados no store/fixture temporários. Não faz pedido de modelo nem altera sessão/configuração da ferramenta. A sessão v2 existente deste projeto retornou um único frame `log.synced`: **zero eventos importados, replay zero, complete=false, HISTORY_UNAVAILABLE, nativeHistoryProven=false**. Isso comprova diagnóstico de ausência, não recuperação histórica positiva.

```sh
npm run smoke:opencode-history -- --session ses_e4e74febcffeVbMLOB7emzsJLn --root '/Users/lucasruon/Downloads/Sistemas/Worklog' --from '2026-11-06T00:00:00.000Z' --to '2026-11-09T00:00:00.000Z'
```

Provas: `tests/collectors/opencode-history.test.ts` e `tests/integration/opencode-history-cli.test.ts`. Gates independentes desta entrega: typecheck/build, **50 unitários, 26 integração e 28 E2E**, sem skips. O suporte histórico offline 2.2.6 não comprova compatibilidade/ativação do plugin pessoal ao vivo nessa versão.

## Retomada e proveniência

- Intervalos de eventos usam `[from,to)`, com UTC explícito. Não reconstruir foco ou versões pré-commit.
- Padrão de 500 inserções por chamada; `--limit` aceita 1–10000. `HISTORY_MORE_AVAILABLE` pede repetir o mesmo comando.
- Ctrl+C interrompe após o último evento confirmado; a próxima execução retoma. Evento, proveniência e checkpoint são gravados na mesma transação.
- JSONL conserva offset, identidade e hash do prefixo. Linha final sem newline retorna `HISTORY_TRUNCATED`, sem confirmar essa linha; append posterior pode recuperar. Arquivo substituído/editado reinicia por IDs, sem duplicar.
- Native/recibos/log v2 usam IDs persistidos como checkpoint. Os leitores percorrem novamente metadados já conhecidos para preservar contexto; custo linear no histórico delimitado. O banco de origem não é copiado nem alterado.
- Limites explícitos: 1 MiB por linha, 64 MiB por arquivo normalizado, 10 mil sessões na enumeração legada e 10 mil eventos por exportação.
- `complete` significa que os **registros disponíveis desse input** foram consumidos, não que toda a história da ferramenta foi recuperada. Sessões com pares ausentes continuam incompletas.
- Proveniência `observed`, `imported` ou `mixed` é exposta na sessão/detalhe; seleção com histórico recebe aviso no painel e relatório. CSV/PDF identificam a origem histórica e não convertem execução em dedicação humana.

## Endpoints

| Método | Rota | Contrato |
|---|---|---|
| GET | `/api/sources` | Allowlist de diagnósticos, última atividade, revisão e resultado de importação; sem caminho/configuração bruta |
| POST | `/api/sources` | `{tool,profile,configPath,version}`; cadastro local idempotente, sem instalar instrumentação |
| PATCH | `/api/sources/:id` | `{enabled,revision}`; 409 em revisão obsoleta ou reinstalação necessária |
| POST | `/api/sources/:id/remove` | `{revision}`; remoção seletiva local e histórico preservado |

Todas as rotas exigem autenticação/Host/Origin conforme a API existente. Importação longa é CLI nesta entrega. Novas telas de acompanhamento amplo pertencem a T20/T23.

## Provas locais

- `tests/integration/sources.test.ts`: cadastro, duas contas, filtros/totais, privacidade, pausa, revisão, remoção e backlog remoto.
- `tests/e2e/sources.spec.ts`: cadastro, pausa por teclado, retomada e filtro de fonte, desktop/mobile. Capturas em `test-results/sources-*/`.
- `tests/collectors/history.test.ts`: três ferramentas, limites do período, live+import, truncamento, formato desconhecido, timestamp inválido, cancelamento, escopo e SQLite somente leitura.
- `tests/integration/history-cli.test.ts`: exportação/importação em processos compilados, path com espaços, replay e erro sem conteúdo bruto.
- Smoke real em store temporário: **46 IDs normalizados esperados e 46 importados**, zero inserções no replay, zero eventos humanos/revisões; resumo com `evidence-summary-v1` e 46 referências válidas. Origem: legado OpenCode do Worklog, período **06/11/2026 13:55–14:05 UTC**. A contagem de metadados lidos pode crescer, pois o banco nativo continua em uso.

```sh
npm run smoke:history -- --database "$HOME/.local/share/opencode/opencode.db" --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --from "2026-11-06T13:55:00.000Z" --to "2026-11-06T14:05:00.000Z"
```
