# Codex — integração local T12

## Ampliação histórica posterior — 09/11/2026

Novo opt-in `codex-rollout-v4-0.167.0`: recortes v3 + MCP completed correlacionado pelo call_id com `response_item.function_call` namespaced próprio, cujo nome canônico corresponde ao dispatcher/hook; exige adicionalmente history_base ausente/null na raiz e no filho. Sem par, `HISTORY_MCP_IDENTITY_UNAVAILABLE`; nunca concatenar nomes MCP brutos server/tool. Primeiro recibo/horário durável, privacidade e conflitos são preservados; parcial/exit1 sempre. Provas **apenas contratuais/fixtures**, sem novo ensaio nativo ou reinstalação de hooks.

Linhagens adicionais investigadas, mas **ainda não suportadas**: raiz, pai imediato e prefixo físico/lógico são distintos; hooks não expõem pai imediato e o normalizador/projeção atuais atribuem a raiz. Não achatar aninhados nem reescrever eventos/recibos imutáveis. Resume simples reutiliza IDs; fork/revert/páginas externas não são declarados suportados. Matriz e contratos oficiais fixados em [HISTORICO-CONTRATOS.md](HISTORICO-CONTRATOS.md). O fechamento T15 disponível/comprovado permanece; parágrafos anteriores abaixo são cronológicos.

Implementação em 06/11/2026. Contrato validado: **Codex CLI 0.167.0** (a instalação passou de 0.166.0, inventariada em T01, para 0.167.0). Outras versões são recusadas até revalidação. O aplicativo desktop não foi encontrado nos paths inventariados; não foi marcado como ativo.

## Estado

**Captura pessoal em 08/11, 22:41 BRT (09/11 UTC):** revisão dos dez comandos Worklog pela API nativa `hooks/list` + `config/batchWrite`, o mesmo mecanismo usado pelo `/hooks` da CLI 0.167.0. Usuário autorizou expressamente a operação; não foi usado bypass. Releitura confirmou dez `trusted`, definições/estados alheios intactos e `hooks.json` byte-idêntico (SHA-256 `62691443fb40ffb19c653c4516de3d75426d3d0cf4c5cd6614bb4b324a52777d`). A confiança fica no config local pelo mecanismo nativo, não em uma conta remota.

O ensaio inicial sem modelo não disparou `session.start` e falhou; recebeu somente `session.end`. Essa falha está preservada em `artifacts/codex-local-native/verification.json`. Antes de continuar, o usuário autorizou dois turnos mínimos de modelo — um por projeto, "Responda apenas OK, sem ferramentas nem alterações". Ambos terminaram `completed`, com cinco eventos reais cada: session.start, turn.submit, turn.start, turn.end e session.end, fonte/máquina e associação aos projetos Worklog e Posicionadas conferidas. Zero tool.start/tool.end nessas sessões; não comprova ferramentas/subagentes reais.

Evidências: `artifacts/codex-local-native/verification-live.json`; checklist `.checks/codex-native-trust.md`; script opt-in `scripts/codex-native-review.mjs`. Execução padrão do script é somente inventário; `--self-test` confere rejeição de definições divergentes; `--approve --live-turns` altera confiança e solicita modelo, portanto não deve ser repetido como regressão automática. Sessões de teste foram arquivadas pelo Codex, sem exclusão de histórico. **Verificação independente PASS 3/3**, perfil light, em `.checks/codex-native-trust.verified.md`, confirmando os dez eventos no SQLite somente leitura e confiança atual na API. Não repetiu modelos/aprovação; preservação histórica do trust alheio depende das assertions/relatórios da execução.

Os parágrafos históricos abaixo descrevem o estado anterior à revisão/captura nativa acima; não significam que o usuário ainda precisa executar `/hooks` para os mesmos dez hashes.

**Instalação local autorizada em 08/11 22h BRT (09/11 UTC):** instalados os dez hooks Worklog em `/Users/lucasruon/.codex/hooks.json`, usando o Node/CLI/store deste Mac. Comparação read-only com o backup `hooks.json.worklog-backup-b8d25512-9c73-403c-8a68-e97edaadba0b` confirmou preservação dos quatro handlers anteriores e dos campos fora de hooks; timeout 2 s nas dez definições gerenciadas. Nenhuma instalação em conta remota/nuvem; confiança continua pendente da revisão pelo usuário em `/hooks`. Esta nota substitui o estado histórico de configuração pessoal não alterada abaixo, mas não comprova captura real.

Adapter, instalação/remoção, fila offline, replay e projeções implementados. **Aceite nativo de sessão real ainda pendente da revisão de confiança no Codex.** O smoke isolado usa o app-server distribuído pela própria CLI para validar descoberta/configuração: dez hooks reconhecidos, timeout 2 s, `trustStatus=untrusted`, zero eventos e zero requisições de modelo. Isso comprova compatibilidade de configuração e preservação da confiança; não comprova coleta ao vivo.

Não foram instalados hooks na configuração pessoal nesta execução. Não houve cópia de autenticação, importação de transcrição ou alteração de políticas/trust.

## Ativar no perfil escolhido

Após `npm run build`, cadastre uma raiz autorizada (ou reutilize as raízes/workspaces já autorizados) e instale:

```sh
npm run cli -- hooks install --tool codex --config "$HOME/.codex/hooks.json" --profile default
```

Para outro `CODEX_HOME`, passe seu `hooks.json` correspondente. Cada arquivo/perfil é uma fonte distinta. Os argumentos `--data-dir` ou `WORKLOG_DATA_DIR` devem apontar para a mesma base do serviço/painel.

1. Abra o Codex e use **`/hooks`**.
2. Revise as dez definições Worklog: executável Node absoluto, `dist/cli/index.js hook --worklog-codex-v1`, diretório de dados e ID da fonte. Conceda confiança pelo fluxo nativo somente depois da revisão.
3. Se hooks estiverem desabilitados por configuração/política, a instalação não os habilita. Uma alteração no comando/hash exige nova revisão nativa.
4. Inicie uma sessão curta na raiz autorizada; consulte a fonte e a sessão no painel. Com o serviço ativo, o consumo da fila é automático. Sem serviço, `npm run cli -- collect` consome a fila.

Somente considerar a fonte observada depois de receber eventos. A presença de `hooks.json`, login disponível ou sucesso do smoke de descoberta não comprova observação. Registre a sequência real e o projeto para concluir o último checkbox de T12.

Pausar/remover somente a instrumentação Worklog desse perfil:

```sh
npm run cli -- hooks remove --tool codex --config "$HOME/.codex/hooks.json"
```

Histórico permanece preservado. Hooks alheios e fontes de outra instalação permanecem intactos. O instalador usa lock exclusivo, backup privado e verificação contra alteração concorrente de `hooks.json`; não reescreve `config.toml` nem concede confiança.

## Contrato e limites

| Hook | Evento normalizado |
|---|---|
| SessionStart | session.start (startup/resume/compact/unknown) |
| SessionEnd | session.end (other) |
| UserPromptSubmit | turn.submit + turn.start |
| PreToolUse | tool.start |
| PostToolUse | tool.end (chamada concluída; não significa teste aprovado) |
| Stop | turn.end |
| Interrupt | turn.end (interrupted) + session.interrupt |
| SubagentStart | session.start do agente, sem abrir outro turno com o ID do pai |
| SubagentStop | turn.end do agente; não presume destruição/encerramento da sessão |
| PreCompact | marcador session.start (compact), sem fabricar duração |

O `session_id` compartilhado do pai é separado pelo `agent_id`, inclusive nas ferramentas/submissões do subagente. A primeira evidência conserva o vínculo com o pai. A submissão não gera dedicação humana.

O contrato de hooks dessa versão não fornece timestamp/ID universal de entrega. Usa-se **horário observado pelo coletor**, não horário histórico exato. Turnos e ferramentas têm IDs estáveis por fonte/sessão/agente/hook/turno/chamada. Recibos privados normalizados em `codex-receipts/` preservam ID e horário da primeira captura, antes do enfileiramento; retry não muda um evento imutável. A continuação T15 usa recibos individuais `[EventInput]` compartilhados entre hook e histórico, com criação exclusiva entre processos e compatibilidade com batches antigos. Se o histórico foi a primeira captura, seu horário explícito permanece; se foi o hook, permanece o observado. Divergência de corpo não é resolvida sobrescrevendo evento: gera conflito explícito/fail-open. SessionStart/SessionEnd sem IDs de turno têm identidade por invocação: reabrir uma sessão é uma observação nova, não replay histórico. Backup/restore de T23 já inclui os recibos.

Prompts, respostas, comandos, resultados e caminhos de transcrição não são persistidos. Somente metadados passam pela política de fonte/root/workspace antes dos recibos e da fila. Não há leitura da transcrição privada nem reconstrução histórica em T12; T15 implementará o histórico disponível separadamente.

**Histórico T15 disponível por escolha explícita de arquivo:** parser `codex-rollout-0.167.0` implementado para turnos de thread raiz com horários explícitos; não lê pastas pessoais automaticamente e não concede confiança a hooks. Sempre sinaliza `HISTORY_LIFECYCLE_ONLY`, sem prometer cobertura de ferramentas/subagentes/linhagens herdadas. Uso, retomada, filtros e limites em [FONTES-HISTORICO.md](FONTES-HISTORICO.md). O aceite real T12 permanece pendente.

**Extensão opt-in:** `codex-rollout-v2-0.167.0` preserva o v1 e acrescenta Bash/apply_patch completed com horários em ms e filhos diretos com raiz/pai/borda ordinal comprovados. Prefixo herdado não vira execução do filho; término usa SubagentStop. Mesmos recibos dos hooks, sem conteúdo privado ou tempo humano. Continua parcial (`HISTORY_LIFECYCLE_ONLY`, exit1); demais ferramentas/linhagens e aceites pessoais permanecem pendentes. Contrato e uso no mesmo guia.

Entrada inválida, schema desconhecido ou versão incompatível não geram eventos. O diagnóstico privado `codex-<sourceId>.diagnostic.json` contém somente `code` e `at`; a próxima captura válida registra `CODEX_CAPTURE_OK`. `CODEX_INPUT_UNSUPPORTED` exige conferir a versão/schema; `CAPTURE_NOT_AUTHORIZED` exige conferir a raiz/fonte habilitada; `CODEX_CAPTURE_UNAVAILABLE` exige conferir permissões/disco. Erros do coletor não adicionam contexto nem interrompem o Codex: exit 0, resposta JSON vazia `{}` e sem stderr. Gaps/finais ausentes continuam explicitamente incompletos nas projeções existentes. Gestão ampliada de diagnósticos na UI pertence a T14.

## Verificação

```sh
npm run typecheck
npm run build
npm run test:unit -- tests/collectors/codex.test.ts
npm run test:integration -- tests/integration/codex-hook.test.ts
npm run smoke:codex
```

Checklist e verificação independente: `.checks/t12-codex.md` e `.checks/t12-codex.verified.md`. O teste foi executado antes do adapter e falhou por módulo ausente; depois passou. O smoke de descoberta é temporário, não chama modelos e não altera a configuração pessoal.

Fontes consultadas: [documentação de hooks](https://developers.openai.com/codex/hooks) e [schema versionado 0.167.0](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/hooks/src/schema.rs). O protocolo de descoberta `hooks/list` foi gerado pelo próprio `codex app-server generate-ts`; nomes do RPC usam lowerCamelCase e stdin/hooks.json usam PascalCase.

## Endpoints

T12 reutiliza os existentes `GET /api/sources`, `/api/sessions`, `/api/activity` e `/api/summary`; não requer novo endpoint HTTP de ingestão. Os hooks escrevem na fila privada. Novos endpoints de gestão de fontes permanecem no escopo de T14.
