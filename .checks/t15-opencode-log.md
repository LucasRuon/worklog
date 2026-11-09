# T15 — log durável OpenCode v2

Profile: light. Sources: `TASKS.md` T15; `docs/ESPECIFICACAO.md` (histórico, privacidade, identidade e incerteza); `docs/FONTES-HISTORICO.md`; contrato OpenAPI do servidor instalado **2.2.6** consultado via `opencode api GET /openapi.json` em 08/11/2026; projector v2 já usado pelo plugin 2.2.5.

Contrato concreto: GET `/api/experimental/session/{sessionID}/log?follow=false`, SSE com `data` JSON `SessionLogItemEncoded`. Eventos duráveis têm `id`, `created`, `type`, `durable:{aggregateID,seq,version:1}` e `data.sessionID`; `session.created.data` contém `version`, `location.directory` e `parentID` opcional. `log.synced` fecha o watermark. A versão atual é 2.2.6, não presumir que 2.2.5 continue instalada. Banco legado e export de transcrição não equivalem ao log v2.

## Boundary

Novo parser offline `opencode-log-v1`, input SSE obtido explicitamente do log nativo; fonte OpenCode 2.2.5/2.2.6 e envelope durable v1. Reutilizar CLI configure/import, normalização, eventos/proveniência e IDs do plugin. Nenhuma dependência, migração, endpoint Worklog ou consulta externa automática. Não importar transcrições, prompts/args/resultados, revisões nem sinais humanos. Não instalar/alterar plugins/serviços pessoais nesta entrega. Parsers Claude/Codex e piloto de um dia seguem separados.

## Landing

| Door | Shape | Alternative rejected |
|---|---|---|
| Autoridade histórica v2 | log durável nativo SSE v1 com IDs originais, `session.created` e `log.synced`; parser opt-in `opencode-log-v1` | interpretar SQLite legado como v2 ou derivar eventos de uma transcrição sem IDs originais |
| Retomada | reler metadados do log desde início, deduplicando por IDs persistidos e reconstruindo contexto/ferramentas; limite existente por inserções | checkpoint em byte que perdesse contexto de sessão/nome da ferramenta |
| Completude | `complete` só após watermark válido; log vazio é `HISTORY_UNAVAILABLE`; evento desconhecido/schema futuro/truncamento são diagnósticos sem payload | tratar EOF ou ausência de eventos como histórico completo |
| Escopo | autorizar diretório de `session.created` antes de projetar demais eventos; mudança de diretório reaplica autorização | cadastrar automaticamente a pasta indicada pelo arquivo importado |

## Checks

### S1 — importação de log nativo · ~9 arquivos · ~80KB / 4 ≈20k tokens

**C1** — Log v1 de fonte 2.2.5/2.2.6 preserva eventos de sessão/submissão/turno/ferramenta/interrupção/compactação e origem; nome da ferramenta vem de input.started e pai permanece relação separada.
Proof: `npm run test:unit -- tests/collectors/opencode-history.test.ts` — `log v2: metadados, origem e identidade compartilhada com coleta ao vivo`.

**C2** — Repetir o input ou sobrepor evento já capturado ao vivo insere zero duplicados; IDs são os de `normalizeEvent(source, projectV2Event(...))` e não IDs por posição no arquivo.
Proof: mesmo teste C1.

**C3** — Importação respeita `[from,to)`, não persiste texto/args/resultados/credenciais, sinais humanos ou revisões; não transforma execução/idle em dedicação nem encerra sessão sem evidência explícita.
Proof: mesmo teste C1 e `log v2: período, limites e projeção sem conteúdo` no mesmo arquivo.

**C4** — Origem divergente, raiz externa/pausada, mudança para diretório externo, versão de fonte/sessão incompatível, envelope durable futuro ou sequência inválida retornam diagnósticos `HISTORY_*` e não persistem o registro recusado.
Proof: `log v2: identidade, autorização e formatos desconhecidos` no mesmo arquivo.

**C5** — Cancelamento/limite preservam prefixo confirmado; retomada alcança o watermark sem duplicação; arquivo não é modificado. Truncamento/JSON inválido/marker ausente ou watermark divergente não têm `complete=true`.
Proof: `log v2: cancelamento, retomada e integridade do watermark` no mesmo arquivo.

**C6** — CLI compilado configura/importa parser nativo com path com espaços, período explícito, replay zero e diagnóstico privado; outras ferramentas são recusadas como `HISTORY_SOURCE_MISMATCH`.
Proof: `npm run test:integration -- tests/integration/opencode-history-cli.test.ts` — `histórico CLI v2: parser nativo, replay e recusa de origem`.

**C7** — Smoke real delimitado consulta somente a sessão autorizada via GET/log e não grava transcrição; log sem eventos retorna `HISTORY_UNAVAILABLE` e não é declarado piloto histórico concluído. Se houver eventos, compara IDs projetados com importados e replay zero.
Proof: `npm run smoke:opencode-history -- --session ses_e4e74febcffeVbMLOB7emzsJLn --root /Users/lucasruon/Downloads/Sistemas/Worklog --from 2026-11-06T00:00:00.000Z --to 2026-11-09T00:00:00.000Z` — script assertivo em store temporário, CLI instalado revalidado.

## Swept

- validation: C1/C4/C5, versão exata, timestamps/IDs, watermark, arquivo até64MiB/frame até1MiB; limite10000 frames explícito.
- failure modes: C4/C5/C7, warnings de código fixo sem conteúdo bruto.
- idempotency/retry: C2/C5, IDs nativos e transações existentes.
- authorization: C4, sourceFor exige instalação local/habilitada; roots cadastradas e política existentes; sem descoberta automática na importação.
- concurrency/ordering: C5, ordem durable estritamente crescente, reabrir log não altera eventos existentes; arquivo append/incompleto precisa de novo snapshot finito.
- lifecycle: C2/C3, eventos imutáveis e proveniência separada; input somente leitura.
- dependency failure: C7, CLI/servidor ausentes retornam diagnóstico controlado; nenhum pedido de modelo.
- state transitions: C1/C3, estados vêm dos eventos; idle/succeeded de execução não viram sessão encerrada.
- observability: C4–C7, contagens/complete/warnings via CLI/diagnóstico de fonte já existentes.

## Handoff

Um slice estimado20k, abaixo do orçamento150k; build no agente principal, Verifier independente recebe todos C1–C7 após provas verdes. A árvore anterior continua não commitada; preservar trabalho existente. Completude da T15 permanece parcial enquanto houver contratos nativos/aceites reais pendentes.

## Resultado

Red: quatro testes falharam por `HISTORY_INPUT_INVALID` antes do parser ser registrado. Green: typecheck/build, 50 unitários, 26 integração e 28 E2E. Compatibilidade com fila ao vivo conferida também com symlink/canonicalização; input permanece intacto. Nenhum commit/redeploy.

**Verifier independente: PASS, 7/7**, profile light; relatório `t15-opencode-log.verified.md`. Smoke real instalado2.2.6 retornou um frame final, sem eventos recuperáveis, `complete=false`/`HISTORY_UNAVAILABLE`; prova negativa de disponibilidade aprovada, recuperação positiva continua pendente. Atualizado backlog/guia/ambiente, incluindo revalidação pendente do plugin ao vivo 2.2.6, cujo guard segue2.2.5.
