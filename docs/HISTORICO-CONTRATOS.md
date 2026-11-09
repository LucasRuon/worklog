# Ampliação histórica — contratos e cobertura

Pesquisa em 09/11/2026, sem novas leituras de transcrições pessoais, turnos de modelo ou mudanças de instrumentação. O aceite T15 **disponível e comprovado** continua encerrado em `76a6edc`; esta ampliação não transforma limitações anteriores em provas retroativas. Sem marcas-d'água visuais.

## Estado por formato

| Formato / capacidade | Classe | Evidência e limite |
|---|---|---|
| OpenCode DB legado 1.19.5 | 1 — implementado, amostra nativa comprovada anteriormente | 46/46 IDs, replay0, relatório t15-fechamento; não reexecutado nesta rodada |
| Codex recibos 0.167.0 | 1 — implementado, amostra nativa comprovada anteriormente | 10/10 das duas sessões próprias; não é prova de rollout/MCP |
| Normalizado Worklog v1 das três ferramentas | 2 — contrato/fixtures; amostras nativas anteriores delimitadas acima | Origem, IDs, períodos e proveniência preservados; Claude normalizado não é Claude JSONL nativo |
| OpenCode log 2.2.5 contíguo | 2 — contrato/fixtures | Contrato anterior preservado, sem ampliar 2.2.5 por contrato exclusivo de 2.2.6 |
| OpenCode log 2.2.6, inclusive gaps públicos internos/finais | 2 — contrato/fixtures | seq crescente, IDs únicos, watermark >= último seq; gaps => HISTORY_PUBLIC_LOG_GAPS, complete=false; sem evento inventado |
| Sessões OpenCode já consultadas com somente log.synced | 3 — origem consultada sem eventos recuperáveis | HISTORY_UNAVAILABLE; sem nova consulta pessoal nesta rodada. Não se afirma que toda sessão carece de histórico |
| Codex rollout v1/v2/v3 | 2 — contrato/fixtures | Recortes anteriores inalterados, resultados parciais |
| Codex rollout v4 MCP completed + FunctionCall namespaced correlacionado | 2 — contrato/fixtures | Novo opt-in; primeiro recibo/ID/horário durável compartilhado; sem amostra nativa de MCP |
| MCP sem nome canônico correlacionável, failed/inProgress, code-mode sem FunctionCall | 4 — ainda não suportado | Não inferir nome de server/tool; ausência no input não prova que a origem nunca o preservou |
| Codex filhos diretos com borda ordinal; replay da mesma raiz retomada | 2 — contrato/fixtures | Prefixo ancestral excluído; resume não cria duração nem evento extra por si |
| Codex nested/fork/revert/resolução de prefixos externos | 4 — ainda não suportado | Contrato de origem existe, mas falta implementação/reconciliação de linhagem ponta a ponta; não é indisponibilidade geral da origem |
| Claude JSONL nativo | 4 — contrato público consultado insuficiente para parser de execução | Faltam bordas e correlação com hooks; não é alegação de inexistência dos dados privados |

Classes: (1) nativo comprovado, (2) contrato/fixtures para a capacidade, (3) origem consultada sem dados recuperáveis, (4) não suportado. As capacidades novas são classe2, não classe1. Testes gerais não mudam essa classificação.

## OpenCode 2.2.6

Fontes oficiais fixadas em [`dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06`](https://github.com/anomalyco/opencode/tree/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06), tag v2.2.6:

- [session-log.test.ts:71–120](https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/core/test/session-log.test.ts#L71-L120): salto sobre eventos fora do manifesto e sessão migrada somente com marcador.
- [session.ts](https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/core/src/session.ts): Interface.log documenta marcador superior ao último evento; implementação filtra o Bus para eventos públicos de sessão.
- [bus.ts](https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/core/src/bus.ts): readAfter avança pelo último seq bruto, omitindo tipos ausentes do manifesto; log marca latestSequence capturado. `persist` tem default false: projeção operacional/sequência podem existir sem retenção dos payloads. Não habilitamos persistência no runtime pessoal.

`log.synced` é um **marcador técnico de posição**, não marca-d'água visual nem assinatura criptográfica. Um salto crescente pode ser legítimo; somente o arquivo SSE não permite provar se é omissão pública nativa ou remoção manual de um frame. Aceitamos registros disponíveis, sinalizamos gaps e não afirmamos completude. Seq igual/regressivo, ID repetido, watermark menor que último seq, não inteiro, ausente após eventos ou de outra sessão continuam inválidos. Falta de delimitador SSE/marker continua truncamento; session.created inicial, autorização e versão continuam obrigatórios.

Alternativas públicas investigadas: `Session.get/list`, `messages/message/context` e export projetado. Têm IDs de sessão/mensagem e podem preservar horários de projeção, mas não o `event.id` que `projectV2Event` usa na identidade live. Mensagem/contexto é estado projetado (inclui fork/revert), não prova de todas as transições executadas. Não importar como log durável nem criar outro sourceId para esconder duplicações. Sem log retido e sem captura prévia, este caminho não recupera retroativamente aquela execução; recibos/normalizados já capturados permanecem importáveis.

## Codex MCP 0.167.0

Fontes na tag rust-v0.167.0, commit [`086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`](https://github.com/openai/codex/tree/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a):

1. [models.rs FunctionCall](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/models.rs#L1134-L1152) preserva namespace/name/call_id. [router.rs:276–302](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/router.rs#L276-L302) constrói ToolName mantendo call_id; [registry.rs:690–692](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/registry.rs#L690-L692) faz lookup exato, apenas normalizando namespace default. v4 exige namespace explícito não vazio.
2. [McpHandler:139–165](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/handlers/mcp.rs#L139-L165) usa nome canônico: remove underscores finais do namespace/iniciais do nome, junta com `__`, acrescenta `mcp__` somente se ausente. [Pre/Post:493–542](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/handlers/mcp.rs#L493-L542) usa esse nome e invocation.call_id.
3. [mcp_tool_call.rs:1060–1145](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/mcp_tool_call.rs#L1060-L1145) emite item.id=call_id e completed somente no sucesso; [items.rs:459–499](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/items.rs#L459-L499) preserva nomes MCP brutos, não os canônicos. [policy.rs](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/rollout/src/policy.rs) conserva FunctionCall e ItemCompleted paginados.
4. [codex-mcp/tools.rs](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/codex-mcp/src/tools.rs) prova que sanitização/colisões/truncamento/hash dependem do catálogo inteiro. v4 usa o nome **já preservado no FunctionCall**, inclusive quando já hashed; não calcula nome/hash a partir de server/tool.

O par de mesmo call_id na história **própria** prova a ponte histórica→canônica neste recorte. FunctionCall sozinho é pedido, não execução; McpToolCall sozinho não determina nome canônico. Sem par: HISTORY_MCP_IDENTITY_UNAVAILABLE, nenhuma borda. FunctionCalls conflitantes de mesmo call_id são recusados antes de recibos. Não se abre arquivo referenciado nem se consulta catálogo/configuração MCP pessoal.

```sh
npm run cli -- history configure --source-id UUID --parser codex-rollout-v4-0.167.0 --input '/arquivo/escolhido.jsonl'
npm run cli -- history import --source-id UUID --from '2026-11-05T00:00:00.000Z' --to '2026-11-06T00:00:00.000Z'
```

v4 reutiliza os recortes v3 e acrescenta MCP completed correlacionado, modo paginado e ordinais explícitos. Exige adicionalmente `history_base` ausente/null tanto na raiz quanto no filho: base física/revert não é resolvida neste recorte. V1/v2/v3 não mudam. Somente started_at_ms/completed_at_ms positivos; duration/timestamp externo não substituem execução. Argumentos/resultados/nomes brutos descartados; contexto host autorizado, IDs e primeiro horário durável compartilhados com hooks via recibos. Resultado sempre HISTORY_LIFECYCLE_ONLY/complete=false/exit1, inclusive replay. O nome desse warning é compatibilidade, não promessa de histórico integral nem ausência de ferramentas.

## Codex — linhagens e consequências para live/projeções

- [SessionMeta:3425–3490](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/protocol.rs#L3425-L3490) distingue session_id raiz, parent_thread_id imediato, forked_from_id/corte lógico, history_base/posição física e subagent_history_start_ordinal. `source.subagent.thread_spawn` fornece profundidade/pai. Não são sinônimos.
- [paginated_fork.rs](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/thread-store/src/local/paginated_fork.rs) resolve segmentos até a borda. [revert_thread.rs:86–192](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/thread-store/src/local/revert_thread.rs#L86-L192) pode trocar base física mantendo corte lógico/faixa própria; não basta excluir tudo abaixo do corte lógico. [Migração subagent](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/thread-store/src/local/rollout_migration/subagent.rs) documenta cópia ancestral nos rollouts legados.
- [Hooks:550–623](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/hooks/src/schema.rs#L550-L623) expõem session_id e agent_id, mas não pai imediato. `src/collectors/codex.ts` grava parentSessionId=root; `src/core/sessions.ts` projeta pai como sessão main desse ID. Essa relação é raiz comprovada para filhos diretos, **não pai imediato comprovado para todo agente live**.
- Passar parent_thread_id no parser de aninhados faria o mesmo eventId colidir com recibos/documentos live imutáveis; canonicalCodexEvent deve continuar recusando conflito. Projeção precisaria resolver pai como agente da mesma raiz, com relação desconhecida explícita sem metadado, sem inventar sessão pai main. Isso demanda modelo/reconciliação de linhagem separado das bordas imutáveis e provas live/histórico/rebuild/replay; **não implementado aqui**.
- v4 recusa nested/forks e qualquer history_base física não nula, inclusive em filhos diretos, além de descartar o prefixo ancestral dos filhos diretos sem base externa. Nome MCP ancestral não autoriza item próprio. Resume da mesma raiz reutiliza IDs/recibos, sem nova execução pela mera retomada. Não se afirma suporte a toda forma de resume: compactação/bases externas/revert continuam excluídos.

## Claude nativo — o que falta

Pacotes oficiais [`0.3.318/package.json`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/package.json), [`0.3.319/package.json`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/package.json), tipos [`318/sdk.d.ts`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/sdk.d.ts) e [`319/sdk.d.ts`](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/sdk.d.ts). Pacote319 corresponde ao Claude instalado2.1.319; não alteramos versões para contornar guards.

Em319, SessionMessage:6927–6940 tem uuid/session_id/parent_agent_id e message:unknown, sem bordas executadas; null de parent_agent_id também significa metadado ausente. SessionStoreEntry:7090–7109 declara união JSONL CLI-internal, corpo opaco e timestamp opcional. SDKAssistantMessage.timestamp:3797–3799 é fim de bloco/display (um turno pode ter várias mensagens); outros timestamps são criação de mensagem. SDKSessionInfo.lastModified é modificação de armazenamento. Nenhum estabelece por si início/fim de execução de ferramenta/turno e correspondência aos IDs de hooks.

Faltam contrato público versionado das entradas executadas, semântica temporal das bordas, distinção pedido/execução/falha, correlação sessão/agente/turno/chamada com hooks e regra de herança/fork/replay. Não usar mtime, ordem de mensagens, fim de bloco ou escrita como duração. Mantidos normalizados/hooks; nenhuma transcrição pessoal aberta para preencher a lacuna por inferência.

## Provas desta ampliação

Verificação independente **PASS10/10**, rodada2 perfil light, em `.checks/history-expansion.verified.md` (FAIL inicial e correção preservados). Gates finais reexecutados pelo verifier: **201 unitários /33 integração /30 E2E**, sem skips; typecheck/build aprovados. O resultado cobre o recorte implementado/recusado, não constitui prova nativa de capacidades novas ou implementação das linhagens/Claude excluídos. Nenhum commit autorizado/feito nesta rodada.

- Checklist pré-build `.checks/history-expansion.md`; relatório independente `.checks/history-expansion.verified.md` após verificação.
- `tests/collectors/opencode-history.test.ts`: gaps/integridade/live/indisponibilidade/período/autorização/retomada.
- `tests/collectors/codex-history-mcp.test.ts`: nome/callID/horas/privacidade, recibos nas duas ordens/reabertura/conflitos, prefixo herdado/recusas de linhagem.
- `tests/integration/codex-history-mcp-cli.test.ts`: opt-in compilado/período/parcial/retomada/replay/origem intacta.
