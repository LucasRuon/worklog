# T15 — extensão nativa delimitada: verificação independente

**Verdict: PASS — C1–C5, 5/5 comprovados no recorte.**

**Profile:** light (nenhum AGENTS.md encontrado no workspace).
**Round:** 1 — full, lote único.
**Verifier:** subagente fresco, autor distinto, enviado pelo orquestrador; sem delegação.
**Diff range:** snapshot `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/t15-native-before` → árvore de trabalho atual em 08/11/2026. HEAD `231e046be73f25c4ecc55aa0790cf796a9590312` é apenas referência, não a base da feature.

Não houve alteração de implementação/provas, commit, acesso a perfis/stores/transcrições pessoais ou execução de probes pessoais. Único arquivo-fonte escrito pelo verifier: este relatório; build regenerou os artefatos compilados necessários à prova CLI.

## Escopo e fontes

Lidos `.checks/t15-native-extension.md`, referência `tlc-implement/references/verify.md`, T15 em `TASKS.md:312–330`, `docs/FONTES-HISTORICO.md` completo e `.checks/t15-codex-rollout.md`. Comparados todos os cinco arquivos presentes no snapshot: três fontes de implementação, TASKS e documentação. As duas provas native são adições, ausentes desse snapshot. HEAD não foi usado como substituto da base.

O delta de implementação é o seletor v3, o help e a projeção DynamicToolCall dentro do leitor existente. Não acrescenta dependência/tabela ou alteração dos mecanismos compartilhados de recibo, normalização, preflight e transação. Outros trabalhos/probes da árvore não são parte deste veredito.

Fontes oficiais abertas via HTTP nesta rodada, sem executar código baixado:

- [Tag anotada](https://api.github.com/repos/openai/codex/git/tags/cb41599ccbe371272892f156286a236aa097bada): HTTP 200, `rust-v0.167.0` → commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`. Os trechos Codex abaixo foram consultados em raw nesse commit, não em branch móvel.
- [items.rs:294–321](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/items.rs#L294-L321), [dynamic.rs:100–275](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/handlers/dynamic.rs#L100-L275), [protocol.rs:2176–2191](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/protocol.rs#L2176-L2191) e [policy.rs:208–285](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/rollout/src/policy.rs#L208-L285): ID=call_id, completed quando success=true, item final paginado e tempos explícitos. Sem contradição com C1/C3; ressalva editorial abaixo.
- [registry.rs:139–176,1086–1138](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/registry.rs#L1086-L1138), [tools/mod.rs:47–64](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/mod.rs#L47-L64), [tool_name.rs:46–51](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/tool_name.rs#L46-L51) e `tools/context.rs` (FunctionToolOutput): nome achatado sem separador inserido, namespace default e exceção spawn_agent; runtime padrão da ferramenta dinâmica. Sustentam o mapeamento usado em C1/C2.
- [ToolInfo:34–60](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/codex-mcp/src/tools.rs#L34-L60), [handler MCP:139–165](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/tools/handlers/mcp.rs#L139-L165), `items.rs:459+`: campos canônicos do callable não são simplesmente server/tool originais. A exclusão MCP é fundamentada, não alegação de impossibilidade geral.
- [SessionMeta:3425–3496](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/protocol/src/protocol.rs#L3425-L3496): raiz, pai, prefixo físico e limite lógico distintos. `src/collectors/codex.ts:26` realmente usa a raiz como parentSessionId. A extensão não promete linhagens adicionais.
- [SDK 0.3.318](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/sdk.d.ts) e [0.3.319](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.319/sdk.d.ts), mais os dois package.json citados: HTTP 200. SessionMessage em 318:6896–6909 / 319:6927–6940 não oferece timestamp de execução e admite parent_agent_id null por metadado ausente; SessionStoreEntry em 318:7058–7076 / 319:7089–7107 declara união CLI-internal, payload opaco e timestamp opcional. SDKSessionInfo.lastModified é modificação. A decisão de não acrescentar parser Claude está sustentada nesse contrato, sem concluir inexistência de outras fontes.

Comparação/enumeração de interface visual: não aplicável ao perfil light e a este delta sem UI. Não há seção `Coverage` ou `Test policy` no checklist; seus joins/veredictos de standard/ui não foram executados.

## Provas executadas e evidência por check

Todos os nomes abaixo apareceram individualmente como executados/aprovados, com seus subtestes; nenhum skip. Tentativa inicial de localizar com `rg` encontrou ferramenta ausente (exit127); usada leitura numerada e busca dedicada como fallback, sem afetar as provas.

| Check | Prova executada | Asserção localizada e resultado |
|---|---|---|
| C1 | `Codex v3: dynamic canônico, horários e privacidade` — sete variantes de namespace/nome | **PASS.** `tests/collectors/codex-history-native.test.ts:38–41`: `assert.equal(result.imported, 2)`, `assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY'])`, `assert.deepEqual(rows.map((e) => e.type), ['tool.start', 'tool.end'])`; horários `[100, 200]` ms e payloads exatos com toolName/toolUseId/outcome. Tabela literal :33 cobre ausente/null/vazio/functions/custom com e sem ponto/multi_agent_v1 spawn_agent. :42–44 exigem cwd host tardio, origem, ausência de PRIVATE_ e zero file_revisions. Só tool.start/end exclui submissão/sinais humanos/sessão; não deriva horário da escrita/duração presentes na fixture. |
| C2 | `Codex v3: dynamic compartilha recibos live e replay` — raiz/filho × duas ordens | **PASS.** `tests/collectors/codex-history-native.test.ts:58–65`: `assert.equal(imported.imported, order === 'live-first' ? 0 : 2)`; `assert.equal(JSON.stringify(events(ctx)), before)` após live, reabertura/replay e conflito; `assert.equal(events(ctx)[0]!.occurredAt, new Date(at + (order === 'live-first' ? 5000 : 100)).toISOString())`; replay importa 0 e warning inclui HISTORY_EVENT_CONFLICT. :61 exige origem/parentesco do filho. Documento inteiro imutável e contagem 2 comprovam identidade compartilhada, não apenas contagem de inserções. |
| C3 | `Codex v3: limites de contrato não fabricam pares` — 15 casos | **PASS.** `tests/collectors/codex-history-native.test.ts:71–96`: tabela literal define warnings/contagens de failed/in_progress/success ausente ou false/MCP/namespace e nome inválidos/nome final excessivo/tempos ausentes ou zero/end-only/invertido/legacy/sem ordinal/v2; :95 `assert.equal(result.imported, count)` e `assert.ok(result.warnings.includes(warning))`; :96 `assert.ok(f.allEvents().every((e) => e.type === 'tool.end'))`. End-only exige 1, demais 0; portanto a borda disponível permanece isolada e v2 rejeita DynamicToolCall. |
| C4 | `Codex v3: preflight conserva autorização e linhagem`; C2 para prefixo ancestral; regressões v1/v2 | **PASS.** `tests/collectors/codex-history-native.test.ts:102–112`: raiz/filho × thread/outside/depth; `assert.equal(result.imported, 0)`, `assert.equal(f.allEvents().length, 0)`, warning específico e `assert.equal((await readdir(...).catch(() => [])).length, 0)` para recibos. C2 usa filho com contexto ancestral externo abaixo do ordinal (:24–28) e exige só 2 eventos próprios (:58–61). `tests/collectors/codex-history-items.test.ts:129–132` exige HISTORY_CHILD_INTERRUPT_UNAVAILABLE, 3 eventos e nenhum turn.end/session.interrupt; :77–86 confirma origem/tempos do filho e humanEstimatedMs=0. Suites v1/v2 passaram sem expandir seu contrato. |
| C5 | `Codex v3 CLI: dynamic opt-in, período e retomada` — processo recém-compilado | **PASS.** `tests/integration/codex-history-native-cli.test.ts:18–24`: configure status 0; primeiro/retomada/replay status 1 e contagens 1/1/0; primeiro exige exatamente HISTORY_LIFECYCLE_ONLY + HISTORY_MORE_AVAILABLE; retomada complete=false; eventos somente call-0, excluindo item iniciado exatamente em `to` e incluindo início em `from`. Help contém v3. :25–26 exige ausência de PRIVATE_ na saída e `assert.equal(await readFile(source.configPath, 'utf8'), config)` / input byte-idêntico. |

Os resultados acima foram obtidos na árvore atual, não herdados do relato do builder. Os dois testes native são novos e atingem o comportamento novo através de importHistory/SQLite temporário e da CLI compilada.

## Swept existing — conferência contra código

| Restrição existente | Evidência conferida | Resultado |
|---|---|---|
| Validation / failure modes / state transitions | `src/collectors/codex-history.ts:107–131`: paginação/ordinal, tipo/status/success, shortId final, tempo explícito/inversão, emissão somente da borda disponível. `src/core/contracts.ts:121–122`: regex ASCII 1–160. | Mantida; C1/C3. |
| Authorization | `src/collectors/history.ts:29–32,175–183`; `codex-history.ts:79–98` preflight de todos contextos próprios antes do primeiro yield; `src/collectors/queue.ts:21–35` exige fonte habilitada, raiz/política e cwd canônico antes de recibos. | Mantida; C4. Sem descoberta de transcrições. |
| Idempotency / ordering / concurrency | `src/collectors/codex-receipts.ts:21–24,34–57`: comparação ignora só occurredAt, primeiro recibo retorna inteiro; publicação por link exclusivo e tratamento EEXIST. `src/collectors/codex.ts:63–66` autoriza antes de retenção live. | Mantida; C2 e integração de processos concorrentes executada nesta rodada. |
| Data lifecycle | `src/collectors/history.ts:181–200`: período usa horário canônico; append recebe callback de proveniência/checkpoint. `src/core/events.ts:86–102`: imutabilidade e callback dentro da transação. `src/core/maintenance.ts:60,90,143` inclui codex-receipts no backup existente. | Mantida. Backup/restore não reexecutado; não alterado pelo delta. |
| External dependency failure | O delta usa leitura local existente; URLs consultadas são pesquisa, não dependência do importador. `codex-history.ts:22–51` conserva snapshot readonly/limites/UTF-8/ordinais e diagnóstico. | Mantida; regressões v1 executadas. Nenhuma dependência nova. |
| Observability | `codex-history.ts:99` sempre emite HISTORY_LIFECYCLE_ONLY após preflight; `history.ts:207–209` conserva partial/warnings fixos; `src/cli/index.ts:104` mantém exit1 mesmo com MORE_AVAILABLE. | Mantida; C3/C5. |

## Gates independentes

| Comando | Resultado |
|---|---|
| `npm run test:unit -- tests/collectors/codex-history-native.test.ts tests/collectors/codex-history-items.test.ts tests/collectors/codex-history.test.ts` | exit0; **104 pass, 0 fail, 0 skip**; todos C1–C4 e regressões listados individualmente. |
| `npm run typecheck` | exit0. |
| `npm run build` | exit0; tsc server e Vite. Necessário para não testar CLI compilada obsoleta. |
| `npm run test:integration -- tests/integration/codex-history-native-cli.test.ts tests/integration/codex-history-items-cli.test.ts tests/integration/codex-history-cli.test.ts` | exit0; **4 pass, 0 fail, 0 skip**: v3 CLI, v2 CLI, v1 CLI e recibos concorrentes offline. Rodado após build. |

Não repetidos full unit/integration/E2E (158/32/30 relatados pelo builder): o perfil light não exige sua repetição sem justificativa, e o delta é restrito ao parser opt-in/CLI. Esses totais globais não são apresentados como resultados independentes deste verifier.

## Gaps e limitações

- **Nenhum gap bloqueante C1–C5 encontrado.** Não foram injetados faults: dispensados no perfil light, sem mutação da árvore.
- **Nota editorial não bloqueante:** `.checks/t15-native-extension.md:11` chama started_at_ms/completed_at_ms de opcionais. No contrato `protocol.rs:2180–2191`, apenas started_at_ms é Option; completed_at_ms é i64 com default zero quando ausente. Os checks e a implementação exigem horário positivo e já tratam ausência/zero sem fabricar borda; não há contradição comportamental. O texto do checklist não foi alterado pelo verifier.
- Provas sintéticas e delimitadas; não comprovam histórico nativo pessoal, instalação/confiança de hooks, pilotos reais ou aceite integral T15/T12/T24/M3.
- MCP, ferramentas/estados excluídos, linhagens além de filhos diretos, páginas/forks/revert e Claude permanecem fora do recorte; não inferidos como suportados por estes resultados.
- O snapshot é a base fornecida para os arquivos alterados, não um snapshot integral do repositório. A árvore contém trabalho anterior não commitado; por isso este PASS não é revisão global da árvore nem de probes pessoais.

## Identidade da árvore verificada

SHA-256, para não associar o PASS apenas ao HEAD quase vazio:

```text
2f27d04e31875fc0569619145f7a512d24ea9f329248e6862d5dc4f41f8164c0  src/collectors/codex-history.ts
0cbfbf5bb557d439e71596b7ea59ea22baacc3d08de5f0f3f260c68d8404d19c  src/collectors/history.ts
8108d504e649125c040e986b9b6eba27868f738494238bf3f7623680973c3fba  src/cli/index.ts
07faac37671f3e5850d1f9da9656c95819b45640d1e6e8280b2dbd74a565dab6  tests/collectors/codex-history-native.test.ts
b4d5bb104982a501b26e734fc70aed56ae077d196dee1a9054207dacf26cb798  tests/integration/codex-history-native-cli.test.ts
ec63b698a3f2b655e87b47af87948b5efc8d93d1856946b2c4a8b2218108f192  .checks/t15-native-extension.md
```
