# T15 — ferramentas e subagentes diretos Codex

Profile: light (padrão, sem AGENTS.md). Sem commit/push/deploy e sem alteração de perfis pessoais.

Sources:
- Conversa: continuar a T15 após o recorte de turnos raiz verificado 9/9.
- `TASKS.md` T12/T15, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md`, `docs/FONTES-HISTORICO.md`, `docs/CODEX.md`, `.checks/t15-codex-rollout.md`: compatibilidade versionada, privacidade, origem, replay/live, incerteza e contratos anteriores preservados.
- https://github.com/openai/codex/tree/rust-v0.167.0 — `protocol/src/items.rs` (TurnItem usa PascalCase, CommandExecution/FileChange e status), `protocol/src/protocol.rs` (ItemCompletedEvent, SessionMeta, SubAgentSource, HistoryPosition), `rollout/src/ordinal.rs` (ordinais paginados/borda própria), `core/src/tools/events.rs` (id = call_id), `core/src/tools/hook_names.rs` (Bash/apply_patch), `core/src/tools/handlers/unified_exec/exec_command.rs` (Bash), `core/src/hook_runtime.rs:196–218,375–443,1083–1101` (session_id raiz, agent_id = thread, SubagentStop nos filhos). Cópias públicas em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t15-contracts`.

## Out of scope
- Alterar o contrato do parser anterior `codex-rollout-0.167.0` ou seus critérios 9/9; novo comportamento exige seleção explícita de parser.
- Modelos, confiança/login, histórico/configurações pessoais, serviços, PRs, SSH e piloto real T24.
- Ferramentas MCP/dynamic/extensions, comandos user_shell/interação, status failed/declined/in_progress sem correlação de outcome comprovada; reportar limitação, não chamar de êxito.
- Subagentes aninhados, review/compact/internal/custom, herança sem borda ordinal comprovada, arquivos externos/comprimidos e rollback/revert genéricos.
- Interrupção de filho: Interrupt nativo não inclui agent_id no contrato consultado; não correlacionar isso como interrupção da raiz. Sinalizar limitação sem fabricar evento.

## Landing

Reusar leitor delimitado, normalizador Codex, recibos canônicos, política, transações, proveniência e projeções. Nenhuma tabela/schema de evento/dependência/endpoint novo.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Opt-in versionado | Novo parser `codex-rollout-v2-0.167.0`; v1 mantém exatamente seu recorte raiz | Expandir v1 silenciosamente e invalidar os aceites anteriores de recusa de subagentes |
| Ferramentas comprovadas | ItemCompleted paginado `CommandExecution` + source `unified_exec_startup` + status `completed` → Bash; `FileChange` + status `completed` → apply_patch. `id` é call_id; horários somente `started_at_ms`/`completed_at_ms` positivos; cwd é o contexto host do turno, como o hook | Derivar nome de comando/path/stdout ou horário de duration/timestamp de escrita; reinterpretar status de execução como aprovação de teste |
| Filho direto | SessionMeta tem UUIDs distintos root/child, parent_thread_id = root, source.subagent.thread_spawn(parent=root,depth=1), history_mode=paginated e subagent_history_start_ordinal explícito. Só linhas com ordinal >= borda própria; prefixo herdado não gera eventos/contextos | Copiar atividade do pai como do filho; inferir raiz/pai ausentes ou atribuir descendente ao pai errado |
| Identidade de término do filho | TaskComplete do filho usa SubagentStop, sem turnId no payload, como o adapter ao vivo; turn.start usa UserPromptSubmit com agent_id. Sem session.start/end inferidos | Usar Stop da raiz ou inventar sessão encerrada/SubagentStart a partir de metadata |

Nada mais nesta alteração é irreversível. HLC permanece obrigatório, inclusive CLI exit1 com MORE; não declarar cobertura integral T15.

## Checks

### S1 — parser expandido compatível · 14 arquivos de referência · 217.394 bytes · ~54k tokens

**C1** — Root v2 recupera exatamente quatro bordas para Bash/apply_patch completed, em UTC com precisão de ms, sem command/output/changes/paths privados, humanos, revisões ou lifecycle de sessão. Contexto por turno posterior ao item é aplicado; timestamp externo/duration não viram execução.
Proof: `npm run test:unit -- tests/collectors/codex-history-items.test.ts`, teste `Codex v2: ferramentas comprovadas, ms, contexto e privacidade`.

**C2** — Ferramentas root v2 compartilham IDs/corpo/primeiro horário com PreToolUse/PostToolUse nas duas ordens; replay insere zero. Corpo divergente continua conflito, não sobrescrita.
Proof: mesmo comando, teste `Codex v2: ferramentas e hooks preservam identidade nas duas ordens`.

**C3** — Filho direto só importa sua faixa ordinal, ignorando metadata/cwd/turnos herdados. Pai e filho com mesmo turn_id continuam duas sessões; filho aponta à raiz comprovada. Pai 60 s + filho 30 s sobrepostos produzem 90 s acumulados/60 s de relógio e zero humano.
Proof: mesmo comando, teste `Codex v2: filho direto ignora prefixo herdado e conserva origem e tempos`.

**C4** — Filho usa IDs de UserPromptSubmit, ferramentas com agent_id e SubagentStop, nas duas ordens com coleta live. Só o hook gera turn.submit; nenhum término é confundido com Stop da raiz; replay e reabertura não duplicam.
Proof: mesmo comando, teste `Codex v2: filho e hooks SubagentStop coexistem sem duplicação`.

**C5** — Ferramenta/source/status não suportado e tempos ausentes/zero geram warnings fixos sem fabricar bordas; duração isolada não gera tempo. Interrupção de filho gera `HISTORY_CHILD_INTERRUPT_UNAVAILABLE`, sem evento na raiz. Resultado mantém HLC/complete=false.
Proof: mesmo comando, teste `Codex v2: limitações de ferramenta e interrupção não fabricam evidências`.

**C6** — Filho com pai/root/depth/source/borda inválidos, ordinais ausentes, thread divergente tardia, novo SessionMeta próprio ou contexto externo/pausado/symlink externo é recusado antes de eventos/recibos. Prefixo herdado não autoriza raiz nem altera a origem própria.
Proof: mesmo comando, teste `Codex v2: linhagem e autorização são validadas antes da persistência`.

**C7** — V2 mantém arquivo readonly, limites 64 MiB/1 MiB/10000 linhas (inclusive prefixo herdado), UTF-8 e sequência; limite/cancelamento/truncamento permitem retomada por IDs sem perder borda/contexto. Snapshot sem história própria não inventa atividade.
Proof: mesmo comando, teste `Codex v2: limites, retomada e ausência de história própria`.

**C8** — CLI compilado anuncia/configura v2 e importa ferramenta/filho; filtros `[from,to)`, replay, HLC/exit1 com --limit preservados. Mesmo arquivo de filho continua recusado pelo v1 com zero eventos/recibos.
Proof: `npm run test:integration -- tests/integration/codex-history-items-cli.test.ts`, teste `Codex v2 CLI: opt-in explícito, período, retomada e v1 preservado`.

## Swept
- Validation: C1/C5/C6/C7; unidades e identidade são declaradas, não inferidas de texto.
- Failure modes: C5/C6/C7; desconhecido conserva limitação, não aprovação.
- Idempotency/retry: C2/C4/C7/C8; recibos canônicos/transação existentes, sem rewrite de evento.
- Authorization: C6; prepareCapture/resolveProject existentes antes de recibos; nenhuma leitura de arquivos referenciados por history_base/item.
- Concurrency/ordering: recibos exclusivos entre processos já provados por `tests/integration/codex-history-cli.test.ts`; C7 confirma retomada e duas passagens de contexto; nova ordenação ordinal C3/C6.
- Data lifecycle: prefixo herdado descartado da projeção, nunca importado como criança; C1/C3/C4; backup/restore de recibos e eventos existentes inalterados.
- Dependency failure: sem dependência externa nova; reader readonly e falha de recibo já reportadas pelo importador; regressões CLI/recuperação mantidas.
- State transitions: C1/C3/C4/C5; filhos não viram sessão encerrada ou interrupção da raiz por suposição.
- Observability: C5/C8, HLC e códigos fixos sem transcrição; consulta de fontes existente mostra importação parcial.

## Handoff
S1 ~54k de referências + ~20k estimados de implementação/provas + ~15k de contrato público consultado: lote único abaixo de 150k, sem handoff de build. Verificador independente após o último build/gates. Base real anterior em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t15-items-before`; HEAD contém planejamento antigo, não usar git diff HEAD para atribuir mudanças da rodada.
