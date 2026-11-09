# T15 — histórico Codex 0.167.0 e identidade live

Profile: light (padrão, sem AGENTS.md). Sem commits, push, deploy ou alteração de perfis pessoais, conforme TASKS.md.

Sources:
- Conversa: continuar implementações pendentes, começando pela lacuna histórica T15.
- `TASKS.md` T15, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md`, `docs/FONTES-HISTORICO.md`, `docs/CODEX.md`: histórico versionado, período, proveniência, origem, privacidade e replay sem horas humanas fabricadas.
- Contrato oficial tag `rust-v0.167.0` de https://github.com/openai/codex: `codex-rs/history/src/rollout_payload.rs:30–75`, `history/src/lib.rs:370–381`, `protocol/src/protocol.rs:3418–3496,3594–3634,2385–2438,4526–4558`, `rollout/src/policy.rs:128–227`, `hooks/src/schema.rs`: envelopes JSONL, metadados, contexto, lifecycle, timestamps em segundos e limites da persistência. Cópia de consulta em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t15-contracts`.

## Out of scope
- Logs Claude opacos, SQLite OpenCode v2, login, concessão de confiança, serviços pessoais, transcrições pessoais e modelos.
- Herdar contexto de forks/revert/subagentes, ler arquivos comprimidos/páginas referenciadas ou inferir IDs/timestamps de ferramenta: recusar formatos/linhagens não suportados. Este recorte implementa lifecycle de turnos de thread raiz; não fecha toda T15.
- Converter `session_meta`, timestamp externo de escrita, prompt/resposta ou ausência de mais registros em início/fim de sessão, submissão humana ou execução de ferramenta.

## Landing

Reutilizar `normalizeCodex`, `prepareCapture`, `appendEvent`, `event_provenance`, `history_runs`, fila offline e recibos privados existentes. Não alterar schemas de eventos nem afrouxar imutabilidade de `appendEvent`.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Parser versionado | `codex-rollout-0.167.0`, entrada JSONL escolhida por fonte local Codex 0.167.0; somente raiz sem contexto herdado; resultado inclui `HISTORY_LIFECYCLE_ONLY` | Interpretar qualquer transcrição/versão ou declarar cobertura integral sem lifecycle de ferramentas comprovado |
| Identidade entre histórico e hook | `task_started`/`turn_started` reutilizam ID de `turn.start` de UserPromptSubmit, sem fabricar turn.submit; task_complete/turn_complete reutilizam Stop; turn_aborted/interrupted reutiliza Interrupt. Somente horários explícitos `started_at`/`completed_at` em segundos | Usar timestamp de escrita, novos IDs por arquivo ou mudar eventos imutáveis para acomodar outro horário |
| Primeiro horário durável | Recibo individual `[EventInput]` em `codex-receipts/<stableId(sourceId,'codex-event-v1',eventId)>.json`, criação exclusiva por hard link; primeira captura permanece; seed de recibo legado calculado pelos IDs do batch original. Corpo divergente além do horário retorna conflito | Resolver só no SQLite — hook offline e corrida com importação não podem depender do banco aberto; fabricar os outros eventos do batch no histórico |
| Contexto sem atribuição comprovada | Snapshot `thread_settings_applied.thread_settings.cwd` diferente do cwd inicial é recusado neste recorte com HISTORY_CONTEXT_CONFLICT; contextos explícitos por turno continuam suportados | Assumir que um novo cwd global se aplica a eventos anteriores/posteriores sem vínculo por turno — atribuição possivelmente falsa |
| Sinalização da cobertura parcial na CLI | `HISTORY_LIFECYCLE_ONLY` mantém exit 1 mesmo junto de `HISTORY_MORE_AVAILABLE`; continuar por limite não significa cobertura completa | Reutilizar o exit 0 genérico de MORE_AVAILABLE — mascara a limitação de cobertura deste parser |

O recibo é persistido só após política/autorização e, na importação, seleção do período. Falha antes do append deixa recibo recuperável; cursor/proveniência seguem transacionais no banco. Nada mais nesta alteração é irreversível.

## Checks

### S1 — lifecycle histórico e recibos compartilhados · 16 arquivos de referência · 216.831 bytes · ~54k tokens

**C1** — JSONL de raiz 0.167.0, modos legacy e paginated, importa turn.start/end nos horários explícitos (segundos → UTC), usa cwd por turn_context, proveniência imported e zero sinais humanos/revisões/turn.submit/session.start/session.end; `[from,to)` exclui limites. Resultado é parcial com `HISTORY_LIFECYCLE_ONLY`.
Proof: `npm run test:unit -- tests/collectors/codex-history.test.ts`, teste `Codex rollout: lifecycle explícito, contexto, período e privacidade`.

**C2** — Importação depois de hook já persistido e antes de hook futuro preserva ID/primeiro horário/corpo dos eventos compartilhados. Nas duas ordens há um turn.start/end por turno; só o hook acrescenta turn.submit. Replay importa zero, inclusive após reabrir o store.
Proof: mesmo comando, teste `Codex rollout: sobreposição live nas duas ordens e recibo legado`.

**C3** — Mudança do corpo do mesmo ID (ex.: outcome failed versus completed) retorna `HISTORY_EVENT_CONFLICT` na importação ou `CODEX_EVENT_CONFLICT` no hook fail-open; não altera o evento anterior nem duplica tempo. Horário diferente sozinho conserva a primeira captura.
Proof: mesmo comando, teste `Codex rollout: conflitos conservam eventos imutáveis e falha explícita`.

**C4** — Horário explícito ausente/zero não vira timestamp externo nem duração derivada; diagnóstico `HISTORY_TIMESTAMPS_UNAVAILABLE`. task_complete.error preserva failed e turn_aborted interrupted preserva interrupted, sem fim de sessão.
Proof: mesmo comando, teste `Codex rollout: horários ausentes, falhas e interrupções não são fabricados`.

**C5** — Fonte divergente, versão desconhecida, raiz externa/pausada, symlink externo, ID/thread incompatível, fork/history_base/subagent_history_start_ordinal ou modo desconhecido são recusados antes de gravar eventos/recibos. Warnings não contêm payload privado.
Proof: mesmo comando, teste `Codex rollout: contrato e autorização negam entradas não suportadas`.

**C6** — Limite por inserções e cancelamento preservam o prefixo; retomada/replay não duplicam IDs. Linha final truncada retorna HISTORY_TRUNCATED; completar a linha recupera o evento faltante. Origem não é modificada.
Proof: mesmo comando, teste `Codex rollout: cancelamento, limite e truncamento retomáveis`.

**C7** — Entrada não regular/symlink, arquivo >64 MiB, linha >1 MiB, UTF-8 inválido, >10000 linhas, ordinal com gap e schema futuro retornam diagnóstico fixo sem payload; não geram evidência para o registro inválido.
Proof: mesmo comando, teste `Codex rollout: limites, sequência e schemas desconhecidos`.

**C8** — Duas capturas concorrentes em processos independentes escolhem um único recibo/horário por ID; drenagem posterior não gera conflito nem `.rejected`. A coleta continua offline e recibos em batch anteriores continuam aceitos.
Proof: `npm run test:integration -- tests/integration/codex-history-cli.test.ts`, teste `Codex: processos concorrentes compartilham recibo offline`.

**C9** — CLI compilado aceita configurar/importar `codex-rollout-0.167.0`, apresenta limite parcial explícito, replay importa zero e help anuncia parser. Falha/schema desconhecido não vaza payload nem altera fonte/configuração da ferramenta.
Proof: mesmo comando, teste `Codex rollout CLI: configuração, importação, replay e diagnóstico privado`.

## Swept
- Validation: C4/C5/C7; timestamps de execução nunca vêm da escrita externa.
- Failure modes: C3/C4/C6/C7; warning do recorte impede falso aceite completo.
- Idempotency/retry: C2/C6/C8; primeiro recibo durável é a identidade recuperável.
- Authorization: C5, política compartilhada antes de recibos; histórico só em raízes explicitamente cadastradas, sem descoberta automática.
- Concurrency/ordering: C8; hard link exclusivo existente reutilizado; `running`/yield/transações de histórico existentes; ordinal/cwd C1/C7.
- Data lifecycle: C2/C3/C6; eventos e proveniência imutáveis; backup de codex-receipts existente em `core/maintenance.ts` conserva novo formato de array unitário. Sem migração.
- Dependency failure: IO dos recibos falha fechado para persistência/fail-open para agente; importação reporta código fixo; offline C8.
- State transitions: C1/C4; ausência de início/fim de sessão permanece incompletude na projeção existente, não inventar lifecycle.
- Observability: C3–C7/C9; códigos allowlisted sem transcrição; importação parcial visível na consulta de fontes existente.

## Handoff
S1 ~54k de leitura de referência + ~20k estimados entre parser/recibos/provas, lote único abaixo de 150k. Sem handoff de build; verificador independente após a última alteração e gates. Base da rodada em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t15-codex-before`. HEAD não contém a implementação anterior (quase toda untracked); não usar git diff HEAD como diff desta rodada.

Fechamento: **C1–C9 PASS** por verificador independente em `.checks/t15-codex-rollout.verified.md`, rodada 2, perfil light, sem commit. A rodada 1 encontrou F1/F2 (marcadores de subagente/thread tardia) e F3 (HLC+MORE exit0); reproduções viraram testes red, foram corrigidas sem reduzir critérios e todas as provas foram reexecutadas. Nenhuma decisão do usuário mudou o escopo durante o build. Cobertura de ferramentas/linhagens adicionais não foi improvisada; nenhum histórico/perfil pessoal foi usado como atalho de aceite.
