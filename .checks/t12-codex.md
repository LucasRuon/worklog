# T12 — integração local Codex

Profile: light (sem declaração no projeto). Base: `231e046`, árvore já continha a implementação T01–T11/T13/T16/T17 não commitada. Verificar somente a entrega T12 e seus pontos de integração; sem commits por `TASKS.md:40`.

Sources:
- `TASKS.md`, T12 e restrições globais — escopo e aceite.
- `docs/ESPECIFICACAO.md` — privacidade, identidades e tempo.
- `docs/ARQUITETURA.md` — contratos e fila comum.
- https://developers.openai.com/codex/hooks — descoberta e revisão nativa de confiança.
- https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/hooks/src/schema.rs — contrato exato da versão instalada (lido).

## Out of scope
- T14/T15: gestão completa de fontes e importação histórica. Hooks públicos atendem T12; não há parser de transcrição.
- App desktop: não encontrado em `/Applications` e `~/Applications`; não declarar ativo sem smoke.
- Escrita de confiança ou bypass de hooks, deploy, alteração de serviço/instalação pessoal e uso de modelos sem limite para comprovar a integração.

## Landing

`collectors/codex.ts` normaliza para `normalizeEvent`/`enqueueEvents`; `cli/hooks.ts` instala o contrato nativo, `cli/index.ts` recebe stdin sem abrir SQLite. `drainQueue` e projeções existentes consomem os eventos.

| Door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Contrato suportado | Codex CLI `0.167.0`, hooks.json; timestamps são de observação local | aceitar qualquer versão ou analisar transcrição privada como API estável |
| Replay nativo | recibo privado de eventos normalizados por fonte/sessão/agente/turno/ferramenta antes da fila; replay reutiliza horário e ID | regenerar horário no replay causa conflito no evento imutável |
| Hooks de subagente | `SubagentStart` abre só sessão; submissão abre turno; `SubagentStop` encerra turno sem encerrar sessão | iniciar turno no start usa ID do pai e duplica a execução; fim da resposta não comprova destruição do agente |
| Execução do hook | command nativo com paths absolutos shell-quoted, timeout 2 s, saída `{}` sem controle/contexto | args exec-form de Claude não fazem parte do contrato Codex |

## Checks

### S1 — sessões Codex no fluxo compartilhado · ~12 arquivos · ~90 KB de leitura · ~23k tokens

**C1** — SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, Stop, Interrupt, SubagentStart, SubagentStop e PreCompact geram exatamente os eventos de contrato declarados no teste, sem `human.interaction`.
Proof: `npm run test:unit -- tests/collectors/codex.test.ts` → `Codex: contrato 0.167.0 e privacidade`.

**C2** — Subagente com mesmo session_id do pai fica em sessão própria vinculada ao pai, sem turno duplicado no start; interrupção fecha execução como interrompida.
Proof: mesmo comando → `Codex: pai, subagente e interrupção nas projeções`.

**C3** — Reenvio do mesmo turno/ferramenta em outra captura mantém IDs/horários e é duplicado na ingestão; duas ferramentas distintas permanecem distintas.
Proof: mesmo comando → `Codex: fila offline, replay e escopo`.

**C4** — Versão desconhecida, schema sem campo obrigatório, evento desconhecido, fonte pausada e payload >1 MiB não persistem eventos; diagnóstico de rejeição contém somente código e data.
Proof: mesmo comando → `Codex: rejeições e diagnóstico sem payload`.

**C5** — Instalar duas vezes preserva configuração alheia, cria um só conjunto Worklog com timeout 2; remover preserva hook de outra instalação e pausa somente a fonte alvo. Não altera config.toml ou trust.
Proof: mesmo comando → `Codex: instalação seletiva, backup e confiança`.

**C6** — Hook compilado retorna exit 0 e `{}` sem stderr para entrada válida, inválida e base indisponível; a entrada válida fica na fila com SQLite fechado.
Proof: `npm run test:integration -- tests/integration/codex-hook.test.ts` → `Codex: entrypoint compilado fail-open e offline`.

**C7** — CLI nativa 0.167.0 carrega a configuração gerada sem alteração das políticas; smoke registra hooks executados ou revisão de confiança pendente explicitamente, sem marcar fonte não comprovada como ativa.
Proof: `npm run smoke:codex` → versão, diagnóstico de confiança e contagem real no relatório de execução; não depender de sucesso de modelo para atestar startup.

## Swept
- validation: C4; campos IDs/cwd/payload pelo validador compartilhado `core/events.ts`.
- failure modes: C4/C6, hooks fail-open e diagnóstico sem entrada bruta.
- idempotency/retry: C3 e recibos duráveis normalizados.
- authorization: C3; `queue.ts` exige fonte habilitada e root/workspace autorizado, nega root pausada e symlink externo.
- concurrency/ordering: C3/C5; criação exclusiva de recibo/lock de config, replay compartilhado, projeções ordenam por horário observado.
- data lifecycle: fila apagada somente após append; recibos mantidos para idempotência, retenção ampla é T23.
- dependency failure: C6/C7, UI/SQLite fora do caminho do hook; confiança permanece nativa.
- state transitions: C1/C2; PostToolUse significa chamada concluída, não teste aprovado; fim ausente continua incompleto.
- observability: C4/C7; diagnóstico privado por fonte e docs; UI ampliada é T14.

## Handoff

S1 ~23k de leitura, abaixo de 150k; um batch de build, verificador independente ao final. Sem handoff de build necessário.
