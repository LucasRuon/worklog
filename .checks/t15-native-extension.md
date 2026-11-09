# T15 — extensão nativa delimitada (08/11/2026)

Profile: light, sem AGENTS.md declarado. Build agent; sem delegação, verificação independente, commits/push ou acesso a perfis/stores/transcrições pessoais. Pilotos autorizados: Worklog e `/Users/lucasruon/Developer/Posicionadas`; esta rodada usa apenas fixtures sintéticas em stores temporários.

Sources: conversa; `TASKS.md` T15; `docs/FONTES-HISTORICO.md` completo; `.checks/t15-codex-rollout.md`; código/history e provas v1/v2 existentes.

## Contratos consultados e investigação bloqueada

Codex oficial `rust-v0.167.0`: tag anotada `cb41599ccbe371272892f156286a236aa097bada` aponta para commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a` ([resolução](https://api.github.com/repos/openai/codex/git/tags/cb41599ccbe371272892f156286a236aa097bada)). Fontes abaixo são dessa versão; não executar o código baixado.

- [items.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/items.rs#L294-L321): DynamicToolCall tem id, namespace opcional, tool, status, success opcional. [dynamic.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/handlers/dynamic.rs#L190-L275) emite id=call_id, namespace/tool originais, completed somente quando response.success=true. [protocol.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/protocol.rs#L2176-L2190) declara started_at_ms/completed_at_ms opcionais. [policy.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/rollout/src/policy.rs#L231) persiste ItemCompleted paginado, não ItemStarted.
- Nome de hook: [registry.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/registry.rs#L1129-L1138) + [tools/mod.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/mod.rs#L47-L64) + [tool_name.rs](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/tool_name.rs#L46-L51). Namespace ausente/null/vazio/functions => tool; outros => concatenação literal namespace+tool, **sem inserir separador**. Exceção spawn_agent em multi_agent_v1 => spawn_agent. Registry usa call_id em PreToolUse e PostToolUse; `DynamicToolHandler` usa o runtime padrão. Status failed não pode ser convertido em PostToolUse completed.
- **MCP bloqueado neste recorte:** McpToolCall guarda server/tool originais, mas [ToolInfo](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/codex-mcp/src/tools.rs#L34-L60) separa callable_name/callable_namespace; [handler MCP](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/tools/handlers/mcp.rs#L139-L165) usa esse nome canônico, trim de underscores e prefixo mcp__. Item não fornece esses campos canônicos. Não presumir que `mcp__${server}__${tool}` coincide com o hook. Requer prova de mapeamento para cada variante, não fixtures inventadas.
- **Linhagens bloqueadas neste recorte:** [SessionMeta](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/protocol.rs#L3425-L3490) distingue session_id raiz, parent_thread_id imediato, history_base físico e forked_from_ordinal_exclusive lógico (revert pode mudar o primeiro). Worklog `normalizeCodex` hoje põe parentSessionId=session_id. Descendente aninhado não pode ser apresentado como filho direto sem alterar essa semântica aprovada. Leitura de páginas, forks/revert/review/internal requer outra extensão comprovada; nenhuma alegação de impossibilidade geral.
- **Claude bloqueado:** pacotes oficiais [0.3.318](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/package.json) e [0.3.319](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/package.json), tipos [318](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/sdk.d.ts) / [319](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/sdk.d.ts). SessionMessage tem message:unknown, uuid, session_id e parent_agent_id nullable (null também quando metadado ausente), **sem timestamp de execução**. SessionStoreEntry explicitamente declara união JSONL CLI-internal, payload opaco e timestamp opcional; SDKSessionInfo.lastModified não é encerramento. Inventário/subagent listing não comprova bordas executadas ou IDs de hooks. Nenhum parser Claude adicionado.

Cópias de consulta: `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/t15-native-contracts`. Snapshot pré-build dos arquivos alterados: diretório irmão `t15-native-before` (HEAD não contém todo trabalho anterior).

## Out of scope

MCP/extensions/collab/web/image, dynamic failed/in_progress, linhagens além de filhos diretos já suportados, páginas externas, fontes pessoais, instrumentação, novos timestamps inferidos, migrações, fim de sessão, tempo humano e aceite integral T15/T12/T24. V1/v2 e seus testes não mudam de contrato.

## Landing

Reutilizar leitor/preflight, normalizador, recibos exclusivos, período canônico, autorização e proveniência existentes. Sem nova dependência/tabela.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Opt-in | `codex-rollout-v3-0.167.0`, v2 + DynamicToolCall completed com success=true, nome/call_id comprovados e ms explícitos | Expandir v2 silenciosamente ou mudar expectativas de testes antigos |
| Nome dinâmico | Regra oficial acima; segmentos não vazios validados por shortId (1–160 ASCII), namespace vazio/default permitido; nome final validado por shortId | Copiar args/resultados, inserir ponto inexistente ou aceitar nome arbitrário como texto privado |
| Cobertura parcial | HISTORY_LIFECYCLE_ONLY, complete=false e CLI exit1; rejeições usam códigos existentes | Declarar histórico completo porque uma ferramenta nova funciona |

## Checks

### S1 — DynamicToolCall opt-in · 10 arquivos de referência · 171854 bytes · ~43k tokens

**C1** — v3 importa duas bordas por DynamicToolCall completed/success=true, ms explícitos e nome canônico (ausente/null/vazio/functions/custom/multi_agent_v1 spawn_agent). Usa contexto host, nunca args/output/duração/timestamp de escrita; zero revisões/sinais humanos; parcial obrigatório.
Proof: `npm run test:unit -- tests/collectors/codex-history-native.test.ts`, teste `Codex v3: dynamic canônico, horários e privacidade`.

**C2** — Histórico/live nas duas ordens, raiz/filho direto: mesmos IDs e primeiro horário, replay zero após reabrir store; corpo divergente mantém evento original e HISTORY_EVENT_CONFLICT.
Proof: mesmo comando, teste `Codex v3: dynamic compartilha recibos live e replay`.

**C3** — failed/in_progress, success ausente/false, MCP, namespace inválido/nome excessivo, tempo ausente/zero/invertido e histórico sem ordinal/paginação não fabricam pares. Borda isolada com horário explícito permanece isolada. v2 ainda rejeita DynamicToolCall.
Proof: mesmo comando, teste `Codex v3: limites de contrato não fabricam pares`.

**C4** — Thread divergente/contexto externo tardio de fixture v3 são negados antes de qualquer evento/recibo. Filho direto ignora prefixo ancestral; interrupções/linhagens não ganham semântica nova.
Proof: mesmo comando, teste `Codex v3: preflight conserva autorização e linhagem` (negações); C2 (filho próprio); suites v1/v2 existentes (demais linhagens/interrupções).

**C5** — CLI compilado configura v3 e anuncia help; limite 1 preserva parcial exit1, retomada insere outra borda, replay zero, período [from,to) e fonte/input sintéticos permanecem intactos.
Proof: `npm run test:integration -- tests/integration/codex-history-native-cli.test.ts`, teste `Codex v3 CLI: dynamic opt-in, período e retomada`.

## Swept

- Validation: C1/C3, nomes allowlisted e horários explícitos; preflight C4.
- Failure modes: C3 e códigos existentes; não fabricar suporte para contratos bloqueados.
- Idempotency/retry: C2/C5, recibo canônico existente.
- Authorization: C4; política local existente, nenhuma descoberta de transcrição.
- Concurrency/ordering: recibo exclusivo existente e suas provas v1; ordinais/preflight reutilizados, sem nova concorrência.
- Data lifecycle: C2/C5; proveniência/transações/backup existentes, sem migração.
- External dependency failure: importação continua offline; fontes web são somente pesquisa, não dependência runtime.
- State transitions: completed/success=true somente; pares incompletos C3, sem session.end ou atividade humana.
- Observability: C3/C5, warnings fixos e saída parcial, sem payload privado.

## Handoff

Lote único S1: ~43k arquivos locais + ~30k trechos oficiais + ~15k implementação/provas = ~88k, abaixo de 150k. Build sem delegação. Nível light: provas sintéticas unitárias/CLI, sem fault injection, sem amostra histórica nativa pessoal, sem verificação independente neste agente. Orquestrador envia verifier fresco após gates.

## Resultado do build e provas executadas

**Verificação independente posterior:** PASS, C1–C5 (5/5), perfil light, em `.checks/t15-native-extension.verified.md`. Errata editorial do levantamento: `started_at_ms` é Option; `completed_at_ms` é i64 com default zero quando ausente. Ambos exigem valor positivo nas provas/implementação; nenhum critério comportamental foi alterado.

C1–C5 exercitados com sucesso pelo builder; **não é veredito independente**. Nenhuma mudança nos checks durante o build. Arquivos: `src/collectors/codex-history.ts`, `src/collectors/history.ts`, `src/cli/index.ts`, dois testes `codex-history-native` (unit/CLI), este artefato, `docs/FONTES-HISTORICO.md` e `TASKS.md`.

| Gate | Resultado |
|---|---|
| `npm run test:unit -- tests/collectors/codex-history-native.test.ts tests/collectors/codex-history-items.test.ts tests/collectors/codex-history.test.ts` | 104/104, sem skips; inclui C1–C4 e regressões v1/v2 |
| `npm run typecheck` | exit0; primeira execução detectou acesso union não estreitado no novo teste CLI, corrigido exigindo tool.start/tool.end antes de toolUseId; nenhuma asserção removida |
| `npm run build` | exit0, tsc server + Vite |
| `npm run test:unit` | 158/158, sem skips |
| `npm run test:integration` | 32/32, sem skips; inclui C5 em processo compilado e concorrência de recibos existente |
| `npm run test:e2e` | 30/30 desktop/mobile, sem skips |

Asserções localizadas: C1 compara payloads/horários exatos e tipos exclusivamente tool.start/end; C2 compara documento inteiro antes/depois de live/reabertura/conflito; C3 tabela exige contagem e warning específicos, sem par quando ausente; C4 exige zero eventos/recibos; C5 exige exit1, contagens 1/1/0, exclusão do início do segundo item em `to`, input/config sintéticos byte-idênticos. Níveis: unit via importHistory com SQLite temporário e CLI compilado; E2E existente é regressão, não prova de histórico pessoal. Amostragem: completed dynamic e nomes enumerados, não MCP/linhagens bloqueadas. Nenhuma fault injection.

Swept existing relido: prepareCapture/resolveProject antes de recibos; canonicalCodexEvent escolhe primeiro horário e rejeita corpo divergente; appendEvent/proveniência/checkpoint mantêm transação; limites readonly/preflight/ordinais e interrupções v1/v2 continuam compartilhados. Não houve mudança nesses mecanismos.

Fronteira: lote único encerrado sem commit; snapshot pré-build externo serve de referência porque HEAD não contém a implementação anterior. Sem nova decisão do usuário. Alternativas abandonadas: derivar MCP de server/tool (não garante nome de hook), achatar descendentes em filhos diretos (perde pai imediato), usar timestamp de mensagem Claude como execução (contrato não garante). Próximo passo do orquestrador: verifier fresco para C1–C5 e investigação documentada. T15 integral continua aberta.
