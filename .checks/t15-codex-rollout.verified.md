# T15 — Codex rollout: verificação independente — estado atual

**Verdict atual: PASS — C1–C9, 9/9. Sem gaps restantes no recorte verificado.**

**Round:** 2 — scoped. **Profile:** LIGHT, sem AGENTS.md. **Verifier:** independente, autor != verificador. F1/F2/F3 da R1 foram corrigidos e reavaliados; os outros PASS são carregados explicitamente da R1, com todas as provas executadas novamente no snapshot atual. Isso não declara toda a T15 concluída: permanece lifecycle-only.

## R2 — escopo, identidade e histórico

- Lidos integralmente o checklist atual e `worklog-t15-codex-session.diff`; comparação exata com `worklog-t15-codex-r1.diff`, sem usar `git diff HEAD` para atribuir trabalho.
- Diretório dos artefatos: `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode`.
- Diff R1 SHA-256: `a343c4ccace1b3db08a9be6593e9ff5569f93d061c40cdf8766a10844abb055b`.
- Diff R2 SHA-256: `15e47ca4a618ba198f295d5040110442c82ca2000c9eef94085ce7a54fde1039`.
- Os 7 hashes atuais coincidiram com `worklog-t15-codex-hashes.json`; reconstrução da base real `worklog-t15-codex-before` até os arquivos atuais coincide exatamente com o diff R2 fornecido.
- R1→R2 altera somente `src/collectors/codex-history.ts`, `src/cli/index.ts` e os dois arquivos de testes da feature. Os outros três arquivos do diff completo são idênticos à R1.
- C1–C9 não foram afrouxados. Landing acrescentou a obrigação explícita de exit 1 com `HISTORY_LIFECYCLE_ONLY` + `HISTORY_MORE_AVAILABLE` (`.checks/t15-codex-rollout.md:25`). O diff dos testes só acrescenta casos/assertions e preserva os valores anteriores, inclusive importação inicial sem limite de 2 eventos numa fonte nova independente, sem apagar eventos.
- O relatório integral da R1 permanece abaixo, sem alterar seu texto. SHA-256 do bloco original: `d37514244930d59c0f31ccd1eb00776cd5e9c6d780c517e33bc9fa5109cfe670`. As referências antigas naquele bloco pertencem ao snapshot R1, não ao código R2.

## R2 — gates executados novamente pelo verificador

| Comando | Resultado independente no snapshot R2 |
|---|---|
| `npm run build` | exit 0; server TypeScript + Vite |
| `npm run typecheck` | exit 0 |
| `npm run test:unit -- tests/collectors/codex-history.test.ts tests/collectors/codex.test.ts tests/collectors/history.test.ts` | exit 0; **47 passed, 0 failed, 0 skipped** |
| `npm run test:integration -- tests/integration/codex-history-cli.test.ts tests/integration/codex-hook.test.ts tests/integration/recovery.test.ts` | exit 0; **7 passed, 0 failed, 0 skipped** |

Uma invocação por target; cada teste abaixo apareceu individualmente aprovado:

| Check | Teste nomeado aprovado novamente |
|---|---|
| C1 | `Codex rollout: lifecycle explícito, contexto, período e privacidade` — `legacy`, `paginated` |
| C2 | `Codex rollout: sobreposição live nas duas ordens e recibo legado` — `live-first`, `history-first`, `legacy-receipt` |
| C3 | `Codex rollout: conflitos conservam eventos imutáveis e falha explícita` |
| C4 | `Codex rollout: horários ausentes, falhas e interrupções não são fabricados` |
| C5 | `Codex rollout: contrato e autorização negam entradas não suportadas` — todos os 18 subtestes, incluindo os 5 novos |
| C6 | `Codex rollout: cancelamento, limite e truncamento retomáveis` |
| C7 | `Codex rollout: limites, sequência e schemas desconhecidos` — `symlink`, `directory`, `size`, `line`, `utf8`, `count`, `ordinal`, `schema` |
| C8 | `Codex: processos concorrentes compartilham recibo offline` |
| C9 | `Codex rollout CLI: configuração, importação, replay e diagnóstico privado` |

Os 18 subtestes de C5 aprovados foram `version`, `source-version`, `invalid-id`, `outside`, `paused`, `symlink`, `thread`, `fork`, `prefix`, `inherited`, **`review-subagent`, `spawn-subagent`, `thread-source-subagent`, `thread-source-review`, `late-thread-mismatch`**, `mode`, `context`, `settings-cwd`.

Todos os 14 testes de regressão nomeados na seção R1 “Regressões: testes individualmente aprovados” também apareceram individualmente aprovados **nesta execução R2**; não são resultado herdado. Contagem unitária: 16 testes de topo + 31 subtestes = 47. Integração: 2 provas da feature + 5 regressões = 7. Os números globais informados pelo autor (92/30/30) não são usados como prova independente.

## R2 — C1–C9 e assertions atuais

Leitura de assertions atualizada por `functions.grep`. Nesta seção, `U` = `tests/collectors/codex-history.test.ts` e `I` = `tests/integration/codex-history-cli.test.ts`; todos os números são do snapshot R2. A análise não afetada é **carregada da R1 integral abaixo**, identificada pelo hash do diff R1 acima; a execução é sempre nova.

| Check | Resultado / origem | Assertion literal atual |
|---|---|---|
| C1 | **PASS** — análise carregada R1; prova R2 | `U:46`: `assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);` · `U:47–48`: `assert.deepEqual(events.map((e) => e.type), ['turn.start', 'turn.end']);` e `assert.deepEqual(events.map((e) => e.occurredAt), ['2026-11-05T09:00:00.000Z', '2026-11-05T09:01:00.000Z']);` |
| C2 | **PASS** — análise carregada R1; prova R2 | `U:73`: `assert.equal(started.occurredAt, order === 'history-first' ? range.from : observed.occurredAt);` · `U:77`: `assert.deepEqual(all(ctx).filter((e) => e.type === 'turn.start' || e.type === 'turn.end').map((e) => JSON.stringify(e)), before);` · `U:83`: `assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0); assert.equal(all(ctx).length, 3);` |
| C3 | **PASS** — análise carregada R1; prova R2 | `U:94`: `assert.ok(failed.warnings.includes('HISTORY_EVENT_CONFLICT')); assert.equal(failed.imported, 0); assert.equal(JSON.stringify(f.allEvents()), before);` · `U:103`: `assert.equal(getCodexDiagnostic(g.ctx.config.dataDir, g.source.id)?.code, 'CODEX_EVENT_CONFLICT');` |
| C4 | **PASS** — análise carregada R1; prova R2 | `U:117`: `assert.ok(result.warnings.includes('HISTORY_TIMESTAMPS_UNAVAILABLE')); assert.equal(result.imported, 3);` · `U:118`: `assert.deepEqual(f.allEvents().map((e) => [e.type, e.payload]), [['turn.end', { turnId: 'failed', outcome: 'failed' }], ['turn.end', { turnId: 'aborted', outcome: 'interrupted' }], ['session.interrupt', { reason: 'user' }]]);` |
| C5 | **PASS** — reavaliado R2, fecha F1/F2 | `U:151`: `assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);` · `U:153`: `assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);` · `U:152`: `assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);` |
| C6 | **PASS** — análise carregada R1; prova/citações R2 | `U:170`: `assert.equal(cancelled.imported, 1); assert.ok(cancelled.warnings.includes('HISTORY_CANCELLED'));` · `U:171`: `assert.equal(limited.imported, 1); assert.ok(limited.warnings.includes('HISTORY_MORE_AVAILABLE'));` · `U:176,178–179`: `assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_TRUNCATED'));`, `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 1); assert.equal(f.allEvents().length, 5);`, `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);` |
| C7 | **PASS** — análise carregada R1; prova/citações R2 | `U:197`: `assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);` · `U:198`: `assert.ok(result.warnings.some((w) => w !== 'HISTORY_LIFECYCLE_ONLY')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);` |
| C8 | **PASS** — análise carregada R1; prova R2 | `I:22`: `assert.equal(new Set(documents.flat().filter((e) => e.eventId === id).map((e) => e.occurredAt)).size, 1);` · `I:23`: `assert.equal(drained.inserted, 2); assert.equal(drained.duplicates, 6); assert.equal(drained.rejected, 0);` |
| C9 | **PASS** — reavaliado R2, fecha F3 | `I:40`: `assert.equal(limited.status, 1); assert.equal(partial.imported, 1); assert.equal(partial.complete, false);` · `I:41`: `assert.deepEqual(partial.warnings, ['HISTORY_LIFECYCLE_ONLY', 'HISTORY_MORE_AVAILABLE']);` · `I:42`: `assert.equal(resumed.status, 1); assert.equal(JSON.parse(resumed.stdout).imported, 1);` |

Citações complementares atualizadas nos arquivos tocados:

- C1 contexto/proveniência/privacidade: `U:49–53` permanecem nas mesmas linhas e com as mesmas assertions literais da R1. C4 zero duração derivada: `U:120`, `assert.equal(deriveTime(f.ctx, f.filter).agentAccumulatedMs, 0);`.
- C5 fonte incompatível: `U:159`, `assert.throws(() => configureHistory(f.ctx, claudeId, { parser: 'codex-rollout-0.167.0', path: f.path }), { code: 'HISTORY_SOURCE_MISMATCH' });`.
- C6 origem intacta: agora `U:173`, `assert.deepEqual(await readFile(f.path), before);`. C7 fronteiras: agora `U:190–194` (64 MiB + 1, linha >1 MiB, UTF-8 inválido, 10001 linhas totais e ordinal 0→2).
- C8 ausência de `.rejected`: `I:24`, `assert.equal((await readdir(join(f.ctx.config.dataDir, 'queue'))).some((name) => name.endsWith('.rejected')), false);`, sem mudança de linha.
- C9 primeira importação sem limite preservada em fonte independente: `I:44–48`; assertion literal `I:48`: `assert.equal(imported.status, 1); assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);`.
- C9 replay/help/privacidade/origem: `I:49`: `assert.equal(JSON.parse(cli(...args).stdout).imported, 0);`; `I:50`: `assert.match(cli('help').stdout, /codex-rollout-0\.167\.0/);`; `I:52`: `assert.equal(invalid.status, 1); assert.ok(JSON.parse(invalid.stdout).warnings.includes('HISTORY_FORMAT_UNSUPPORTED'));`; `I:53–54`: `assert.equal((invalid.stdout + invalid.stderr).includes('PRIVATE_'), false);` e `assert.equal(await readFile(path, 'utf8'), bytes + line('PRIVATE_FUTURE', { token: 'PRIVATE_CREDENTIAL' }) + '\n');`.

## R2 — fechamento de F1/F2/F3 e verificações adicionais

| Finding R1 | Fix inspecionado e evidência R2 | Resultado |
|---|---|---|
| F1 — subagente tratado como raiz | `src/collectors/codex-history.ts:64–65` aceita somente source string conhecido/ausente e thread_source user/ausente/null; objetos subagent/internal e classificações não-user são recusados antes da primeira emissão. Casos novos em `U:137–140`, assertions zero em `U:151–153`. | **Fechado** |
| F2 — persistência antes de thread divergente | `src/collectors/codex-history.ts:73–86` faz preflight de todos os `event_msg`/`turn_context`; `:75` recusa thread divergente antes de `:87` emitir aviso ou `:110` emitir evento. Novo cenário tem início válido antes da divergência (`U:141`), mas exige zero eventos/recibos. | **Fechado** |
| F3 — HLC + MORE sai 0 | `src/cli/index.ts:104` inclui explicitamente `result.warnings.includes('HISTORY_LIFECYCLE_ONLY')` na condição de exit não zero. C9 recompilado comprovou limite1 exit1, retomada1 exit1 e primeira importação sem limite2 exit1 (`I:39–48`). | **Fechado** |

Além das provas obrigatórias, executei 12 verificações sintéticas via `node --import tsx --input-type=module`, com `fixture()`, fontes/raízes temporárias e implementação intacta. Todos os 12 casos apareceram como `PASS` no output e encerraram sem erro:

- **5 aceitações de raiz:** `root-cli`, `root-vscode`, `root-exec`, `root-mcp`, `root-unknown`, todos com `thread_source: 'user'`; exigiram 2 eventos, 2 recibos, `complete:false` e warnings exatamente `['HISTORY_LIFECYCLE_ONLY']`. Confirma que a validação conservadora não bloqueou esses formatos de raiz conhecidos.
- **4 recusas de origem:** `review`, `spawn`, `internal` (`source:{internal:'guardian'}`), `thread-source` (`thread_source:'subagent'`); exigiram zero eventos/recibos e warnings exatamente `['HISTORY_LINEAGE_UNSUPPORTED']`.
- **2 recusas tardias sem prefixo:** `late-event-thread` e **`late-context-thread`**, divergência depois de lifecycle válido; exigiram zero eventos/recibos e warnings exatamente `['HISTORY_SOURCE_MISMATCH']`. O segundo cobre adicionalmente a outra superfície do preflight novo.
- **1 regressão CLI de outro parser:** `normalized-v1` com 2 eventos válidos, `--limit 1`; manteve **exit 0**, `imported:1`, `complete:false` e warnings exatamente `['HISTORY_MORE_AVAILABLE']`. A regra anterior dos parsers sem HLC permanece; não se inferiu isso apenas do teste Codex.

As assertions dessas verificações adicionais foram aplicadas em memória ao resultado real, incluindo `assert.equal(result.imported,c.expected)`, `assert.equal(f.allEvents().length,c.expected)`, `assert.equal(receipts.length,c.expected)` e `assert.deepEqual(result.warnings,[c.code??'HISTORY_LIFECYCLE_ONLY'])`. Não são arquivos de teste acrescentados ao repo nem substituem as provas C1–C9 com file:line.

## R2 — Swept e limites do scoped

- **Carregados da R1:** as inspeções de `prepareCapture`, raízes/política, recibos exclusivos, append imutável, backup/restore, proveniência/cursor transacionais e projeção de sessões continuam válidas; o diff R1→R2 não altera esses módulos. Todas as provas relacionadas foram reexecutadas. Não se refez auditoria global fora do alcance do fix.
- **Validation/Authorization afetadas:** reavaliadas com source/thread_source em `codex-history.ts:63–66`, preflight de thread/contexto em `:73–86` e as provas/reproduções acima. F1/F2 não permanecem como ressalvas abertas.
- **Failure modes/Observability afetadas:** aviso obrigatório agora em `codex-history.ts:87`; o resultado parcial em `history.ts:207–212` permanece, e a CLI em `index.ts:104` agora não o mascara junto de MORE. SIGINT mantém o tratamento existente de cancelamento (130), não foi alterado para outros parsers.
- **Referências deslocadas no parser:** timestamp/lifecycle `codex-history.ts:98–104`; normalização, filtro de turn.submit e outcome `:105–110`; truncamento `:113`; contexto/ordenação `:73–85`. Conteúdo fora dos guards acrescentados é igual à R1.
- **Design binding, Coverage, Test policy:** continuam ausentes; nenhuma seção exigindo investigação adicional foi presumida. Mantido perfil LIGHT.
- **Fault injection:** não executado. As entradas adicionais não modificaram código. Sem subagents, commits, rede, perfis/serviços pessoais ou leitura de dados pessoais.
- **Nível/amostragem:** unitários com store real e integração de CLI compilada/processos. Concorrência novamente com 4 processos; não é prova exaustiva de interleavings/crash. Não executei suites globais/E2E nem usei o resultado do autor como evidência própria. As limitações de amostragem da R1 continuam; os três contraexemplos concretos agora estão cobertos e fechados.
- Somente este relatório foi editado pelo verificador. O bloco histórico R1 abaixo foi preservado integralmente.

**Conclusão R2:** **PASS C1–C9; F1–F3 fechados; nenhum gap restante identificado no escopo LIGHT desta feature.**

---

## Histórico integral — Rodada 1 (FAIL; snapshot anterior, não verdict atual)

# T15 — Codex rollout: verificação independente

**Verdict: FAIL — 7/9 critérios comprovados; C5 e C9 falham.**

- **Profile:** LIGHT, sem AGENTS.md, conforme brief.
- **Round:** 1 — escopo completo desta feature; autor != verificador.
- **Escopo:** os 7 arquivos de `worklog-t15-codex-session.diff`, não `git diff HEAD`.
- **Base:** `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t15-codex-before`.
- **Snapshot:** os 7 SHA-256 coincidiram com `worklog-t15-codex-hashes.json`; reconstruir o unified diff da base real até os arquivos atuais produziu igualdade exata com o diff fornecido.
- **HEAD informativo:** `231e046be73f25c4ecc55aa0790cf796a9590312` contém planejamento anterior, não representa esta implementação.
- Checklist e `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md` lidos integralmente.

## Gaps reproduzidos

### F1 — C5: marcador nativo de subagente não é recusado

`src/collectors/codex-history.ts:60–64` examina alguns campos de linhagem, mas ignora `session_meta.source` e `thread_source`. O contrato local versionado contém `SessionSource::SubAgent` e `SubAgentSource::Review` em `worklog-t15-contracts/protocol.rs:3118–3131,3200–3217`; `SessionMeta.source` está em `:3450–3454`. O marcador de revisão não exige `parent_thread_id` no seu enum.

Reprodução independente, sem mudar código: `node --import tsx --input-type=module` com `fixture()`, fonte Codex 0.167.0, JSONL sintético numa raiz cadastrada, `session_id === id`, `source: { subagent: 'review' }`, seguido de `task_started` e `task_complete` com horários explícitos.

**Observado:** `{"imported":2,"skipped":0,"warnings":["HISTORY_LIFECYCLE_ONLY"],"complete":false}`, eventos `turn.start`, `turn.end`, **2 recibos**. Os eventos saem sem identidade de subagente, como raiz. A mesma reprodução com `source.subagent.thread_spawn` e `thread_source: 'subagent'` também foi aceita.

**Exigido:** recusar a linhagem não suportada antes de persistir eventos/recibos. O aviso de cobertura parcial não é recusa. O teste de C5 cobre `subagent_history_start_ordinal`, mas não esses marcadores (`tests/collectors/codex-history.test.ts:126–140`).

### F2 — C5: thread divergente é detectada depois da persistência do prefixo

`src/collectors/codex-history.ts:93–107` valida `payload.thread_id` apenas durante a emissão; o preflight em `:71–83` não faz essa validação. `history.ts:181–182,196–201` já grava recibo e evento para o primeiro registro emitido.

Reprodução no mesmo runner sintético: metadados de raiz válidos, `task_started` válido e depois `task_complete` com `thread_id` diferente de `meta.id`.

**Observado:** `{"imported":1,"skipped":0,"warnings":["HISTORY_LIFECYCLE_ONLY","HISTORY_SOURCE_MISMATCH"],"complete":false}`, evento `turn.start`, **1 recibo**.

**Exigido por C5:** ID/thread incompatível recusado **antes** de gravar eventos/recibos. A preservação de prefixo de C6 refere-se a limite/cancelamento/truncamento, não substitui essa obrigação. O subteste `thread` atual altera apenas `meta.session_id` (`tests/collectors/codex-history.test.ts:133`), mascarando a validação tardia de lifecycle.

### F3 — C9: limite faz a CLI sinalizar sucesso apesar de lifecycle parcial

`src/cli/index.ts:104` suprime qualquer exit não zero quando há `HISTORY_MORE_AVAILABLE`, inclusive quando também há `HISTORY_LIFECYCLE_ONLY`. A linha é lógica existente, mas o novo parser passa a alcançá-la com esse aviso obrigatório; não é atribuída como linha alterada nesta rodada.

Reprodução independente via **CLI compilada**, após configurar JSONL sintético de raiz com início/fim explícitos:

```text
node dist/cli/index.js history import --source-id <fixture-source> \
  --from 2026-11-05T09:00:00.000Z --to 2026-11-05T09:02:00.000Z \
  --limit 1 --data-dir <fixture-data>
exit: 0
stdout: {"imported":1,"skipped":0,"warnings":["HISTORY_LIFECYCLE_ONLY","HISTORY_MORE_AVAILABLE"],"complete":false}
stderr: ""
```

**Exigido:** `HISTORY_LIFECYCLE_ONLY` deve manter resultado parcial e CLI exit 1, inclusive com limite. O teste de C9 passa sem `--limit` (`tests/integration/codex-history-cli.test.ts:38–40`) e não prova essa combinação. A mesma condição pode ocorrer com o limite padrão de 500 inserções.

## Gates executados pelo verificador

| Comando | Resultado independente |
|---|---|
| `npm run build` | exit 0; TypeScript server + Vite concluídos |
| `npm run typecheck` | exit 0 |
| `npm run test:unit -- tests/collectors/codex-history.test.ts tests/collectors/codex.test.ts tests/collectors/history.test.ts` | exit 0; **42 passed, 0 failed, 0 skipped** |
| `npm run test:integration -- tests/integration/codex-history-cli.test.ts tests/integration/codex-hook.test.ts tests/integration/recovery.test.ts` | exit 0; **7 passed, 0 failed, 0 skipped** |

Uma invocação por target, agrupando todos os arquivos pedidos. Cada teste nomeado abaixo apareceu individualmente como aprovado no runner. Os totais completos relatados pelo autor não foram usados como prova.

## C1–C9: provas e assertions literais

### C1 — PASS

**Teste executado/aprovado:** `Codex rollout: lifecycle explícito, contexto, período e privacidade`, incluindo `legacy` e `paginated`.

- `tests/collectors/codex-history.test.ts:46`: `assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);`
- `:47–48`: `assert.deepEqual(events.map((e) => e.type), ['turn.start', 'turn.end']);` e `assert.deepEqual(events.map((e) => e.occurredAt), ['2026-11-05T09:00:00.000Z', '2026-11-05T09:01:00.000Z']);`
- `:49`: `assert.ok(events.every((e) => e.cwd === nested && e.sourceId === f.source.id && e.nativeSessionId === f.id));`
- `:50–53`: `assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 0);`, `assert.equal(sessions[0]!.provenance, 'imported');`, `assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM file_revisions')!.n, 0);`, `assert.equal(JSON.stringify(events).includes('PRIVATE_'), false);`

O registro no limite superior está em `:43`; o teste inclui o limite inferior e exclui o superior. `history.ts:185` mantém `[from,to)`.

### C2 — PASS

**Teste executado/aprovado:** `Codex rollout: sobreposição live nas duas ordens e recibo legado`, incluindo `live-first`, `history-first`, `legacy-receipt`.

- `tests/collectors/codex-history.test.ts:73`: `assert.equal(started.occurredAt, order === 'history-first' ? range.from : observed.occurredAt);`
- `:77–78`: `assert.deepEqual(all(ctx).filter((e) => e.type === 'turn.start' || e.type === 'turn.end').map((e) => JSON.stringify(e)), before);` e `assert.equal(all(ctx).length, 3); assert.equal(all(ctx).filter((e) => e.type === 'turn.submit').length, 1);`
- `:79,83`: `assert.equal((await importHistory(ctx, f.source.id, range)).imported, 0);` antes e depois de reabrir o store; `:83` também exige `all(ctx).length === 3`.

O recibo legado é preparado pelo mesmo `prepareCapture` do adapter, em `:66–68`. O snapshot `before` é local ao teste, imediatamente após a importação, e a comparação inclui ID, horário e corpo persistido.

### C3 — PASS

**Teste executado/aprovado:** `Codex rollout: conflitos conservam eventos imutáveis e falha explícita`.

- `tests/collectors/codex-history.test.ts:94`: `assert.ok(failed.warnings.includes('HISTORY_EVENT_CONFLICT')); assert.equal(failed.imported, 0); assert.equal(JSON.stringify(f.allEvents()), before);`
- `:102–104`: `assert.equal(queueCodex(g.ctx.config.dataDir, g.source.id, g.hook('Stop')), 0);`, `assert.equal(getCodexDiagnostic(g.ctx.config.dataDir, g.source.id)?.code, 'CODEX_EVENT_CONFLICT');`, `assert.equal(JSON.stringify(g.allEvents()), before);`

Diferença só de horário é exercitada em C2. `src/core/events.ts:89–101` continua comparando o conteúdo integral e recusando identidade divergente; não foi alterado no diff desta feature.

### C4 — PASS

**Teste executado/aprovado:** `Codex rollout: horários ausentes, falhas e interrupções não são fabricados`.

- `tests/collectors/codex-history.test.ts:117`: `assert.ok(result.warnings.includes('HISTORY_TIMESTAMPS_UNAVAILABLE')); assert.equal(result.imported, 3);`
- `:118`: `assert.deepEqual(f.allEvents().map((e) => [e.type, e.payload]), [['turn.end', { turnId: 'failed', outcome: 'failed' }], ['turn.end', { turnId: 'aborted', outcome: 'interrupted' }], ['session.interrupt', { reason: 'user' }]]);`
- `:120`: `assert.equal(deriveTime(f.ctx, f.filter).agentAccumulatedMs, 0);`

Lista exata de eventos exclui `session.end`; ausência/zero não produzem início nem duração derivada. Parser usa somente segundos explícitos (`codex-history.ts:15–20,95–99`).

### C5 — FAIL (teste nomeado verde, obrigação incompleta)

**Teste executado/aprovado:** `Codex rollout: contrato e autorização negam entradas não suportadas`, com os 13 subtestes `version`, `source-version`, `invalid-id`, `outside`, `paused`, `symlink`, `thread`, `fork`, `prefix`, `inherited`, `mode`, `context`, `settings-cwd`.

- `tests/collectors/codex-history.test.ts:146`: `assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);`
- `:147–148`: `assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);` e `assert.equal((await readdir(join(f.ctx.config.dataDir, 'codex-receipts')).catch(() => [])).length, 0);`
- `:154`: `assert.throws(() => configureHistory(f.ctx, claudeId, { parser: 'codex-rollout-0.167.0', path: f.path }), { code: 'HISTORY_SOURCE_MISMATCH' });`

Essas assertions provam os casos presentes, não os omitidos. **F1 e F2 reproduzem violações diretas** da recusa de subagentes/thread incompatível antes da persistência.

### C6 — PASS

**Teste executado/aprovado:** `Codex rollout: cancelamento, limite e truncamento retomáveis`.

- `tests/collectors/codex-history.test.ts:165–166`: `assert.equal(cancelled.imported, 1); assert.ok(cancelled.warnings.includes('HISTORY_CANCELLED'));` e `assert.equal(limited.imported, 1); assert.ok(limited.warnings.includes('HISTORY_MORE_AVAILABLE'));`
- `:167–168`: `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 2); assert.equal(f.allEvents().length, 4);` e `assert.deepEqual(await readFile(f.path), before);`
- `:171,173–174`: `assert.ok((await importHistory(f.ctx, f.source.id, range)).warnings.includes('HISTORY_TRUNCATED'));`, `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 1); assert.equal(f.allEvents().length, 5);`, `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0);`

### C7 — PASS

**Teste executado/aprovado:** `Codex rollout: limites, sequência e schemas desconhecidos`, incluindo `symlink`, `directory`, `size`, `line`, `utf8`, `count`, `ordinal`, `schema`.

- `tests/collectors/codex-history.test.ts:192`: `assert.equal(result.complete, false); assert.equal(result.imported, 0); assert.equal(f.allEvents().length, 0);`
- `:193`: `assert.ok(result.warnings.some((w) => w !== 'HISTORY_LIFECYCLE_ONLY')); assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);`

Os valores de fronteira estão literais em `:185–189`: 64 MiB + 1 byte, linha >1 MiB, byte 0xff, 10001 linhas totais e ordinais 0→2. Código em `codex-history.ts:22–49` valida antes da emissão, com códigos constantes. O teste não discrimina qual código específico cada caso retorna; C7 não fixa esses nomes.

### C8 — PASS

**Teste executado/aprovado:** `Codex: processos concorrentes compartilham recibo offline`.

- `tests/integration/codex-history-cli.test.ts:19–20`: `assert.ok(results.every((r) => r.status === 0 && r.out === '{}\n' && r.err === ''));` e `assert.equal(queued.length, 4);`
- `:22`: `assert.equal(new Set(documents.flat().filter((e) => e.eventId === id).map((e) => e.occurredAt)).size, 1);` para cada ID enfileirado.
- `:23–24`: `assert.equal(drained.inserted, 2); assert.equal(drained.duplicates, 6); assert.equal(drained.rejected, 0);` e `assert.equal((await readdir(join(f.ctx.config.dataDir, 'queue'))).some((name) => name.endsWith('.rejected')), false);`

Quatro processos independentes executam a CLI compilada sem abrir banco no hook. Batch legado também exercitado por C2 e pela regressão Codex. A escolha exclusiva está em `codex-receipts.ts:49–57` (hard link, EEXIST, releitura do vencedor).

### C9 — FAIL (teste nomeado verde, combinação com limite falha)

**Teste executado/aprovado:** `Codex rollout CLI: configuração, importação, replay e diagnóstico privado`.

- `tests/integration/codex-history-cli.test.ts:37`: `assert.equal(cli('history', 'configure', '--source-id', source.id, '--parser', 'codex-rollout-0.167.0', '--input', path).status, 0);`
- `:40–42`: `assert.equal(imported.status, 1); assert.equal(result.imported, 2); assert.equal(result.complete, false); assert.deepEqual(result.warnings, ['HISTORY_LIFECYCLE_ONLY']);`, `assert.equal(JSON.parse(cli(...args).stdout).imported, 0);`, `assert.match(cli('help').stdout, /codex-rollout-0\.167\.0/);`
- `:44–46`: `assert.equal(invalid.status, 1); assert.ok(JSON.parse(invalid.stdout).warnings.includes('HISTORY_FORMAT_UNSUPPORTED'));`, `assert.equal((invalid.stdout + invalid.stderr).includes('PRIVATE_'), false);`, `assert.equal(await readFile(path, 'utf8'), bytes + line('PRIVATE_FUTURE', { token: 'PRIVATE_CREDENTIAL' }) + '\n');`

Sem alteração da configuração pessoal: o caminho de importação escreve somente estado Worklog, recibos e banco; não chama instalação de hooks/perfis. Entretanto **F3** contradiz a obrigação de exit 1 para o limite parcial.

## Regressões: testes individualmente aprovados

Também apareceram aprovados, sem filtro vazio:

- `Codex: contrato 0.167.0 e privacidade`
- `Codex: pai, subagente e interrupção nas projeções`
- `Codex: fila offline, replay e escopo`
- `Codex: rejeições e diagnóstico sem payload`
- `Codex: instalação seletiva, backup e confiança`
- `histórico: três fontes, período, replay/live e proveniência`
- `histórico: truncamento, formato, timestamp e retomada`
- `histórico: cancelamento e escopo autorizado`
- `histórico: OpenCode legado somente leitura e compatibilidade`
- `Codex: entrypoint compilado fail-open e offline`
- `retenção: corte, deduplicação e eventos preservados`
- `backup e restore: snapshot consistente e falhas seguras`
- `configurações: persistência, política e orçamento`
- `configurações: efeito do idle com probe controlado`

Os 7 testes novos unitários + 26 subtestes + 9 regressões unitárias totalizam 42; os 2 novos de integração + 5 regressões totalizam 7. Localização das provas feita com `functions.grep` (nomes e assertions); `rg -n -A ...` foi tentado, mas o executável `rg` não está instalado, exit 127. Sem instalar ferramentas.

## Swept existente confrontado com código

| Restrição | Evidência inspecionada / conclusão |
|---|---|
| Validation | `codex-history.ts:15–20,95–99`: segundos explícitos, sem uso do timestamp externo para execução. Limites/UTF-8/ordinais em `:22–49`. Falha de linhagem coberta por F1/F2, não ignorada pelo verde. |
| Failure modes | `history.ts:207–212`: warnings conservam estado parcial; `codex-history.ts:84` sempre anuncia lifecycle-only após preflight válido. Exceção na sinalização CLI: **F3**. |
| Idempotency/retry | `codex-receipts.ts:21–24,34–57`: ignora somente horário na comparação, seed legado, recibo unitário exclusivo; `events.ts:89–101`: duplicação não reescreve evento. C2/C6/C8 passaram. |
| Authorization | `projects.ts:81–90` exige raiz explícita habilitada; `history.ts:178–182` chama `prepareCapture` antes de persistir recibo. `queue.ts:27–35` valida fonte, realpath, pausa e política. Não chama descoberta de workspace no parser. Isso não corrige as recusas de linhagem/thread omitidas em F1/F2. |
| Concurrency/ordering | `codex-receipts.ts:49–57` hard link exclusivo/releitura; `history.ts:137–144,196–205` lock por contexto, append transacional e yield; `codex-history.ts:44–47,71–81` ordinal/contexto. O lock não foi tratado como exclusão entre processos; C8 testa processos para recibos. |
| Data lifecycle | `events.ts:89–101` imutável; `history.ts:196–201` proveniência/cursor/contadores no callback da transação. `maintenance.ts:35–58,60–73,86–90,139–147` aceita arrays de 1–4 eventos e copia/restaura recibos sem mudar nomes; array unitário compatível. Nenhum schema de evento/migração alterado no diff. |
| Dependency failure | `codex-receipts.ts:12–17,49–57` não persiste evento em caso de falha de recibo; `history.ts:183` mapeia erro para código fixo; `codex.ts:69–75` fail-open, diagnóstico sem mensagem externa. C8 e entrypoint compilado provaram operação offline. Sem injeção de falha de disco. |
| State transitions | `codex-history.ts:102–107` filtra turn.submit e só normaliza bordas explícitas; `sessions.ts:32–38,44–79` exige início conhecido para completude. C1/C4 confirmaram sessão incompleta e zero tempo humano/derivado sem início. |
| Observability | `history.ts:209–212` usa código fixo e estado partial; `source-status.ts:25–26` expõe warnings; `web/pages/Integrations.tsx:63` mostra parcial. Inspeção estática da UI, sem auditoria visual. CLI tem **F3**. |

## Perfil, nível e limitações

- **Design binding:** ausente; nenhuma comparação de design `ui` aplicável. As referências em Sources não foram declaradas design binding. A cópia Rust local foi aberta pontualmente para fundamentar F1, sem rede.
- **Coverage / Test policy sections:** ausentes; sem join ou verdicts de linhas dessas seções. Seguiu-se o nível existente: unitários com store real e integração de CLI compilada/processos.
- **Fault injection:** não executado, conforme LIGHT e instrução explícita. As reproduções extras forneceram entradas sintéticas à implementação intacta; não são mutações de código nem novos testes commitados.
- **Amostragem:** todos os C1–C9 e todas as provas pedidas foram examinados/executados. A concorrência é uma rodada de quatro processos, não prova exaustiva de interleavings nem queda de energia. Não foram executadas suites globais/E2E, modelos, serviços, perfis pessoais ou dados pessoais.
- As assertions de C5 cobrem só os formatos de recusa presentes na matriz; F1/F2 demonstram por que essa amostra não encerra C5. C9 cobre o caminho sem limite; F3 demonstra o caso omitido. Não se usa uma limitação para transformar esses gaps em PASS.
- Nenhuma redução de assertion ou alteração das precondições dos testes foi feita pelo verificador. Nenhum código/checklist/doc de implementação foi alterado; somente este relatório foi criado. Sem subagents, commits ou instalações.

**Conclusão:** gates verdes não encerram a feature. Corrigir as recusas/preflight de C5 e a sinalização CLI de C9 e acrescentar provas para os três contraexemplos antes da próxima verificação. Este recorte permanece lifecycle-only e não encerra toda a T15.
