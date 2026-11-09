# T15 — log durável OpenCode v2 — verificação independente

**Verdict: PASS — 7/7 checks comprovados no perfil light.**

- **Data:** 08/11/2026.
- **Profile:** light; sem fault injection. Recomputação de Coverage e avaliação obrigatória de Test policy pertencem a standard/ui e não foram executadas. O checklist não contém essas tabelas.
- **Round:** 1 — todos C1–C7 deste checklist, sem herdar veredictos da auditoria anterior de 33 checks.
- **Verifier:** agente independente do autor; leitura e execução próprias das provas, sem delegação.
- **Referência Git:** HEAD `231e046be73f25c4ecc55aa0790cf796a9590312` + árvore de trabalho existente. Os arquivos da feature estão untracked; a prova se aplica aos bytes atuais, não ao conteúdo do commit isolado. Não existe diff versionado que permita atribuir toda a árvore a esta entrega; o escopo foi o checklist e os caminhos indicados pelo usuário.
- **Findings por prioridade:** nenhum defeito concreto bloqueante ou não bloqueante identificado neste escopo/perfil.

## Fontes e fronteiras lidas

Leitura integral de `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md` e `.checks/t15-opencode-log.md`, além da skill principal. Lidos `TASKS.md`, `docs/FONTES-HISTORICO.md` e `docs/ESPECIFICACAO.md`.

Referências pertinentes: `TASKS.md:303–317` (T15 e aceite parcial); `docs/FONTES-HISTORICO.md:22–63` (formatos disponíveis, período, retomada, proveniência e limites); `docs/ESPECIFICACAO.md:48–78` (identidade, tempo, incerteza e privacidade), `:90` (idempotência) e `:113–123` (segredos e limites de aceite).

Lidos integralmente o parser `src/collectors/opencode-history.ts`, integração `src/collectors/history.ts`, fixture, dois arquivos de testes e `scripts/smoke-opencode-history.ts` **antes** de executar o smoke. Releitura dirigida dos caminhos compartilhados de normalização, projeção, autorização, persistência, controles de fonte, CLI e diagnóstico.

Escopo aprovado: parser **offline opt-in `opencode-log-v1`**, fontes 2.2.5/2.2.6 e envelope durable v1, usando configure/import existentes. Sem tela nova, migração nova ou endpoint Worklog novo nesta feature. O suporte ao vivo/plugin pessoal não é aceito nem ampliado por este relatório. O OpenAPI descrito no checklist é contexto fornecido pelo autor; não foi consultado novamente pelo Verifier. C1–C6 têm evidência controlada; C7 tem evidência real delimitada.

## Gates executados pelo Verifier

Uma invocação por target; build precedeu os testes que usam `dist`. Comandos executados na árvore de trabalho acima.

| Comando | Resultado próprio |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; TypeScript + Vite |
| `npm run test:unit` | exit 0; **50 pass**, 0 fail/cancelled/skipped/todo |
| `npm run test:integration` | exit 0; **26 pass**, 0 fail/cancelled/skipped/todo |
| `npm run test:e2e` | exit 0; **28 pass**, desktop/mobile, sem falhas ou skips |
| smoke C7, comando abaixo | exit 0; caso real negativo aprovado |

### Cada teste nomeado existe e rodou

Busca dedicada `test\('` em `tests` com filtro `*opencode-history*.test.ts`: **cinco resultados**, todos presentes individualmente como `✔` na execução dos targets. A tentativa inicial de `rg -n -A 110 ...` retornou `command not found: rg`; a localização foi feita com a ferramenta Grep e os corpos foram lidos integralmente com Read.

| Teste exato | Localização | Target / resultado |
|---|---|---|
| `log v2: metadados, origem e identidade compartilhada com coleta ao vivo` | `tests/collectors/opencode-history.test.ts:27` | unit / PASS |
| `log v2: período, limites e projeção sem conteúdo` | `tests/collectors/opencode-history.test.ts:61` | unit / PASS |
| `log v2: identidade, autorização e formatos desconhecidos` | `tests/collectors/opencode-history.test.ts:81` | unit / PASS |
| `log v2: cancelamento, retomada e integridade do watermark` | `tests/collectors/opencode-history.test.ts:113` | unit / PASS |
| `histórico CLI v2: parser nativo, replay e recusa de origem` | `tests/integration/opencode-history-cli.test.ts:11` | integration / PASS |

## Checks

Todos os caminhos abaixo são relativos ao repositório. As expressões citadas foram conferidas no arquivo e executadas pelo target correspondente.

| Check | Prova executada e assertion localizada | Resultado |
|---|---|---|
| **C1** — projeção, origem, ferramenta e pai | Teste unitário `:27`, laço explícito para `['2.2.5', '2.2.6']` em `tests/collectors/opencode-history.test.ts:28`. Em `:34`: `assert.deepEqual(new Set(events.map((e) => e.type)), new Set(['session.start', 'turn.submit', 'turn.start', 'tool.start', 'tool.end', 'turn.end', 'session.interrupt']))`; em `:35`: `assert.ok(events.every((e) => e.sourceId === f.source.id && e.nativeSessionId === 'native-log' && e.parentSessionId === 'parent-session'))`. Em `:36`, ferramentas são `['Bash', 'Bash']`; em `:37`, `session.start` tem `reason === 'compact'`; em `:38`, interrupção tem `reason === 'user'`. Variantes failed/error são assertadas em `:55–57`. | **PASS** |
| **C2** — identidade compartilhada e replay zero | Mesmo teste. `tests/collectors/opencode-history.test.ts:31` cria o evento live com `prepareCapture(... normalizeEvent(f.source, projectV2Event(...)))` antes da importação; `:32–33` assertam 7 inserções, 8 eventos e `assert.equal(events.filter((e) => e.eventId === live.eventId).length, 1)`. Em `:39`: `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0); assert.equal(f.allEvents().length, 8)`. Implementação em `src/core/policy.ts:73` deriva `eventId: stableId(source.id, raw.originId, String(raw.type))`, e `src/collectors/opencode-history.ts:95–99` usa diretamente a projeção/normalização compartilhadas. | **PASS** |
| **C3** — período e privacidade sem tempo humano/revisões/fim artificial | Testes unitários `:27` e `:61`. `tests/collectors/opencode-history.test.ts:64–68` usa `[09:00:04,09:00:06)` e confirma somente `['tool.start', 'tool.end']`, com horários exatos `09:00:04.000Z` e `09:00:05.000Z`. Em `:69` e `:43`: `assert.equal(JSON.stringify(...).includes('PRIVATE_TRANSCRIPT'), false)`; a fixture coloca esse sentinela em título/texto/args/token/resultado (`tests/opencode-log-fixture.ts:4–9`). Em `:42`: `assert.equal(deriveTime(f.ctx, filter).humanEstimatedMs, 0)` e `assert.equal(events.some((e) => e.type === 'session.end'), false)`; em `:44`: `assert.equal(...count(*) n FROM file_revisions...n, 0)`. O conjunto fechado de tipos em `:34` também exclui sinais humanos/arquivos; a fixture inclui `session.execution.succeeded` em `tests/opencode-log-fixture.ts:11`. | **PASS** |
| **C4** — recusas e diagnósticos | Teste unitário `:81`. `tests/collectors/opencode-history.test.ts:85–92` enumera raiz externa, versão de sessão, durable futuro e timestamp inválido e exige `assert.equal(result.imported, 0); assert.equal(result.complete, false); assert.deepEqual(result.warnings, [c.code])`. `c.code` é literal na tabela adjacente. Em `:95–100`, sessão estrangeira/seq inválida exigem `HISTORY_SOURCE_MISMATCH` ou `HISTORY_SEQUENCE_INVALID`, `complete=false` e somente 1 evento confirmado. `:102–106` exige `['HISTORY_ROOT_UNAUTHORIZED']` para mudança externa e raiz pausada; `:107` exige `['HISTORY_VERSION_UNSUPPORTED']` para fonte futura; `:109`: `await assert.rejects(importHistory(...), { code: 'HISTORY_SOURCE_UNAVAILABLE', status: 409 })` para fonte pausada. | **PASS** |
| **C5** — cancelamento, prefixo, retomada e watermark | Teste unitário `:113`. `tests/collectors/opencode-history.test.ts:118`: `assert.equal(first.imported, 1); assert.deepEqual(first.warnings, ['HISTORY_CANCELLED']); assert.equal(first.complete, false)`. `:119` limita a 2 inserções e exige `['HISTORY_MORE_AVAILABLE']`; `:120`: `assert.equal(rest.imported, 5); assert.equal(rest.complete, true); assert.equal(f.allEvents().length, 8)`. `:121`: `assert.deepEqual(await readFile(f.path), before)` e replay 0. Casos sem marker, truncado e seq divergente em `:122–124` exigem `complete=false`, código de truncamento/sequência e contagem preservada; JSON inválido em `:126–127` exige `['HISTORY_RECORD_INVALID']` sem sentinela no diagnóstico. | **PASS** |
| **C6** — CLI compilado e recusa de outra ferramenta | Teste de integração `:11`. `tests/integration/opencode-history-cli.test.ts:14–18` usa path com espaços, `dist/cli/index.js`, parser opt-in e período explícito. Em `:19`: `assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).imported, 8); assert.equal(JSON.parse(first.stdout).complete, true)`. `:20` exige replay 0; `:21` exige 8 eventos/8 proveniências. `:22`: `assert.equal(wrong.status, 1); assert.match(wrong.stderr, /HISTORY_SOURCE_MISMATCH/)`. Em `:23`, sentinela ausente de stdout/stderr; `:24`, bytes originais preservados; `:26`, input nativo sem eventos retorna exit 1 e `['HISTORY_UNAVAILABLE']`. | **PASS** |
| **C7** — smoke real negativo delimitado | Comando abaixo, exit 0. `scripts/smoke-opencode-history.ts:21–25` revalida versão e faz somente GET da sessão/root e GET log `follow=false`; `:30–40` reduz os campos antes da escrita em `:48`. Em `:59`: `assert.equal(result.imported, 0); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_UNAVAILABLE'])`; `:61`: `assert.equal(replay.imported, 0)`; `:63–64` exclui eventos humanos/arquivos/session.end e exige zero revisões. Saída real: installed 2.2.6, nativeFrames 1, expectedIds 0, imported 0, replayInserted 0, complete false, warnings HISTORY_UNAVAILABLE, nativeHistoryProven false. | **PASS — ramo negativo** |

### C7 — evidência real, separada da fixture controlada

```sh
npm run smoke:opencode-history -- --session ses_e4e74febcffeVbMLOB7emzsJLn --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --from 2026-11-06T00:00:00.000Z --to 2026-11-09T00:00:00.000Z
```

Saída observada:

```json
{
  "passed": true,
  "installed": "2.2.6",
  "session": "ses_e4e74febcffeVbMLOB7emzsJLn",
  "parser": "opencode-log-v1",
  "nativeFrames": 1,
  "expectedIds": 0,
  "imported": 0,
  "replayInserted": 0,
  "complete": false,
  "warnings": ["HISTORY_UNAVAILABLE"],
  "nativeHistoryProven": false,
  "fileRevisions": 0,
  "sourceReadOnly": true,
  "scope": "one-authorized-session-temporary-store"
}
```

O script cria store/fixture privados temporários e executa shutdown/remoção em `scripts/smoke-opencode-history.ts:45–48,66`. Não há pedido de modelo ou criação de sessão nesse caminho. O servidor estava disponível. Esta execução comprova a consulta autorizada e a recusa de completude quando não há eventos; o ramo positivo de comparação de IDs (`:60`) **não foi exercitado no ambiente real**. Não houve tentativa de fabricar histórico.

## Swept existing — releitura dos caminhos pertinentes

| Restrição existente | Evidência no código e conclusão |
|---|---|
| Fonte local/habilitada, identidade e pausa | `src/collectors/history.ts:27–30` exige instalação local e fonte habilitada. `src/collectors/source-config.ts:26–27` aplica controles/tombstones ao listar fontes; `src/collectors/queue.ts:27–35` confere origem e manifesto antes da captura. Restrição existente confirmada. |
| Raízes e política, sem descoberta automática no import | `src/collectors/opencode-history.ts:44–47,71–82` autoriza cwd inicial e reaplica em location/moved; `src/core/projects.ts:81–90` resolve raiz mais específica e recusa pausada. `src/collectors/history.ts:177–180` reaplica autorização e `prepareCapture`; `src/collectors/queue.ts:29–35` canonicaliza cwd e aplica `captureDecision`. Importação exige raiz já matched antes de chegar ao caminho de descoberta de workspace; não cadastra diretório do log. |
| Privacidade e validação antes de persistir | `src/collectors/plugins/opencode-projector.ts:14–26` constrói allowlist de metadados; `src/core/policy.ts:67–79` normaliza/valida; `src/collectors/history.ts:168–171` restringe tipos importáveis. `src/collectors/opencode-history.ts:18–33,52–73,87–98` limita IDs/tempos/UTF-8/versão/tamanho. Limites confirmados: arquivo 64 MiB, frame 1 MiB, 10000 frames; testes em `tests/collectors/opencode-history.test.ts:70–77`. |
| Imutabilidade e proveniência separada | `src/core/events.ts:86–102` compara conteúdo de ID existente, nunca o reescreve; conflito lança erro. `db/migrations/001_events.sql:23–24` impede UPDATE/DELETE de eventos. `src/collectors/history.ts:183–188` insere proveniência apenas na primeira inserção, na transação de append. `db/migrations/010_history.sql:19–23` guarda proveniência separada. Restrição existente confirmada; C1 prova mixed e C6 confere a contagem de proveniências. |
| Retomada, ordenação e concorrência | `src/collectors/history.ts:134–147,183–199` evita duas execuções da mesma fonte no mesmo contexto, confirma prefixos por append e preserva warnings/estado. O parser relê o snapshot e reconstrói contexto/ferramentas; IDs persistidos deduplicam. `src/collectors/opencode-history.ts:56–79,101` exige sequência contígua, marker correspondente e rejeita EOF sem marker. Limite é por inserções (`history.ts:192`), sem checkpoint de byte para este parser. C5 confirma retomada/imutabilidade da origem. |
| Falhas, estados e observabilidade | `src/collectors/history.ts:194–199` só confirma complete após consumo sem warnings e converte falhas em códigos sem payload. CLI em `src/cli/index.ts:92–105` expõe resultado, cancela por signal e diferencia erro de continuação; `src/collectors/source-status.ts:24–25` expõe contagens/warnings do último run. `src/collectors/plugins/opencode-projector.ts:14–23` não projeta execução bem-sucedida/idle como session.end. Falhas de CLI/servidor no smoke são reduzidas ao código controlado em `scripts/smoke-opencode-history.ts:68`; esse ramo não foi necessário nesta execução. |

## Nível e limites das provas

- C1–C5 exercitam parser + normalização + persistência real em stores temporários com **log sintético controlado**. As versões 2.2.5/2.2.6 e variantes failed/error estão no teste nomeado; isso não demonstra toda a variedade de logs de produção.
- C2 prova sobreposição live com um evento construído pelo projector/normalizador compartilhados e replay do conjunto; não é uma captura positiva do plugin pessoal nesta rodada nem uma prova exaustiva de todas as intercalações.
- C6 atravessa a fronteira de processo do CLI compilado. Os 28 E2E são regressão ampla; não são apresentados como teste UI específico do novo parser offline.
- Perfil light: sem mutantes, recomputação exaustiva de membros ou Test policy obrigatório. Não há alegação de que as assertions discriminariam toda implementação incorreta possível.
- Snapshot finito, limites de tamanho/frames e autorização por raiz continuam aplicáveis. `complete` trata somente os registros disponíveis e o watermark desse input, não toda a história da ferramenta. Prefixos confirmados podem permanecer quando um registro posterior é recusado.
- O único resultado real de C7 é **indisponibilidade histórica explicitamente diagnosticada**. Recuperação histórica positiva OpenCode v2, demais parsers Claude/Codex, aceite integral T15/M3 e piloto de um dia T24 permanecem pendentes fora deste PASS.

## Identidade dos inputs verificados

SHA-256 conferidos após todos os comandos, antes da escrita deste relatório:

| Arquivo | SHA-256 |
|---|---|
| `.checks/t15-opencode-log.md` | `d43f9a85e9fbebe98e60af8dfa1f2e432b3bcfb7cd52681ea3f3e5e4eb93b3d2` |
| `src/collectors/opencode-history.ts` | `eb9a48ffb932fdb3a8b7e7e571f3d387d16c081aeacf94985d6b9e963f4b13c5` |
| `src/collectors/history.ts` | `4ca6fc632e6a56f74c2d20016902d8dbf2e36b4c236edb51358ee2be23999926` |
| `tests/opencode-log-fixture.ts` | `2774d115ee54b88d1750fa40efb5292e8cbf0f6fe893540aeddc5d79a0e15a4b` |
| `tests/collectors/opencode-history.test.ts` | `93cd7fa21af94d12b760c6c4c4aff32a9440b854a9654874f351453f2d0c2e17` |
| `tests/integration/opencode-history-cli.test.ts` | `ea785b5c9ceba31e1f86f33c141d921433f971ec7fb963b188c784f8a0a3ee49` |
| `scripts/smoke-opencode-history.ts` | `2d3ece7cb6ecab217d1c9d5a5adb3af27693c3d93ef025a3b844937fabf656b9` |

O status Git dos caminhos versionados/untracked manteve o mesmo estado inicial após as provas; HEAD permaneceu o mesmo. Build e E2E produziram seus artefatos derivados habituais. A única edição deliberada do Verifier é este relatório via apply_patch; código, testes, checklist e documentação de produto não foram editados, sem commits ou alterações de serviços/configurações/plugins pessoais.
