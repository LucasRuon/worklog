# T15 Codex items — Verification

**Verdict: PASS — C1–C8, 8/8 comprovados no perfil light.**

- **Profile:** light, explicitamente solicitado; sem leitura de AGENTS.
- **Round:** 1 — full, extensão inteira, não apenas último lote.
- **Verifier:** subagente independente, author != verifier; READ-ONLY sobre implementação/provas/docs. Única escrita deliberada no projeto: este relatório.
- **Data:** 2026-11-08.
- **Escopo:** snapshot real `worklog-t15-items-before` → arquivos atuais; não `git diff HEAD`. Ambos os diretórios de referência ficam em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/`.

## Identidade do escopo

Li integralmente `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md` e `.checks/t15-codex-items.md`. Regenerei em memória o unified diff dos três arquivos de produção, dois testes novos e checklist contra o snapshot fornecido: resultado **idêntico** a `worklog-t15-items-review/feature.diff`, SHA-256 `fa2ee8049745d213dd0615bb9281d53788b7446d420cad3ae3c10900cec88513`.

Calculei os hashes atuais independentemente; todos coincidem com `worklog-t15-items-review/manifest.json`:

| Arquivo | SHA-256 atual |
|---|---|
| `src/collectors/codex-history.ts` | `187ee2a27ae56f1b07b0b58547286218bbd91b847d32331820a699952af6ca05` |
| `src/collectors/history.ts` | `3e4ef461c60236cd21afc48c27817e12e82c0c7de3503c0de22ecf07af69fe66` |
| `src/cli/index.ts` | `13c8f9f85b109b0a6b85f6af4b1b6dde56a72878964868270fb6ee2fa71ce7f5` |
| `tests/collectors/codex-history-items.test.ts` | `5553f1d16aae9798cb4c488e685c304df2cdbe9e7b0f27cbb05aee087d5acdbf` |
| `tests/integration/codex-history-items-cli.test.ts` | `e5f5b41d3091c575fef0d019da8edf0a5ce0951edd2fa67c034c715a68600121` |
| `.checks/t15-codex-items.md` | `6fa4ed71b4793a02da7f63f3cab374529a199c96774c05954754c8da067ef7df` |

O snapshot tem 14 arquivos. Hashes anteriores dos arquivos de produção alterados: `codex-history.ts` = `78255f1224bc1b6fe73a2c37b19120d53e6a53603a6f5cd41b6d30f66f1e21db`; `history.ts` = `1dc265346f5b52641eadf5e4debe7bfc3725c191b84ed3b3fb4cf3550d89f0e0`; `src/cli/index.ts` = `fe993ee2d1ab4033f42452793b2743e4b193c74a8f74acdf95139a4a32bd2634`.

Confirmei igualdade byte a byte ante o snapshot de `src/collectors/codex.ts`, `src/collectors/codex-receipts.ts`, `tests/collectors/codex-history.test.ts` e `tests/integration/codex-history-cli.test.ts`. Os dois novos testes realmente fazem parte do diff autoral.

Docs inspecionados por trechos relevantes: `README.md:25`, `TASKS.md:54,325–329`, `tasks.csv:16`, `docs/CODEX.md:59`, `docs/FONTES-HISTORICO.md:74–88`, `docs/PROGRESSO.md:5–11`: opt-in separado e T15 parcial preservados. `.checks/PROXIMA-SESSAO.md` não foi lido nesta revisão; sua edição pessoal alheia não é atribuída à extensão nem usada como prova. `feature.diff` cobre produção/provas/checklist, não pretende representar todas as alterações documentais.

## Provas executadas pelo Verifier

| Comando | Resultado próprio |
|---|---|
| `npm run test:unit -- tests/collectors/codex-history-items.test.ts tests/collectors/codex-history.test.ts` | exit 0; **68 pass**, 0 fail/cancelled/skipped/todo |
| `npm run test:integration -- tests/integration/codex-history-items-cli.test.ts tests/integration/codex-history-cli.test.ts` | exit 0; **3 pass**, 0 fail/cancelled/skipped/todo |
| `npm run typecheck` | exit 0; `tsc --noEmit` |

O runner nomeou individualmente os sete testes v2 unitários, seus subcasos e o teste CLI v2; todos rodaram. Também executou as regressões v1 e a prova multiprocesso. Os totais incluem subtestes; não são oito testes independentes por critério. A tentativa inicial de localizar assertions com `rg -n -C 4` falhou porque `rg` não está instalado (exit 127); substituí por `functions.grep`, com linhas localizadas de `test` e `assert` nos dois arquivos. Não há filtro sem hits.

## Checks

Abreviações de caminhos nesta tabela: **U** = `tests/collectors/codex-history-items.test.ts`; **I** = `tests/integration/codex-history-items-cli.test.ts`. As localizações abaixo referem-se aos hashes atuais acima.

| Check | Assertion localizada e alcance | Resultado |
|---|---|---|
| **C1** | U:41 `assert.equal(result.imported, 4)`; U:43 tipos exatamente `['tool.start', 'tool.end', 'tool.start', 'tool.end']`; U:44 horários `[100, 200, 300, 400].map((ms) => new Date(at + ms).toISOString())`; U:45 nomes `['Bash', 'Bash', 'apply_patch', 'apply_patch']`; U:46 `e.cwd === nested`; U:47 `JSON.stringify(rows).includes('PRIVATE_') === false`; U:48 contagem de revisões zero. Tipos exatos excluem humanos/lifecycle. Contexto colocado depois dos itens no caso U:39. | **PASS** |
| **C2** | U:53 executa `history-first` e `live-first`; U:60 `assert.equal(JSON.stringify(f.allEvents()), before)` e comprimento 4; U:61 primeiro horário esperado `at + (order === 'live-first' ? 5000 : 100)`; U:62 replay `.imported === 0`; U:65 warning `HISTORY_EVENT_CONFLICT`; U:66 corpo inteiro permanece `before`. `before` é o snapshot local imediatamente anterior, não um esperado construído em helper externo. | **PASS** |
| **C3** | U:79 filho com comprimento 4, `nativeSessionId === f.rootId && parentSessionId === f.rootId && cwd === f.root`; U:80 tipos exatos `['turn.start', 'tool.start', 'tool.end', 'turn.end']`; U:81 início `at + 10000`; U:84 `sessions.length === 2`; U:85 `agent.parentSessionId === parent.id`, proveniência `imported`; U:86 `agentAccumulatedMs === 90000`, `agentWallMs === 60000`, `humanEstimatedMs === 0`. Prefixo herdado com metadata/contexto alheios não gera projeção. | **PASS** |
| **C4** | U:92 ambas as ordens; U:101 eventos sem `turn.submit` permanecem iguais ao snapshot local `before`; U:102 total 5 e exatamente um `turn.submit`; U:103 todos com `nativeAgentId === f.childId`; U:104 diagnóstico `CODEX_CAPTURE_OK`; U:106 reabertura/replay `.imported === 0`, total ainda 5. U:82 `assert.deepEqual(child.at(-1)!.payload, { outcome: 'completed' })` exclui `turnId` do término, diferenciando SubagentStop de Stop. O importador descarta submit em `src/collectors/codex-history.ts:142`. | **PASS** |
| **C5** | U:112–118 tabela local legível: MCP/source/status failed/declined/in_progress, duration-only zero e end-only; U:123 `assert.equal(result.imported, expected)`, `complete === false`, warnings incluem `warning` e `HISTORY_LIFECYCLE_ONLY`. Valores `expected`/`warning` estão nessa própria tabela, não ocultos em helpers. U:124 somente `tool.end` pode existir no end-only; U:131 inclui `HISTORY_CHILD_INTERRUPT_UNAVAILABLE`, importados 3; U:132 todos do filho e nenhum `turn.end`/`session.interrupt`. | **PASS** |
| **C6** | U:137 lista os 12 subcasos parent/depth/review/root-id/boundary/ordinal/fork/late-thread/own-meta/outside/paused/symlink, todos nomeados no resultado executado; U:154 `result.imported === 0`, eventos zero, diretório de recibos vazio; U:155 warning não-HLC e resultado sem `PRIVATE_`. Complemento estático: `src/collectors/codex-history.ts:67–96` valida linhagem, filtra prefixo e autoriza metadata/contextos próprios antes do primeiro yield de evento. Prefixo não substitui autorização de `meta.cwd` (linha 83). | **PASS** |
| **C7** | U:165 cancelamento importados 1 + `HISTORY_CANCELLED`; U:166 limite 1 + `HISTORY_MORE_AVAILABLE`; U:167 retomada importados 2 e bytes de input iguais a `original`; U:169–170 `HISTORY_TRUNCATED`, completar linha importa 2 e replay 0; U:172 sem história própria importa 0 + `HISTORY_OWN_HISTORY_UNAVAILABLE`; U:174–175 UTF-8 inválido importa 0 sem alterar eventos; U:176–178 warnings `HISTORY_INPUT_TOO_LARGE`, `HISTORY_RECORD_TOO_LARGE`, `HISTORY_NATIVE_SCAN_LIMIT` nos limites declarados. Sequência também coberta na regressão v1 executada e no subcaso ordinal C6. Leitor compartilhado `src/collectors/codex-history.ts:22–51` aplica limites/UTF-8/sequência ao arquivo inteiro antes de filtrar prefixo na linha 72; contexto é resolvido antes de emitir, linhas 85–99. | **PASS** |
| **C8** | I:21 v1 `.imported === 0` + `HISTORY_LINEAGE_UNSUPPORTED`; I:22 recibos zero; I:23 configure v2 status 0; I:24 primeiro import status 1, importados 1 e warnings exatamente `['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']`; I:25 replay status 1/importados 0; I:26 ampliar limite superior de +500 para +501 importa 1; I:27 help casa `/codex-rollout-v2-0\.167\.0/`; I:29 fonte/input inalterados; I:30 dois eventos, ambos da raiz/filho esperados. A janela começa no próprio +100 e exclui +500, exercitando `[from,to)` pelo CLI compilado. | **PASS** |

### Nível e amostragem

C1–C7 são testes da camada coletor/importador com store real de fixture, normalização, recibos/fila live e projeções quando pertinentes; não meros mocks de uma função. C8 cruza a fronteira de processo usando `node dist/cli/index.js`. A regressão concorrente usa quatro processos e comprova primeiro horário/duplicação do mecanismo compartilhado, não concorrência exaustiva específica de cada item v2.

Amostragem explícita: dois tipos de ferramenta suportados; duas ordens live/history; sete variantes negativas de ferramenta/relógio; 12 variantes de linhagem/autorização; um cenário de sobreposição pai/filho; fixtures sintéticas. Limites com prefixo herdado e combinação limite+contexto tardio não têm teste cruzado dedicado: suporte é inspeção do leitor global antes do filtro e da passagem de contexto antes do yield, além das provas separadas C1/C6/C7. Isso não é uma alegação de exploração exaustiva.

## Swept — restrições existentes relidas no código

| Restrição | Evidência observada | Resultado / limite |
|---|---|---|
| Recibos canônicos, retry e não-rewrite | `src/collectors/codex-receipts.ts:21–24,34–57`: comparação exclui somente horário e retorna observação anterior; `linkSync` exclusivo, EEXIST relê vencedor; `src/core/events.ts:89–93`: transação e conflito de conteúdo. C2/C4 executados. | Presente; PASS. |
| Autorização antes dos recibos | `src/collectors/history.ts:178–183`: resolveProject e prepareCapture precedem canonicalCodexEvent; `src/collectors/queue.ts:21–35`: fonte, realpath, enabled/política; `src/core/projects.ts:81–90`: roots canônicas e pausa. `codex-history.ts:22–51,65–96,106–121` não abre caminhos de history_base/item. | Presente; PASS; não promete impedir toda corrida externa de filesystem. |
| Exclusão entre processos | `tests/integration/codex-history-cli.test.ts:19–24`: processos sem erro, uma ocorrência de horário por ID, `drained.inserted === 2`, `duplicates === 6`, `rejected === 0`; executado nesta rodada. Mecanismo em `codex-receipts.ts:48–57`. | Presente; PASS no cenário existente. |
| Backup/restore existentes de eventos e recibos | `src/core/maintenance.ts:86–92`: snapshot SQLite e cópia de codex-receipts; linhas 124–125,139–147: restauração e validação de hash/recibos. Nome de recibo individual segue UUID permitido. | Presente por inspeção; backup/restore não executados nesta rodada. |
| Reader readonly e falha de recibo | `codex-history.ts:23` abre O_RDONLY/O_NOFOLLOW/O_NONBLOCK; `history.ts:180–183` converte falha em `HISTORY_RECEIPT_UNAVAILABLE`/conflito; `history.ts:208–214` preserva resultado parcial. C7 confirma bytes inalterados. | Presente; falha de I/O de recibo não foi injetada. |
| Observabilidade parcial existente | `src/collectors/source-status.ts:25–26` expõe state/imported/skipped/warnings do history_runs; `history.ts:207–211` marca partial quando há warnings; C5/C8 assertam HLC/exit1. | Presente por inspeção e importações executadas; consulta HTTP/UI de fonte não executada. |

## Fontes, etapas não aplicáveis e limites

- Perfil light: comparação integral contra fontes binding/UI, recomposição formal de Coverage, julgamento de Test policy e fault injection **não exigidos e não realizados**. Checklist não contém seções Coverage ou Test policy. Nenhuma mutação foi aplicada.
- Consulta pontual somente a cópias públicas locais Rust: `worklog-t15-contracts/protocol.rs:2176–2191` (ItemCompleted, relógios opcionais/default zero), `protocol.rs:3481–3490` (borda própria exclui contexto herdado), `core__src__hook_runtime.rs:196–218` (contexto host do hook). Não equivale a auditoria integral das fontes versionadas.
- Nenhum acesso a serviço, modelo, perfil/transcrição pessoal, commit, push ou deploy. Nenhuma reprodução com dados pessoais. Nenhum teste/assertion foi alterado.
- Não executei E2E, build novo ou a suíte completa. O CLI compilado disponível foi efetivamente executado nas provas; também confirmei seus marcadores v2/child interrupt em `dist`. Os números 122/31/30 e build do autor **não** são resultados deste Verifier.
- PASS refere-se aos oito critérios deste recorte e a estes hashes, não a cobertura integral T15/T12/T24, ferramentas/status fora do contrato, subagentes aninhados ou amostra histórica real.

**Lacunas bloqueantes encontradas: nenhuma. Fault injection: não aplicável ao perfil light.**
