# Ampliação histórica — verificação independente

**Verdict vigente: PASS — C1–C10, 10/10 comprovados no recorte; F1/C8 fechado na rodada2.**
**Profile:** light. **Round vigente:** 2 — scoped.
**Verifier:** subagente independente, autor != verificador; sem delegação.
**Diff range:** `76a6edcd44c5ce7cf02d2ac672d28ee9b7049281` → diff NÃO COMMITADO + arquivos novos desta feature. HEAD permanece a base.

> **Rodada1 — full: Verdict FAIL — 9/10 checks comprovados; C8 falha.** Registro histórico abaixo preservado; a reavaliação scoped e o gate novo estão ao final. Os achados/limitações temporais da rodada1 descrevem aquela árvore, não o resultado vigente.

## Achado bloqueante

### F1 · P2 · C8 — `history_base` externo de filho direto passa pelo preflight

`src/collectors/codex-history.ts:65–74`: a ramificação de raiz recusa `history_base`, mas a de filho direto não o verifica. Assim, um filho depth=1 com `history_base` físico externo pode importar MCP e publicar recibos, apesar da obrigação de C8 de recusar revert/linhagens não comprovadas antes de qualquer evento/recibo.

A fonte oficial `protocol/src/protocol.rs:3433–3436,3482–3490` distingue corte lógico, base física e início próprio. `thread-store/src/local/revert_thread.rs:172–192` preserva sessão/pai/subagent_history_start_ordinal e instala nova history_base: não é correto supor que todo revert será denunciado por forked_from_id/depth. A exceção não depende de ler o arquivo externo.

A prova nova `tests/collectors/codex-history-mcp.test.ts:111–118` só cria filho para inherited-name/nested; seu caso `revert` roda como **raiz**. Portanto `:128–130` (`assert.equal(result.imported, 0)`, zero eventos/recibos) passa sem exercer a ramificação vulnerável.

**Reprodução independente, sem mutação de código:** executado `node --import tsx --input-type=module` com fixture temporária, registerSource, configureHistory(v4), importHistory e limpeza do próprio temp. Dois inputs idênticos salvo raiz/filho: meta ordinal20, FunctionCall ordinal21, ItemCompleted ordinal22; metadata com `history_base: {thread_id: <UUID externo>, end_ordinal_exclusive: 20, end_byte_offset: 10000}`. Filho: session_id=root, id=child, parent_thread_id=root, thread_spawn.parent_thread_id=root/depth=1, subagent_history_start_ordinal=1. FunctionCall namespace=mcp__catalog/name=lookup/call_id=call-mcp; item McpToolCall completed do próprio thread, mesmo ID, started_at_ms=09:00:00.100Z/completed_at_ms=09:00:00.200Z em 05/11/2026. Período: o dia UTC. Ambos paginated, versão0.167.0, cwd temporário autorizado.

Saída observada:

```json
{"child":false,"result":{"imported":0,"skipped":0,"warnings":["HISTORY_LINEAGE_UNSUPPORTED"],"complete":false},"events":0,"receipts":0}
{"child":true,"result":{"imported":2,"skipped":0,"warnings":["HISTORY_LIFECYCLE_ONLY"],"complete":false},"events":2,"receipts":2}
```

Uma primeira reprodução com ordinais0/1/2 também importou2/gravou2 recibos. O controle acima usa posição física posterior à base e confirma a assimetria. Não houve fault injection: são inputs sintéticos fornecidos à implementação intacta. Nenhum arquivo referenciado foi aberto.

**Lacuna a resolver pelo autor/orquestrador:** alinhar a admissão de filho com base externa/revert ao limite de C8 e acrescentar prova da ramificação de filho. Não corrigido pelo verifier. Isto não prova corrupção de toda chamada aceita; prova admissão/persistência de uma linhagem que o check manda bloquear.

## Escopo e fontes vinculantes

Lidos integralmente `tlc-implement/references/verify.md` e `.checks/history-expansion.md`. Comparado todo o delta autorizado: quatro arquivos src, teste OpenCode alterado, dois testes MCP novos, três documentos e prefixo de PROXIMA-SESSAO, além do checklist novo. `TASKS.md`, `tasks.csv` e `.checks/piloto-t14-t24-2026-11-09.md` concorrentes não foram revisados como alterações desta feature.

T15 binding foi conferida em `TASKS.md@76a6edc:314–334`, `.checks/t15-fechamento.md`, `.checks/t15-fechamento.verified.md` e `.checks/t15-native-extension.md/.verified.md`. Seu aceite disponível/comprovado permanece; os smokes pessoais anteriores **não foram reexecutados** e seus números não são resultados novos deste verifier.

Fontes oficiais abertas como texto, sem executar código baixado: cópias HTTP autorizadas em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/history-expansion-contracts`, mais HTTP direto dos dois arquivos indicados abaixo. URLs reproduzíveis estão em `docs/HISTORICO-CONTRATOS.md:26–43,56–64`.

| Fonte aberta | Evidência e conclusão |
|---|---|
| OpenCode commit `dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06`, session-log.test.ts:71–120, session.ts:184–195,429–479, bus.ts:214,765–870 | Gaps públicos legítimos; marker pode superar último evento; persist default false; sessão migrada pode retornar somente marker. Correção autorizada do watermark procede; não há alteração visual. |
| OpenCode `packages/schema/src/session-message.ts`, HTTP direto no mesmo commit (200) | Há horários projetados, inclusive tool.time.ran/completed, e ID de mensagem derivável de um evento. Não há identidade de **cada** evento de borda durável para reproduzir projectV2Event/live; estado projetado não recompõe todas as transições. A limitação é identidade/lifecycle completo, não ausência absoluta de relógios em messages. Log vazio não foi substituído por duração inferida. |
| Codex commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`, models.rs:1134–1155, router.rs:276–302 | FunctionCall preserva namespace/name/call_id; router constrói ToolName e mantém call_id. |
| Mesmo commit, registry.rs:492–548,690–692; codex-mcp/tools.rs:34–60,105–213 | Registro usa runtime.tool_name como chave; lookup exato com normalização default. ToolInfo separa nome canônico de server/tool; sanitização/hash dependem do catálogo inteiro. |
| Mesmo commit, handlers/mcp.rs:139–165,493–542 (também HTTP direto, 200), mcp_tool_call.rs:1061–1137, items.rs:459–499, policy.rs:231–285 | Hook usa canonical_tool_name, trim de underscores, separador __ e prefixo mcp__; Post usa invocation.call_id; McpToolCall.id é o mesmo call_id, status completed somente sucesso. Item isolado não carrega o nome canônico. |
| Mesmo commit, protocol.rs:2176–2191,3425–3490, hooks/schema.rs:550–563,607–623, paginated_fork.rs:15–150, revert_thread.rs:86–192 | Tempos de execução explícitos; raiz/pai/corte/base física distintos; hooks citados não expõem pai imediato. Limites de nested/revert reais, com falha de enforcement F1. |
| SDK oficial Claude0.3.318/0.3.319: tipos SessionMessage e SessionStoreEntry; 319:3797–3799,6927–6940,7089–7107 e package.json319 | SessionMessage sem clock de execução; união JSONL CLI-internal opaca/timestamp opcional; assistant timestamp é fim de bloco/display. Não estabelecem sozinhos bordas e correlação com hooks. Claude nativo segue não implementado. |

**Conclusão sobre a ponte MCP:** no recorte de história própria, par FunctionCall namespaced + itemCompleted McpToolCall com mesmo call_id sustenta o nome canônico sem inventar server/tool. Registry registra precisamente o nome canônico do handler e resolve a mesma chave; a transformação do hook é a implementada em v4. FunctionCall sozinho não prova execução; item sozinho não identifica callable. Não encontrei contradição nessa ponte. Isso não é prova de amostra nativa nem resolve lineage/code-mode.

Tentativa adicional de conferir cópias via Python urllib falhou por certificado CA local (`CERTIFICATE_VERIFY_FAILED`), sem desabilitar TLS. Não é tratada como fonte aberta por HTTP nessa tentativa: os trechos restantes foram efetivamente lidos nas cópias oficiais autorizadas; os dois fetches diretos acima tiveram sucesso.

## Checks — nomes executados e assertions decisivas

Todos os testes nomeados C1–C8 apareceram individualmente como aprovados no gate, inclusive subtestes. Não houve filtro vazio. Linha/expressão abaixo é a evidência por check; suite verde não substitui F1.

| Check | Prova/evidência localizada | Resultado |
|---|---|---|
| C1 | `log v2: lacunas públicas não inventam eventos`; `tests/collectors/opencode-history.test.ts:137–151`: três variantes internal/tail/both; `assert.equal(result.imported, 7)`, `assert.equal(result.complete, false)`, `assert.deepEqual(result.warnings, ['HISTORY_PUBLIC_LOG_GAPS'])`; `assert.equal(f.allEvents().length, 8)` e ocorrência única do live; replay imported0/documento inteiro igual. | PASS |
| C2 | `log v2: gaps não ocultam corrupção` e cancelamento/watermark; `opencode-history.test.ts:158–176`: dez casos, `assert.equal(result.complete, false)`, `assert.deepEqual(result.warnings, [issue === 'initial-missing' || issue === 'truncated' ? 'HISTORY_TRUNCATED' : issue === 'unknown-frame' ? 'HISTORY_FORMAT_UNSUPPORTED' : 'HISTORY_SEQUENCE_INVALID'])`; `:123–125` também cobre delimitador SSE/truncamento. | PASS |
| C3 | identidade/autorização/formatos e cancelamento/watermark; `opencode-history.test.ts:129–132`: `assert.equal(empty.complete, false)`, `assert.deepEqual(empty.warnings, ['HISTORY_UNAVAILABLE'])`, unknown→HISTORY_FORMAT_UNSUPPORTED; `:92,104–109` recusa formato/versão/root/fonte pausada. | PASS |
| C4 | `Codex v4: MCP canônico correlacionado e privado`; `tests/collectors/codex-history-mcp.test.ts:35–51`: tabela literal prefixed/unprefixed/hash/trim; `assert.deepEqual(values.map((e) => [e.type, e.occurredAt, e.payload]), [...])` exige start100/end200, toolName esperado e toolUseId=call-mcp; `assert.ok(values.every((e) => e.cwd === f.root && e.nativeSessionId === f.rootId && e.sourceId === f.source.id))`; PRIVATE_ ausente; partial/warning exatos em:45. | PASS |
| C5 | `Codex v4: MCP recibos live e histórico`; `codex-history-mcp.test.ts:60–75`: raiz/filho × duas ordens; `assert.equal(JSON.stringify(events(ctx)), before)` após live, reopen/replay e conflito; primeiro occurredAt depende da primeira captura; `assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0)`; conflito mantém before e inclui HISTORY_EVENT_CONFLICT. | PASS |
| C6 | `Codex v4: MCP incompleto não ganha identidade ou duração`; `codex-history-mcp.test.ts:81–105`: tabela local de11 casos com warning/count explícitos; `assert.equal(result.imported, count)`, `assert.ok(result.warnings.includes(warning))`, `assert.ok(f.allEvents().every((e) => e.type === 'tool.end'))`; sem count exige zero recibos. End-only=1, demais=0; v3 exclui MCP. | PASS |
| C7 | `Codex v4 CLI: MCP opt-in e retomada privada`; `tests/integration/codex-history-mcp-cli.test.ts:22–30`: configure exit0; importações exit1 e counts1/1/0; `assert.deepEqual(f.allEvents().map((e) => [e.type, e.payload]), [['tool.start', ...call-0], ['tool.end', ...call-0]])`; segundo item começa exatamente em to e fica excluído; help contém v4; config/input byte-idênticos e PRIVATE_ ausente. | PASS |
| C8 | `Codex v4: linhagem e prefixos não viram execução própria`; `codex-history-mcp.test.ts:124–130`: resume imported2/replay0, `assert.equal(time.agentAccumulatedMs, 100)`, wall100/humano0; recusas exigem imported0/eventos0/recibos0. Prefixo/thread/contexto e nested passam, mas **revert é só raiz** (:112,118). Reprodução F1 prova filho externo admitido e persistido. | **FAIL** |
| C9 | Revisão documental: `docs/HISTORICO-CONTRATOS.md:9–22` separa quatro classes; `:32–34` explica marker/gaps/identidade projetada; `:45–60` limita MCP e linhagens; `:64–68` limita Claude. `docs/FONTES-HISTORICO.md:3–9,163–174`, `docs/CODEX.md:3–9` e prefixo `.checks/PROXIMA-SESSAO.md:3–7` preservam T15 e não alegam nova prova nativa. Limites oficiais sustentados acima; enforcement de C8 não deve ser tomado como integral (F1). | PASS documental, não comprova bloqueio de C8 |
| C10 | Gate completo abaixo, cinco comandos exit0. Todos nomes exigidos vistos no output; suites antigas v1/v2/v3, normalizadas, recibos concorrentes, OpenCode e UI executadas. Zero fail/cancelled/skip/todo. | PASS |

**Conta:** S1=3/3; S2=4/5; S3=2/2; total9/10. C8 teve7 subcasos verdes, mas falta o caso de filho/base física e o comportamento observado viola o check.

## Gate independente

Comando único, na árvore acima, shell `sh_1be1999cd001N2kGZX9HlVRRjK`:

```sh
npm run typecheck && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e
```

- Typecheck: exit0.
- Build: exit0, tsc server + Vite (45 módulos).
- Unitários: **200 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**.
- Integração: **33 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**.
- E2E: **30 passed**, desktop/mobile, nenhum skip/fail reportado.
- `git diff --check`: exit0.

Não reexecutei a base158/32/30; ela é apenas o baseline informado, não evidência independente desta rodada. Os resultados200/33/30 acima foram obtidos aqui.

## Swept existing, perfil e limites

- Autorização conservada: `history.ts:175–193`, `queue.ts:21–35` e preflight `codex-history.ts:79–98` antes de recibos; thread/contexto tardios são testados. Exceção de **linhagem** F1 não é negada por esses controles de cwd/fonte.
- Idempotência/concorrência: `codex-receipts.ts:21–24,34–57` compara corpo, retorna documento/primeiro horário e publica por hardlink exclusivo; prova de processos concorrentes também passou. Não há mudança desses mecanismos.
- Ciclo de dados: `events.ts:86–102` mantém append/transação; `history.ts:196–201` grava proveniência/checkpoint na callback transacional. Nenhuma migração/dependência nova no delta.
- Estados/observabilidade: `codex-history.ts:125–157` exige paginação/status/tempos, admite só borda explicitamente temporizada; warnings fixos e privacidade exercitados. OpenCode gaps não autenticam ausência de remoção manual; complete=false preservado.
- Perfil light: sem comparação visual UI, recomputação Coverage ou fault injection. Checklist não tem seção Coverage/Test policy; seus joins/veredictos standard/ui não foram executados. A análise oficial acima foi feita por exigência específica de C9/despacho, mesmo em light.
- Nenhuma leitura de transcrição/store/perfil pessoal, nova chamada de modelo, hook/trust/serviço pessoal, acesso ao projeto Posicionadas, commit/push/deploy. Gate utiliza fixtures temporárias/servidores de teste; não instala nem opera o serviço pessoal. E2E é regressão existente, não auditoria visual nova.
- Nenhuma recuperação nativa pessoal nova foi provada. Nested/forks/revert/páginas externas e Claude nativo **continuam não implementados**; FAIL não reabre por si o aceite T15 anterior. MCP sem par canônico e code-mode sem identidade continuam excluídos.

## Integridade da árvore

`git status --porcelain=v1`, HEAD e diff conferidos antes do gate e novamente depois do gate/probes: os mesmos arquivos já sujos/novos do início, sem alteração adicional produzida pelo gate. Única escrita de fonte do verifier: este relatório. Build/testes geraram apenas saídas ignoradas e stores temporários. Nenhum commit efetuado.

Hashes SHA-256 da implementação/provas verificadas:

```text
e2d19181e09eb591f88e23fbac0dcabcffaa77698aa72e9d64df770f2ccbc4fd  src/collectors/opencode-history.ts
4763b60d28a0edeab545b2015aeb7a0042f95bda62afcefbfc4e5dc0edad56e9  src/collectors/codex-history.ts
8a27b809dd6197d746664daa1857a64b09b99184c6d10314f985c165c6dbbc81  src/collectors/history.ts
a828ff7e35160e829db48ded8856a8651ddd727f29f556869744c20a504dcb4b  src/cli/index.ts
902e1f89bf7bdc155effe453eb9da3629e01d12344da6688dd6217c070907022  tests/collectors/opencode-history.test.ts
119cd4f7cd08fbba5dd4c253666a62ee7e31d669bb566f4c0387fa78a56bc307  tests/collectors/codex-history-mcp.test.ts
30b44aae3be711df2ab2d9b21aecf59ee2fe574c0ee7401cd17469b67e610ce9  tests/integration/codex-history-mcp-cli.test.ts
```

## Rodada2 — scoped: correção F1/C8

**Profile:** light. **Round:** 2 — scoped. Autor != verifier, mesmo contexto independente da rodada1. Sem delegação, correção de código, commit ou acesso pessoal.
**Identidade:** HEAD continua `76a6edcd44c5ce7cf02d2ac672d28ee9b7049281`; árvore não commitada identificada pelos hashes abaixo. O FAIL histórico acima não foi apagado nem convertido retroativamente em PASS.

### Delta efetivamente conferido

Conferidos status/diff antes da execução. Comparação SHA-256 e reconstrução **somente em memória** da versão anterior provaram:

- `src/collectors/codex-history.ts` difere da rodada1 somente pela linha63: `if (mcp && meta.history_base != null) throw new DomainError('HISTORY_LINEAGE_UNSUPPORTED');`. Ela precede a divisão raiz/filho, todo yield e publicação de recibos. Ausente/null não aciona o guard; qualquer valor não nulo aciona. `mcp` só é true no seletor v4 (`history.ts:166`, inalterado); admissões v1/v2/v3 não recebem essa condição nova.
- O teste MCP só acrescenta `child-revert`, inclui esse caso no setup de filho e troca o caso de base por HistoryPosition oficial, ordinais+20 e faixa própria22 para filho. A reversão dessas diferenças em memória produz exatamente o hash119cd4… da rodada1.
- Os dois documentos só explicitam a nova restrição v4; reversão textual em memória reproduziu seus hashes anteriores. `docs/HISTORICO-CONTRATOS.md:52,60` e `docs/CODEX.md:5` agora distinguem reutilização dos recortes v3 da exigência adicional de base ausente/null na raiz **e** no filho.
- Checklist só recebeu a linha Landing/Base física v4 (:28) e o relato de correção (:93–97). Removendo-os em memória, o hash anterior é idêntico; checks C1–C10 não foram removidos, reduzidos ou reescritos. O relato de vermelho do autor não é apresentado como execução independente deste verifier.
- Os demais sete arquivos da feature têm hashes idênticos à rodada1. Nenhuma alteração concorrente em TASKS/tasks.csv/checklist piloto foi incorporada ao escopo.

### F1/C8 — nova evidência independente

`tests/collectors/codex-history-mcp.test.ts:111–121` agora inclui raiz/revert e filho/child-revert. Este último usa metadataordinal20, prefixo21, FunctionCall22 e ItemCompleted23, com subagent_history_start_ordinal22; history_base tem thread_id/end_ordinal_exclusive/end_byte_offset. Portanto há chamada própria que seria importável sem o guard, não apenas um prefixo sem execução.

Assertions decisivas atuais, aplicadas também a child-revert:

- `:132`: `assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);`
- `:133`: `assert.ok(result.warnings.includes(issue === 'inherited-name' ? 'HISTORY_MCP_IDENTITY_UNAVAILABLE' : issue === 'thread' ? 'HISTORY_SOURCE_MISMATCH' : issue === 'outside' ? 'HISTORY_ROOT_UNAUTHORIZED' : 'HISTORY_LINEAGE_UNSUPPORTED'));` — child-revert exige HISTORY_LINEAGE_UNSUPPORTED.
- `:134`: `assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);`
- Resume permanece `:128–130`: imported2/replay0, agentAccumulatedMs100/agentWallMs100/humanEstimatedMs0. Prefixo herdado e demais recusas não foram retirados.

**Probe independente anterior reexecutado na implementação intacta:** mesmo input de F1 da rodada1 (meta20/FunctionCall21/ItemCompleted22, base externa20, filho com início próprio1), com assertions adicionadas apenas no comando inline: imported0, complete=false, warning exato HISTORY_LINEAGE_UNSUPPORTED, eventos0 e recibos0. Ambos os controles passaram:

```json
{"child":false,"result":{"imported":0,"skipped":0,"warnings":["HISTORY_LINEAGE_UNSUPPORTED"],"complete":false},"events":0,"receipts":0}
{"child":true,"result":{"imported":0,"skipped":0,"warnings":["HISTORY_LINEAGE_UNSUPPORTED"],"complete":false},"events":0,"receipts":0}
```

Executado via `node --import tsx --input-type=module`, fixture/store temporários e limpeza própria; nenhum código-fonte ou arquivo externo referenciado foi alterado/aberto. F1 está comportamentalmente fechado; isso comprova **recusa**, não implementação de revert.

### Análises carregadas explicitamente da rodada1

**Carried from rodada1 / base76a6edc + hashes da árvore anterior:** pesquisa oficial OpenCode/Codex/Claude, ponte canônica FunctionCall→registry→hook→itemCompleted, restrições de identidade/relógios para log.synced vazio, aceite T15, privacidade, recibos, transação e limites light permanecem as análises da rodada1 acima. Não foi feita uma nova consulta de fonte pessoal nem nova pesquisa HTTP nesta rodada. Os commits oficiais continuam dc2ffcf…/086ccc… e os SDK0.3.318/319; o fix não altera essa cadeia nem implementa lineage.

As assertions C1–C7 mantêm as linhas/corpos citados na rodada1: os corpos MCP anteriores à linha110 não mudaram; OpenCode e CLI de integração são byte-idênticos. O raciocínio é carregado, mas **a execução das provas não é herdada**. C8 foi reavaliado acima; C9 teve revisão adicional do delta documental e Landing, sem contradição com a recusa segura de uma base que o parser não resolve.

Hashes que tornam a herança explícita (SHA-256 completos; “igual” = conferido novamente nesta rodada):

| Arquivo | Rodada1 | Rodada2 |
|---|---|---|
| src/collectors/opencode-history.ts | e2d19181e09eb591f88e23fbac0dcabcffaa77698aa72e9d64df770f2ccbc4fd | igual |
| src/collectors/codex-history.ts | 4763b60d28a0edeab545b2015aeb7a0042f95bda62afcefbfc4e5dc0edad56e9 | cc563966c7a6896c860e1ee4ffffbc78affa9d4c476f7a7c40267f6265afc601 |
| src/collectors/history.ts | 8a27b809dd6197d746664daa1857a64b09b99184c6d10314f985c165c6dbbc81 | igual |
| src/cli/index.ts | a828ff7e35160e829db48ded8856a8651ddd727f29f556869744c20a504dcb4b | igual |
| tests/collectors/opencode-history.test.ts | 902e1f89bf7bdc155effe453eb9da3629e01d12344da6688dd6217c070907022 | igual |
| tests/collectors/codex-history-mcp.test.ts | 119cd4f7cd08fbba5dd4c253666a62ee7e31d669bb566f4c0387fa78a56bc307 | eb68d27df641efb1a095b8c6ed4ec4f2880a1d9025696f16d83e302ba3bf6585 |
| tests/integration/codex-history-mcp-cli.test.ts | 30b44aae3be711df2ab2d9b21aecf59ee2fe574c0ee7401cd17469b67e610ce9 | igual |
| docs/HISTORICO-CONTRATOS.md | 99e3fb7c6f6d08eb3b9617974f5516b9a48217d77018c1a6ab0e6ca4b6196da3 | c269f53e86143b0a401d0e6d79ae03de9a38012fd2a800e628e104cd64e00f3e |
| docs/FONTES-HISTORICO.md | 12e5fbe7b57b7c4c11eea4521ffb8d93594bb7abcdc41d5da478166403165ef9 | igual |
| docs/CODEX.md | e09b5c0a681911e326df918646f0aa4b84ea9cda79f101cdc3216184cbff49cc | d4f5b4eabcad040c6eca5517acd86b60897d4915a327f9e9057055233d4c7492 |
| .checks/PROXIMA-SESSAO.md | d39b72ca4d6a54ea7cbae32b9c769f449f2416d000b67b50bfa938165b0d6b12 | igual |
| .checks/history-expansion.md | 42739c6a79e60bf8502b689f5b977b88224e46f83a055ef9991fbb5dc290b808 | 4c7ee80f5814def4e692598eb3b05abc0d742b03abfb7f893f7f62f0b439a6af |

### Gate e veredictos vigentes — provas executadas novamente

**Verified at rodada2 / hashes da tabela acima**, shell `sh_1be1f25d3001HeSL93yI9l5RFv`:

```sh
npm run typecheck && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e
```

Todos os cinco comandos concluíram com exit0. Typecheck/build aprovados; **201 unitários /33 integrações /30 E2E aprovados**. Unit/integration: zero fail, cancelled, skipped e todo; E2E: todos30 desktop/mobile executados e aprovados, sem skips. Os nomes de C1–C8 apareceram individualmente no output, inclusive **child-revert**. Não se substituiu essa execução pelo relato47/1 do autor.

| Check | Resultado vigente | Evidência da reexecução/revisão |
|---|---|---|
| C1 | PASS | Teste lacunas públicas aprovado novamente; assertions OpenCode:147–151, inalteradas: imported7+live1, warning exato, replay0/documento inteiro. |
| C2 | PASS | Teste gaps/corrupção e cancelamento/watermark aprovados novamente; OpenCode:123–125,158–176, inalterados. |
| C3 | PASS | Testes identidade/autorização e log.synced vazio aprovados novamente; OpenCode:92,104–109,129–132, inalterados. |
| C4 | PASS | MCP canônico aprovado nas quatro variantes; MCP:35–51, inalterado; payload/clock/call_id/contexto e privacidade exatos. Guard novo não interfere na história admitida sem base. |
| C5 | PASS | MCP recibos nas quatro combinações raiz/filho×ordem aprovado novamente; MCP:60–75, inalterado; comparação de documento inteiro, horário original, reopen/replay0 e conflito. |
| C6 | PASS | Onze subcasos de MCP incompleto aprovados novamente; MCP:81–105, inalterado; warning/count por caso, sem pares fabricados, v3 preservado. |
| C7 | PASS | CLI v4 compilada aprovada novamente; integração:22–30, byte-idêntica; counts1/1/0, exit1, período, help e origem/input intactos. |
| C8 | PASS | Oito subcasos aprovados, incluindo child-revert; MCP:119–121,132–134 exige imported0/eventos0/recibos0 e HISTORY_LINEAGE_UNSUPPORTED. Probe independente da rodada1 também passou com zero/zero para raiz e filho. |
| C9 | PASS | Revisão do delta documental/checklist acima; HISTORICO-CONTRATOS:52,60/CODEX:5 enunciam exatamente o novo bloqueio. Demais fontes/análise oficial carried from rodada1, hashes explicitados. Nenhuma capacidade excluída passou a ser declarada implementada. |
| C10 | PASS | Gate completo independente201/33/30, typecheck/build exit0; todas regressões e nomes exigidos executados sem skips. |

**Conta vigente:** S1=3/3, S2=5/5, S3=2/2, total **10/10**. Nenhum achado bloqueante restante neste recorte. F1 foi fechado por bloqueio preventivo, não por resolver os segmentos/revert.

### Limites e integridade da rodada2

- Mantidos os limites da rodada1: provas sintéticas contratuais, sem nova recuperação nativa pessoal; nested/forks/revert/bases externas/páginas e Claude nativo **não implementados**. A recusa v4 não certifica resolver qualquer forma de resume. MCP sem par/código sem identidade permanece excluído; log.synced vazio não vira histórico positivo. Aceite T15 anterior não é ampliado por este PASS.
- Sem fault injection (perfil light). Probe usa inputs sintéticos, não mutação da implementação. Coverage/Test policy ausentes; sem joins standard/ui ou nova auditoria visual. O teste vermelho informado pelo autor não foi reproduzido retirando o guard, pois isso exigiria mutação desnecessária neste perfil.
- Única escrita de fonte nesta rodada: append e atualização do cabeçalho deste relatório; evidências FAIL originais preservadas. Sem alterações em implementação/provas/docs/checklist, sem commit/push/deploy/delegação, sem acesso a dados pessoais ou Posicionadas, sem nova chamada de modelo/hook/trust/serviço pessoal.
- Status/HEAD e hashes conferidos antes/depois: mesma lista de arquivos sujos/novos; gate/probe não adicionaram arquivos-fonte. Trabalho concorrente permaneceu intocado. `git diff --check` exit0; hashes atuais da feature coincidem com a coluna rodada2, sem drift durante a execução.
