# Ampliação histórica — contratos 2.2.6 / 0.167.0 / 2.1.319

Profile: light (nenhum AGENTS.md local/ancestral encontrado). Base: `76a6edc`, mais diff não commitado desta feature. Sem commits autorizados. Fontes: pedido integral desta conversa, TASKS T12–T15, FONTES-HISTORICO, CODEX, PROXIMA-SESSAO, t15-fechamento e t15-native-extension com seus relatórios. O aceite anterior T15 disponível/comprovado é preservado.

## Pesquisa anterior aos checks

- OpenCode `v2.2.6`, commit `dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06`: [session-log.test.ts](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/test/session-log.test.ts), [session.ts](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/src/session.ts), [bus.ts](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/src/bus.ts). Eventos públicos estritamente ordenados, mas não contíguos; marcador pode superar o último evento. `persist` tem default false; sessões migradas podem não ter sequência. Export/messages não preservam IDs de eventos duráveis usados por projectV2Event. Não há recuperação retroativa garantida via essa projeção.
- Codex `rust-v0.167.0`, commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`: `protocol/src/models.rs` FunctionCall; `core/src/tools/router.rs:276–302` constrói ToolName(namespace,name) e mantém call_id; `core/src/tools/registry.rs:690–692` resolve chave exata (apenas default namespace); `core/src/tools/handlers/mcp.rs:139–165,493–542` usa nome canônico, trim de underscores, separador __ e prefixo mcp__, com mesmo call_id. `core/src/mcp_tool_call.rs:1074,1120` emite item.id=call_id, completed somente sucesso; `protocol/src/items.rs:459–499` não preserva nome canônico. Portanto somente par FunctionCall namespaced + McpToolCall completed de mesmo ID é recuperável neste recorte; não reexecutar algoritmo de catálogo/hash a partir de nomes brutos. `codex-mcp/src/tools.rs` prova sanitização/hash dependentes do catálogo inteiro.
- Linhagem: `protocol/src/protocol.rs:3425–3490` separa raiz, pai imediato, corte lógico e history_base físico; `thread-store/src/local/{paginated_fork,revert_thread}.rs` resolve segmentos e pode trocar base física mantendo identidade lógica. `hooks/src/schema.rs:550–563,607–623` não fornece pai imediato; `normalizeCodex` grava raiz em parentSessionId e sessions.ts projeta o pai como main. Não há migração/reconciliação comprovada dos eventos/recibos antigos para aninhados: permanecem não suportados, não impossível na origem. Resume sem mudança de linhagem mantém IDs.
- Claude: pacotes oficiais `@anthropic-ai/claude-agent-sdk@0.3.318` / `0.3.319`, package.json e sdk.d.ts via unpkg. SessionMessage não tem relógio de execução; SessionStoreEntry tem timestamp opcional e corpo CLI-internal opaco; SDKAssistantMessage.timestamp documenta fim de bloco/display, não início/fim de ferramenta/turno com identidade de hooks. Faltam bordas executadas e correlação estável de lifecycle. Não criar parser nativo por ordem/mtime.

As cópias oficiais somente para leitura estão em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/history-expansion-contracts`; URLs versionadas acima são a referência reproduzível. Não executar código baixado. Versões instaladas revalidadas: Node24.19.0, OpenCode2.2.6, Codex0.167.0, Claude2.1.319. Baseline verde 158/32/30, typecheck/build. `TASKS.md` e `.checks/piloto-t14-t24-2026-11-09.md` têm trabalho concorrente e não pertencem ao delta.

## Out of scope

Novas amostras pessoais, turnos de modelo, instalações, serviços, trust, Posicionadas, push/deploy/commits; UI/marcas-d'água visuais. MCP sem FunctionCall namespaced correlacionável, failed/inProgress, code-mode sem identidade preservada; novas linhagens/migração de parentesco e resolução de arquivos/páginas referenciados; parser Claude nativo sem contrato suficiente. Estes são limites da entrega, não itens resolvidos.

## Landing

Reutilizar leitores delimitados, normalizador, autorização, recibos, proveniência e projeções; sem dependência/migração.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Sequência pública | seq crescente, IDs únicos, watermark inteiro >= último seq, session.created inicial preservado; gaps aceitos com HISTORY_PUBLIC_LOG_GAPS e complete=false | Exigir contiguidade (contradiz contrato), ou afirmar que o marcador autentica a ausência de eventos públicos perdidos (não permite distinguir omissão nativa de remoção manual) |
| Teste corrigido | Usuário autorizou substituir seq11 após10 por marcador regressivo e acrescentar positivos; teste seq9 seguido3 continua regressão válida | Enfraquecer assertions silenciosamente |
| Opt-in MCP | `codex-rollout-v4-0.167.0`, v3 + McpToolCall completed correlacionado por call_id a FunctionCall namespaced próprio; mesmo nome do hook | Expandir v3 e invalidar testes/contrato anteriores; concatenar server/tool ou reconstruir catálogo desconhecido |
| Identidade ausente | HISTORY_MCP_IDENTITY_UNAVAILABLE, sem bordas; duas identidades canônicas para call_id => HISTORY_EVENT_CONFLICT no preflight | Usar primeiro nome ambíguo e persistir evento incorreto |
| Base física v4 | Qualquer `history_base != null` (raiz ou filho) => HISTORY_LINEAGE_UNSUPPORTED antes de recibos; v1/v2/v3 preservados | Herdar aceitação v3 de filho/base física sem resolver segmentos/revert, contrariando C8 |

## Checks

### S1 — OpenCode público · leitor/projetor/testes · ~15k tokens

**C1** — Lacunas internas/finais 2.2.6 importam somente os oito eventos projetáveis originais, aviso HISTORY_PUBLIC_LOG_GAPS/complete=false; replay0 e identidade live preservados.
Proof: `npm run test:unit -- tests/collectors/opencode-history.test.ts`, teste `log v2: lacunas públicas não inventam eventos`.

**C2** — Duplicação/regressão de sequência, ID repetido mesmo com sequência maior e watermark regressivo/não inteiro/ausente/identidade diferente são recusados; truncamento continua recusado.
Proof: mesmo comando, teste `log v2: gaps não ocultam corrupção` e `log v2: cancelamento, retomada e integridade do watermark`.

**C3** — Log só com log.synced permanece HISTORY_UNAVAILABLE/complete=false; versões/escopo desconhecidos continuam negados.
Proof: mesmo comando, testes existentes `log v2: identidade, autorização e formatos desconhecidos` e `log v2: cancelamento, retomada e integridade do watermark`.

### S2 — MCP opt-in · rollout/normalizador/recibos/CLI · ~35k tokens

**C4** — v4 usa nome canônico FunctionCall (prefixed/unprefixed/hash/trim), mesmo call_id, horários explícitos e contexto host; ignora server/tool privados e args/results; parcial obrigatório.
Proof: `npm run test:unit -- tests/collectors/codex-history-mcp.test.ts`, teste `Codex v4: MCP canônico correlacionado e privado`.

**C5** — Raiz/filho direto nas duas ordens live/histórico preservam documento inteiro/primeiro horário durável e replay0 após reabrir; mudança de nome gera conflito sem sobrescrita.
Proof: mesmo comando, teste `Codex v4: MCP recibos live e histórico`.

**C6** — Falta de FunctionCall/namespace, call_id divergente, tempo ausente/invertido, status failed/inProgress e conflito canônico não inventam pares; v3 continua recusando MCP. Borda final com horário explícito pode existir isoladamente.
Proof: mesmo comando, teste `Codex v4: MCP incompleto não ganha identidade ou duração`.

**C7** — CLI compilada configura v4/help, limite1/retomada/replay 1/1/0 com exit1 parcial e período [from,to); fonte/input não mudam.
Proof: `npm run test:integration -- tests/integration/codex-history-mcp-cli.test.ts`, teste `Codex v4 CLI: MCP opt-in e retomada privada`.

**C8** — Prefixo herdado não fornece identidade MCP própria; nested/fork/revert não comprovados são recusados antes de evento/recibo; resume de mesma raiz deduplica IDs sem novas durações. Threads/contextos próprios externos tardios são negados no preflight.
Proof: `npm run test:unit -- tests/collectors/codex-history-mcp.test.ts`, teste `Codex v4: linhagem e prefixos não viram execução própria`.

### S3 — Limites oficiais e regressão · documentação e suites · ~20k tokens

**C9** — Documentação distingue nativo provado, contrato/fixtures, origem sem dados e não suportado; registra limites OpenCode/MCP/linhagens/Claude sem alterar aceite T15.
Proof: revisão independente de `docs/HISTORICO-CONTRATOS.md`, `docs/FONTES-HISTORICO.md`, `docs/CODEX.md` e `.checks/PROXIMA-SESSAO.md` contra fontes versionadas acima (não há alegação de teste nativo novo).

**C10** — Regressões existentes preservadas: unit/integration/E2E, typecheck/build exit0, zero skips.
Proof: `npm run typecheck && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`, testes nomeados C1–C8 no output, além de todas as provas anteriores.

## Swept

- Validação/falhas: C2/C3/C6/C8, guards de versão preservados.
- Idempotência/retry: C1/C5/C7, sem alterar recibos exclusivos existentes.
- Autorização: C8 e prepareCapture existente antes de recibos/fila; sem descoberta pessoal.
- Concorrência/ordem: C2/C5; canonicalCodexEvent publica primeiro recibo por hardlink, regressão de processos existente.
- Ciclo de dados: eventos imutáveis, proveniência/checkpoint transacionais existentes; sem migração; C5/C7.
- Dependências externas: pesquisa offline ao runtime; falhas web não desbloqueiam contrato por suposição.
- Estados: C1/C3/C6, nada de foco/revisões/fim de sessão inferidos; aninhados não achatados.
- Observabilidade: warnings fixos e privados C2/C6/C7; gaps não são prova criptográfica de integridade/completude.

## Handoff

Lote único S1+S2+S3 ~70k de leitura (inclui contratos selecionados), ~25k implementação/provas, abaixo de150k. Sem agente builder separado. Verificador fresco cobre todos C1–C10 no diff desta feature após gates; perfil light, sem fault injection obrigatório. Sem commits nesta sessão. Autorização do usuário: correção do teste de watermark; nenhum suporte visual solicitado.

## Resultados do autor — antes da verificação independente

- Testes novos executados vermelhos antes da implementação: gaps públicos/ID duplicado falharam no leitor antigo; v4 recusado com HISTORY_INPUT_INVALID antes de registrar o novo parser. Nenhum critério/check removido.
- Provas focadas verdes: 46 testes unitários (incluindo subtestes) e1 integração compilada. Posteriormente a prova OpenCode foi ampliada para seq inicial0 e gaps internos/finais/separados; mesmas contagens de eventos exigidas.
- Falhas de montagem corrigidas sem enfraquecer assertions: helper de escrita não podia configurar usando conexão já fechada após reopen; alterado para somente escrever o input. Ao passar o teste antigo de integridade para fonte2.2.6, sua fixture unknown ainda declarava2.2.5; alinhada à versão da fonte, conservando assertion HISTORY_FORMAT_UNSUPPORTED. Primeira regressão geral parou nesse mismatch (199/200), não foi apresentada como verde.
- Regressão geral final executada integralmente: **200 unitários / 33 integração / 30 E2E**, zero falhas/skips; typecheck/build exit0. Baseline desta sessão158/32/30, também reexecutada integralmente. git diff --check sem erros.
- Código/provas desta feature: src/collectors/{opencode-history,codex-history,history}.ts, src/cli/index.ts, tests/collectors/{opencode-history,codex-history-mcp}.test.ts e tests/integration/codex-history-mcp-cli.test.ts. Documentação: este checklist, docs/HISTORICO-CONTRATOS.md, FONTES-HISTORICO.md, CODEX.md e prefixo novo de PROXIMA-SESSAO.md. TASKS.md/tasks.csv e checklist do piloto pertencem à outra frente e não foram editados por este agente.
- C1–C8 são provas sintéticas delimitadas; nenhuma amostra nativa histórica nova, nenhum turno/modelo, leitura pessoal, alteração de identidade/versionamento registrado, confiança, hook/serviço ou Posicionadas. C9 explicita capacidades não entregues em vez de chamá-las resolvidas.
- Swept existing relido: sourceFor/prepareCapture autorizam antes de recibos; canonicalCodexEvent preserva corpo/primeiro horário via publicação exclusiva; appendEvent mantém evento/proveniência/checkpoint transacionais. Não houve alteração nesses mecanismos ou no normalizador/projeções; impactos de nested estão documentados e continuam excluídos do suporte.

## Correção após rodada independente1

Verifier encontrou F1/C8: filho direto com history_base externo passava embora a raiz fosse recusada. Relatório FAIL preservado em `.checks/history-expansion.verified.md`. Acrescentado subcaso `child-revert` com HistoryPosition oficial e ordinais físicos20–23/faixa própria22; executado vermelho (imported2 quando devia0) antes de implementar guard v4. Agora history_base não nula é recusada no preflight tanto para raiz quanto para filho, sem tocar admissões de v1/v2/v3. Documentação explicita essa fronteira adicional do v4. Nenhum check foi removido/reduzido.

Pós-fix autor: **47 unitários focados /1 integração**, typecheck/build verdes. A regressão completa200/33/30 acima é anterior a esse fix; nova execução completa fica a cargo do verifier na rodada2, que deverá identificar a árvore por hashes por não haver commits autorizados.

## Verificação independente vigente

**PASS C1–C10, 10/10, rodada2 scoped, perfil light**, em `.checks/history-expansion.verified.md`. Reexecutou todas as provas e o gate completo na árvore pós-fix: **201 unitários /33 integração /30 E2E**, zero falhas/skips, typecheck/build verdes. Probe independente raiz/filho com base física externa confirmou zero eventos/recibos; hashes do código/provas no relatório. FAIL/F1 da rodada1 preservados. Sem fault injection (light), sem nova amostra nativa. Só registro documental do resultado após essa verificação; nenhum código/prova alterado. T15 anterior e limitações restantes preservados. Sem commits/push/deploy.

**Autorização posterior:** após a entrega/verificação, usuário solicitou “Pode comitar”. Commit local restrito aos arquivos desta ampliação; trabalho concorrente do piloto em TASKS.md/tasks.csv/checklist próprio excluído. Sem autorização de push/deploy. Hashes de código/provas reconferidos contra rodada2 antes do commit, sem mudanças.
