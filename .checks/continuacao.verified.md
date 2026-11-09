# Continuação — verificação independente final, rodada 3

**Verdict final: PASS — 33/33 checks provados no profile light. F1–F16 e S1 fechados.**

- **Round:** 3 — scoped, 08/11/2026, encerramento dentro do limite de três rodadas. Reavaliado F3/A:C10; carry explícito dos outros 32 PASS e S1 da rodada 2, com todas as provas reexecutadas.
- **Profile:** light. Sem fault injection do verifier, sem Coverage join ou avaliação obrigatória de Test policy, sem auditoria visual do profile ui. O PASS cobre as 33 claims verificadas com as evidências registradas, não aceites operacionais fora delas.
- **Range:** `231e046be73f25c4ecc55aa0790cf796a9590312` → working tree atual, incluindo untracked. HEAD permanece nessa base. Não existe SHA da working tree das rodadas anteriores nem diff Git exclusivo entre elas; não apresento todo o src/tests untracked como alteração desta rodada.
- **Escopo informado e conferido:** ajuste de harness em `tests/integration/history-cli.test.ts` e registro final de `.checks/t20-retomada.md:83`; nenhuma mudança de runtime/source informada desde a rodada 2. Claims, volume e assertions não foram reduzidos.
- **Independência e escrita:** verifier sem autoria da implementação/correções, nenhuma delegação; somente este relatório editado. Sem commit, instalação/início de serviços pessoais, alteração de confiança/configuração pessoal ou chamada a modelos/provedores reais. Smoke autorizado usa fonte read-only e store temporário; testes usam seus dados isolados e artefatos normais.

## Rodada 3 — provas executadas pelo verifier

Runtime observado: Node `v24.19.0`. Typecheck/build concluídos antes das provas compiladas. Uma execução por target; unitários/integração/E2E/smoke executados concorrentemente entre targets, como no cenário da falha anterior. Depois executei uma vez o caso CLI isolado, autorizado para esta rodada. Nenhum retry para esconder falha: **todas as execuções desta rodada passaram na primeira tentativa**.

| Comando | Resultado observado |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; TypeScript servidor + Vite, 45 módulos |
| `npm run test:unit` | exit 0; **46 passed, 0 failed, 0 skipped/cancelled** |
| `npm run test:integration` | exit 0; **25 passed, 0 failed, 0 skipped/cancelled**; caso CLI **15755.460958 ms** |
| `npm run test:e2e` | exit 0; **28 passed**, 14 cenários em desktop/mobile; nenhum skip |
| smoke histórico read-only, abaixo | exit 0; **46/46 IDs**, replay0, eventos humanos/arquivo0, revisões0 |
| `npm run test:integration -- tests/integration/history-cli.test.ts` | exit 0; **1 passed, 0 failed, 0 skipped/cancelled**; caso CLI **9185.7345 ms** |

O teste isolado não é somado aos 25 testes distintos de integração. Os nomes das provas dos checklists e das adicionais HTTP/idle/sync/race apareceram individualmente como executados e aprovados. Não inferi prova por check apenas a partir das contagens das suites.

## F3 / A:C10 — reavaliado e fechado nesta rodada

Prova nominal: **`histórico CLI: exportação, importação e erro acionável`**, executada com êxito tanto na suite completa concorrente quanto isoladamente.

### Mudança do harness conferida

`tests/integration/history-cli.test.ts:9,12,33,35,44`:

- timeout do teste **60000 ms**;
- helper `spawnSync` e processo de cancelamento com timeout **30000 ms**;
- espera de **`close`**, garantindo drenagem dos pipes antes de consumir o JSON;
- assertion da retomada mantém `status === 0` e inclui stdout/stderr/error na mensagem de falha.

É alteração do orçamento/observação da prova. Não muda o contrato de importação nem estabelece SLA de 10/30 segundos para o produto. As durações registradas são do caso completo, não medições isoladas da chamada de retomada.

### Assertions atuais pertinentes — executadas nas duas provas

| Claim de A:C10 | Evidência atual |
|---|---|
| CLI configure/export/import com argv separado, período e path com espaço | `tests/integration/history-cli.test.ts:11–13,18–24` — `assert.equal(exported.status, 0, exported.stderr)`; `assert.equal(JSON.parse(exported.stdout).exported, 3)`; configure status0; import1/replay0; banco4. |
| Cancelamento somente após registro confirmado, sem eliminar a exigência de SIGINT | `:38–42` — `assert.ok(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n > 4)`; `assert.equal(child.kill('SIGINT'), true); assert.equal(await exited, 130)`; `assert.equal(cancelled.complete, false); assert.deepEqual(cancelled.warnings, ['HISTORY_CANCELLED'])`; `assert.ok(cancelled.imported > 0 && cancelled.imported < 1000)`. |
| Registros confirmados correspondem ao banco | `:43` — `assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 4 + cancelled.imported)`. |
| Retomada conclui o lote integral de 1000 | `:44–46` — `assert.equal(resumed.status, 0, JSON.stringify({ stdout: resumed.stdout, stderr: resumed.stderr, error: resumed.error?.message }))`; `assert.equal(result.complete, true); assert.equal(result.imported + cancelled.imported, 1000)`; `assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) n FROM events')!.n, 1004)`. |
| Replay e diagnóstico privado | `:47–48` — `assert.equal(JSON.parse(run('import', ...period).stdout).imported, 0)`; `assert.equal(\`${stdout}${stderr}${resumed.stdout}${resumed.stderr}\`.includes('PRIVATE_TRANSCRIPT'), false)`. Formato inválido também mantém status1 e `HISTORY_FORMAT_UNSUPPORTED` em `:27–28`. |

**Resultado: PASS — F3 fechado.** O ajuste foi seguido de duas execuções independentes verdes nesta rodada, incluindo a suite com outros targets concorrentes. A falha130 da rodada 2 e seus retries permanecem registrados abaixo; o fechamento atual decorre da alteração e das provas atuais, não de reclassificar aquela falha como sucesso. Nenhuma alegação de estabilidade universal além das execuções observadas.

## Carry explícito dos outros 32 PASS e de S1

**Origem:** rodada 2 — scoped, working tree sobre `231e046`, seções preservadas abaixo **“F1–F16 reavaliados”**, **“PASS anteriores carregados e citações refrescadas”** e **“S1 e Swept afetados”**. Não há SHA próprio desse estado. As provas foram reexecutadas agora; o julgamento/assertions desses checks e suas citações carregam explicitamente da rodada 2, pois o único arquivo de prova alterado nesta rodada é o de A:C10.

| Namespace / checks carregados | Quantidade | Origem da evidência e estado atual |
|---|---:|---|
| A = `.checks/t14-t15.md`: C1,C2,C3,C4,C5,C6,C7,C8,C9,C11 | 10 | Carry rodada 2: testes fontes/histórico e smoke, com file:line e assertions nas tabelas preservadas; provas atuais verdes. **PASS** |
| B = `.checks/t18-t19.md`: C1,C2,C3,C4,C5 | 5 | Carry rodada 2: provider, API de PR e resumos; evidências/assertions atuais da rodada 2 preservadas, provas atuais verdes. **PASS** |
| D = `.checks/t20-t23.md`: C1,C2,C3,C4,C5,C6,C7,C8,C9,C10 | 10 | Carry rodada 2: detalhe/HTTP409/410, ledger/notas, relatórios, retenção/restore/config/idle/sync; evidências/assertions preservadas e provas atuais verdes. **PASS** |
| R = `.checks/t20-retomada.md`: C1,C2,C3,C4,C5,C6,C7 | 7 | Carry rodada 2: navegação, filtros, paginação/retry e full-flow; evidências/assertions preservadas, E2E/API atuais verdes. **PASS** |
| S1, fora do denominador | — | Carry rodada 2: cancelamento/guard de sessão e commit; `tests/e2e/project-history.spec.ts:280–282,293–295`, prova `detalhes: fechar leitura atrasada preserva a evidência aberta depois` passou novamente desktop/mobile. **Fechado** |

**Reconciliação final:** 32 PASS carregados + A:C10 PASS reavaliado = **33/33**. A **11/11**, B **5/5**, D **10/10**, R **7/7**. F1–F16 e S1 encerrados; **nenhum finding remanescente no escopo**. A releitura Swept da rodada 2 também é carregada explicitamente: o ajuste do harness não alterou os caminhos de auth, roots/política, provider, imutabilidade, backup/retenção ou cancelamento de UI.

## Smoke histórico real da rodada 3 e limites operacionais

Li novamente `scripts/smoke-history.ts` antes de executar:

```sh
npm run smoke:history -- --database "/Users/lucasruon/.local/share/opencode/opencode.db" --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --from "2026-11-06T13:55:00.000Z" --to "2026-11-06T14:05:00.000Z"
```

Resultado real: **1912** registros nativos varridos; **46** IDs esperados/importados; **0** inseridos no replay; resumo `evidence-summary-v1` com **46** evidências; **0** eventos humanos/foco/file.change e **0** `file_revisions`. Evidência: `scripts/smoke-history.ts:50–58`, incluindo comparação exata de sets de IDs e assertions de zeros. Store temporário isolado removido pelo cleanup; fonte aberta pelo leitor read-only. Amostra: 564926 → 4657446 bytes, database487424 bytes, orçamento1073741824 bytes, 6886 ms. Não é medição de um dia.

**Continuam pendentes, fora deste aceite:** captura real T12/confiança pessoal, PR real no piloto, parsers históricos nativos adicionais, piloto de um dia/T24 e bloqueio/suspensão físicos. Full-flow controlado e smoke de dez minutos não concluem esses aceites. O PASS final se limita aos 33 checks e às restrições do profile light.

---

## Histórico preservado — rodada 2, superado pelo veredito final da rodada 3

As seções seguintes conservam integralmente o diagnóstico e resultados anteriores, inclusive a falha intermitente da CLI. Seus vereditos são históricos; o estado atual é o header da rodada 3 acima.

# Continuação — re-verificação independente, rodada 2 (histórica)

**Verdict final da rodada 2: FAIL — 32/33 checks provados; A:C10 com prova intermitente. S1 fechado.**

- **Round:** 2 — scoped, 08/11/2026. Reavaliados F1–F16, S1 e os caminhos alterados informados; os outros PASS carregam origem explícita abaixo. Todos os targets foram reexecutados integralmente.
- **Profile:** light. Sem fault injection do verifier, sem Coverage join ou vereditos obrigatórios de Test policy, sem auditoria visual do profile ui. Os mocks/processos controlados pertencem às provas existentes executadas.
- **Range:** base `231e046be73f25c4ecc55aa0790cf796a9590312` → working tree atual, incluindo untracked. HEAD continua nessa base. **Não existe SHA/snapshot Git da working tree da rodada 1** nem diff Git que separe exclusivamente as correções entre rodadas; a lista de alterações do usuário foi confrontada com os arquivos atuais e com o registro histórico preservado ao final deste arquivo. Não atribuo todos os untracked a esta rodada.
- **Verifier:** mesmo agente independente da implementação, sem autoria das correções e sem delegação. Somente este relatório foi editado; nenhum código/teste/checklist alterado, nenhum commit ou serviço pessoal iniciado/configurado. Não executei modelos nem provedores reais. Foram consultadas páginas públicas de documentação GitHub, sem consulta a repositório/PR real.
- **Origem do carry:** seção histórica **rodada 1 — working tree sobre 231e046**, neste mesmo relatório. O veredito histórico 17/33 foi superado por esta seção; não apagado. Citations de arquivos tocados foram atualizadas nesta rodada.

## Rodada 2 — fontes e execução

Relidos integralmente `references/verify.md`, `.checks/t20-retomada.md` (incluindo a seção final de correções) e `.checks/t20-t23.md` (incluindo provas adicionais HTTP/idle/sync). As 33 claims foram mantidas. Fontes/checklists A/B e demais restrições sem mudança carregam da rodada 1; não reinterpretei adiamentos históricos como proibição da retomada.

Inspecionados os testes alterados e `src/providers/github.ts`, `src/web/Workspace.tsx`, `src/web/pages/ProjectDetail.tsx`; leitor read-only e script do smoke novamente conferidos antes de executar. Para a mudança do provider consultei as páginas públicas `https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28` e `https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28`. A requisição do código mantém `X-GitHub-Api-Version: 2022-11-28` (`src/providers/github.ts:76`); enums conhecidos são validados em `:32,122–125` e normalização desconhecida torna o recurso indisponível em `:96–97`, preservando o PR. Não foi feita uma Coverage join do catálogo externo.

### Gates — resultados observados, inclusive falha e retries

Build foi concluído antes dos testes que usam `dist`. Unitários, integração, E2E e smoke foram disparados em invocações batched por target, em paralelo entre targets na primeira execução. Somente o target/teste com falha foi repetido.

| Execução | Resultado do verifier |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; servidor compilado e Vite, 45 módulos |
| `npm run test:unit` | exit 0; **46 passed, 0 failed, 0 skipped/cancelled** |
| `npm run test:integration` — primeira execução completa | **exit 1; 24 passed, 1 failed, 0 skipped/cancelled**. `histórico CLI: exportação, importação e erro acionável` falhou em `tests/integration/history-cli.test.ts:44:76`, `130 !== 0`. Duração desse teste: 11543.835 ms. |
| `npm run test:e2e` | exit 0; **28 passed**, 14 cenários em desktop + mobile; nenhum skip |
| smoke histórico real | exit 0; **46/46 IDs, replay 0, humanOrFileEvents 0, fileRevisions 0** |
| `npm run test:integration -- tests/integration/history-cli.test.ts` — reprodução isolada | exit 0; **1 passed**, 8324.03025 ms |
| `npm run test:integration` — segunda execução completa sem os outros targets concorrentes | exit 0; **25 passed, 0 failed, 0 skipped/cancelled**; teste da CLI 10348.328917 ms |

As contagens não são somadas entre tentativas. A segunda execução verde não apaga a primeira vermelha. Não há alteração de código entre essas execuções. Todos os testes nomeados nos checks, e as provas adicionais HTTP/idle/sync/race, apareceram individualmente no output. O único nome com resultados divergentes foi o histórico CLI.

### Smoke histórico real da rodada 2

```sh
npm run smoke:history -- --database "/Users/lucasruon/.local/share/opencode/opencode.db" --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --from "2026-11-06T13:55:00.000Z" --to "2026-11-06T14:05:00.000Z"
```

Resultado real: 1872 registros nativos varridos, 46 IDs esperados/importados, replay zero, 46 evidenceIds do resumo `evidence-summary-v1`, zero eventos humanos/foco/file.change e **zero file_revisions**. Store temporário isolado; 564926 → 4653326 bytes, database 487424 bytes, 5745 ms. O leitor abre a fonte com `readOnly: true` e `query_only = ON` (`src/core/sqlite.ts:7–16`); cleanup do store em `scripts/smoke-history.ts:61`. A amostra não mede crescimento de um dia.

## Rodada 2 — F1–F16 reavaliados, com evidências atuais

Namespaces preservados: **A** `.checks/t14-t15.md`; **B** `.checks/t18-t19.md`; **D** `.checks/t20-t23.md`; **R** `.checks/t20-retomada.md`. As assertions originais dos checks continuam como evidência histórica, complementadas/refrescadas abaixo.

| Finding / check | Prova executada nesta rodada | Evidência atual que fecha a lacuna, ou falha remanescente | Resultado atual |
|---|---|---|---|
| F1 — D:C4 | Integração `projeto: conflitos HTTP e revogação real de download por política`; unitário `ajustes: conflito, concorrência e desfazer imutável` | `tests/integration/project-detail.test.ts:39,41` — `assert.equal(overlap.status, 409); assert.equal((await overlap.json()).error, 'ADJUSTMENT_OVERLAP')`; `assert.equal(stale.status, 409); assert.equal((await stale.json()).error, 'ADJUSTMENT_CHANGED')`. Compensação e raw events atuais: `tests/core/adjustments.test.ts:39–42` — `assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 300000)`; `assert.equal(JSON.stringify(f.allEvents()), raw)`; contagem `time_adjustments = 2` e DELETE rejeitado. | **PASS — F1 fechado** |
| F2 — D:C6 | Unitário `relatório completo: seleção, notas, PRs, revisões e política`; integração HTTP acima e retenção | `tests/reports/full-report.test.ts:33–34` — `setRootEnabled(f.ctx, f.rootRecord.id!, false)` seguido de `assert.throws(() => savedReport(f.ctx, policySnapshot), { code: 'REPORT_EXPIRED', status: 410 })`. Fronteira: `tests/integration/project-detail.test.ts:46–50` assertou diff `+depois`, CSV 200 antes de PATCH real da root e, para `['csv', 'pdf']`, `assert.equal(download.status, 410); assert.equal((await download.json()).error, 'REPORT_EXPIRED')`. Retenção real: `tests/integration/recovery.test.ts:50` — `assert.throws(() => savedReport(f.ctx, snapshot), { code: 'REPORT_EXPIRED' })`. Flags/conteúdo em `full-report.test.ts:19–21,27,32`; UTF-8/frozen snapshot carregados da rodada 1 e provas reexecutadas. | **PASS — F2 fechado** |
| F3 — A:C10 | Integração `histórico CLI: exportação, importação e erro acionável` | `tests/integration/history-cli.test.ts:40–43` — `assert.equal(child.kill('SIGINT'), true); assert.equal(await exited, 130)`; `assert.deepEqual(cancelled.warnings, ['HISTORY_CANCELLED'])`; contagem `4 + cancelled.imported`. Retomada `:44–47` — `assert.equal(resumed.status, 0, resumed.stderr)`; `assert.equal(result.imported + cancelled.imported, 1000)`; banco `1004`; replay zero. **A primeira execução falhou justamente na assertion de :44, actual 130/expected 0**, antes de chegar às assertions finais. Isolado e segunda suite completa passaram sem mudanças. Assertions antes ausentes agora existem, mas a prova é intermitente neste ambiente. | **FAIL — F3 continua aberto por execução intermitente** |
| F4 — D:C1 | E2E `projeto completo: resumo e navegação sessão → arquivo → commit → PR`, desktop/mobile | `tests/e2e/project-history.spec.ts:98–101` — `await expect(page.getByRole('button', { name: 'Abrir sessão other-session', exact: true })).toHaveCount(0)`; revisão alheia ausente; `expect(await page.locator('.work-summary').innerText()).not.toContain('OtherOnlyTool')`; `expect(await page.locator('main').innerText()).not.toContain('OTHER_ONLY')` cobre marcadores de commit/PR. `:116–122` remoto presente/local ausente, resumo remoto e revisões/commits/PRs vazios; `:124–131` fonte local, `:134–138` ferramenta Codex, `:142–146` período futuro assertam os blocos esperados. Diagnóstico presente `:97`, navegação/diff/PR `:103–109`. | **PASS — F4 fechado** |
| F5 — D:C9 | Integração `backup e restore: snapshot consistente e falhas seguras` | `tests/integration/recovery.test.ts:68–74` usa processo filho Node com `mock.module` do `serviceStatus`, `running: true`; `:72` — `await assert.rejects(restoreData({ backup: process.argv[1], dataDir: process.argv[2] }), { code: 'SERVICE_MUST_STOP', status: 409 })`; `:74` — `assert.equal(existsSync(activeTarget), false)` e backup ainda presente. Nenhum serviço real iniciado. Conservação/replay/IO em `:78–96`, incluindo `assert.deepEqual(deriveTime(restored, f.filter), original)`, eventos 2 e recusas por ocupação/integridade. | **PASS — F5 fechado** |
| F6 — A:C5 | E2E `fontes: cadastro, pausa e filtro por perfil`, desktop/mobile | `tests/e2e/sources.spec.ts:28–34` — `await expect(row.getByText('conta-e2e · Local', { exact: true })).toBeVisible()`; `await expect(row.getByText('Contrato suportado', { exact: true })).toBeVisible()`; pausa e habilitação com focus + Enter. `:44–48` fonte concorrente visível antes, depois `await expect(page.getByRole('button', { name: 'Abrir sessão other-profile-session', exact: true })).toHaveCount(0)` e fonte escolhida visível; path privado ausente. | **PASS — F6 fechado** |
| F7 — A:C6 | Unitário `histórico: três fontes, período, replay/live e proveniência` | `tests/collectors/history.test.ts:38–45` acrescenta evento com sourceId/installationId externos, `assert.equal(mismatch.imported, 0); assert.deepEqual(mismatch.warnings, ['HISTORY_SOURCE_MISMATCH'])`; `assert.equal(f.allEvents().length, before)`; checkpoint `assert.equal(f.ctx.db.get<{ checkpoint: string }>('SELECT checkpoint FROM history_runs WHERE source_id = ?', source.id)!.checkpoint, checkpoint)`. As três ferramentas/replay/time/provenance permanecem assertadas em `:28–37,48–52`; raiz negada em `:98`. | **PASS — F7 fechado** |
| F8 — A:C7 | Unitário `histórico: truncamento, formato, timestamp e retomada` | `tests/collectors/history.test.ts:70` — `assert.equal(JSON.stringify(badTime).includes('PRIVATE_TRANSCRIPT'), false)`; schema 0 em `:73–74`, `assert.deepEqual(old.warnings, ['HISTORY_FORMAT_UNSUPPORTED'])`; substituição com IDs antigos + novo em `:75–78`, `assert.equal(f.allEvents().length, 3)` e `assert.equal((await importHistory(f.ctx, f.source.id, range)).imported, 0)`. Truncamento/append continuam em `:63–65`. | **PASS — F8 fechado** |
| F9 — A:C11 | Smoke histórico real autorizado, comando acima | `scripts/smoke-history.ts:50–58` — `assert.equal(imported, expected.size)`; `assert.deepEqual(new Set(actual.map((e) => e.event_id)), expected)`; `assert.equal(replay.imported, 0)`; zero eventos humanos/foco/file.change e nova `assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM file_revisions')!.n, 0)`. Resultado real 46/46, replay 0, fileRevisions 0. | **PASS — F9 fechado** |
| F10 — B:C1 | Unitário `GitHub: páginas, estados e enriquecimento sem falsa aprovação` | `tests/providers/github.test.ts:36–38` — `assert.equal(draft.createdAt, '2026-11-05T08:00:00.000Z')`; updated/closed/merged com valores literais, incluindo `assert.equal(denied.mergedAt, '2026-11-05T09:30:00.000Z')` e PR fechado com mergedAt null. `:42–45` FUTURE_UNKNOWN: `assert.equal(unknown.reviews.state, 'unavailable'); assert.deepEqual(unknown.reviews.items, [])`; checks idem. GET/privacy `:39–40` preservados. Mudança de provider relida em `src/providers/github.ts:32,87–100,121–127`. | **PASS — F10 fechado** |
| F11 — B:C5 | Unitário `resumo: determinismo, filtros e persistência` | `tests/core/summaries.test.ts:41–48` — `assert.deepEqual(one, two)`; `assert.deepEqual(one.evidenceIds, [included.eventId])`; `assert.equal(one.text.includes('OtherProjectTool'), false); assert.equal(one.evidenceIds.includes(otherEvent.eventId), false)`; snapshot `assert.equal(saved.text.includes('OtherProjectTool'), false); assert.equal(saved.evidence_ids.includes(otherEvent.eventId), false)`. Filtros de período/fonte e ruleVersion mantidos. | **PASS — F11 fechado** |
| F12 — D:C2 | Integração `projeto: evidências e PR por SHA respeitam escopo` | `tests/integration/project-detail.test.ts:21–22` — `assert.deepEqual(unavailable.pullRequests.map((p: { number: number }) => p.number), [1])`; `assert.equal(unavailable.pullRequests[0].stale, true)`; `assert.equal(unavailable.pullRequests[0].checks.state, 'unavailable')`; `assert.equal(unavailable.pullRequests[0].reviews.state, 'unavailable')`. Vínculo inicial/401/root404 em `:13–16,27`; GET externo permanece fixo no provider. | **PASS — F12 fechado** |
| F13 — D:C5 | Unitário `notas: versões, classificação e relatório congelado`; integração HTTP adicional | `tests/core/adjustments.test.ts:63–64` — `assert.throws(() => saveNote(f.ctx, randomUUID(), 'Target inexistente', { revision: 0 }), { code: 'NOTE_TARGET_UNAVAILABLE', status: 404 })`; `assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM note_versions')!.n, 2)`. Fronteira `tests/integration/project-detail.test.ts:43` — `assert.equal(note.status, 404); assert.equal((await note.json()).error, 'NOTE_TARGET_UNAVAILABLE')`. Versões/frozen report em `adjustments.test.ts:56–62`, exclusão de outro projeto em full-flow reexecutado. | **PASS — F13 fechado** |
| F14 — D:C8 | Integração `retenção: corte, deduplicação e eventos preservados` | `tests/integration/recovery.test.ts:42–45` — `assert.equal(result.cutoff, '2026-10-08T12:00:00.000Z')`; `assert.equal((await revisionDetail(f.ctx, ids[0]!)).content, null)`; `assert.equal((await revisionDetail(f.ctx, ids[1]!)).content, 'versão 1\n')`; cursor semeado 7 preservado com `assert.equal(f.ctx.db.get<{ seq: number }>('SELECT seq FROM sync_cursors WHERE installation_id = ?', f.ctx.config.installationId)!.seq, 7)`. Demais invariantes em `:46–50`. | **PASS — F14 fechado** |
| F15 — D:C10 | Integrações `configurações: persistência, política e orçamento` e `configurações: efeito do idle com probe controlado`; unitário `SSH: backlog >500, perda após commit, reconexão, instalação nova e JSON truncado` | `tests/integration/recovery.test.ts:107` — `assert.throws(() => configure(f.ctx, { revision: cfg.revision, idleMs: 0 }), { code: 'INVALID_CONFIGURATION' })`; `:113–123` captura `REVISION_POLICY_DENIED`, leitura `REVISION_NOT_FOUND/status404`, export `assert.equal(queryReport(f.ctx, selection, defaultReportOptions).revisions.length, 0)` após exclusão e após pausa. Reopen `:135`: idle 60000, retention60, sync30000, budget1048576, excludedPaths `['private']`. Probe compilado `:157–162` — abaixo de 60000 zero idle, em 60000 `assert.equal(events.length, 1); assert.equal(JSON.parse(events[0].document).payload.reason, 'idle')`. `tests/remote/sync.test.ts:32,38–40`: sync30000 e `assert.ok(scheduled >= beforeSync + 30000); assert.ok(scheduled <= Date.now() + 30000)`. Orçamento/metadados em recovery `:133`. | **PASS — F15 fechado** |
| F16 — R:C6 | E2E `projeto: paginação, lacunas e recuperação de erro nas evidências`, desktop/mobile | `tests/e2e/project-history.spec.ts:238–242` — alerta de stale, `await expect(page.locator('.work-summary')).toContainText('complete-session')`; PR21 preservado; novo fato ainda ausente. `:244–249` espera resposta HTTP200 e depois `await expect(page.locator('.work-summary')).toContainText('RecoveredEvidence')` e `complete-session`; alerta zero. | **PASS — F16 fechado** |

## Rodada 2 — PASS anteriores carregados e citações refrescadas

Cada linha abaixo tem **origem de julgamento na rodada 1 — working tree sobre 231e046**, não em commit inexistente. Os testes foram reexecutados nesta rodada. Onde o arquivo foi tocado, a citação foi conferida/atualizada; R:C1/R:C2 também foram revalidados junto às correções nas mesmas superfícies. Esses 17 PASS não dependem da prova CLI intermitente.

| Check | Prova nominal reexecutada | Evidência / origem | Estado |
|---|---|---|---|
| A:C1 | `fontes: cadastro, isolamento de contas e filtros consistentes` | Carry rodada 1, `tests/integration/sources.test.ts:35–43`: sessões 2 com IDs distintos, sourceId selecionada e agentAccumulatedMs 60000. | **PASS — carried** |
| A:C2 | `fontes: diagnóstico sem credenciais ou falsa conexão` | Carry rodada 1, `tests/integration/sources.test.ts:57–62`: unsupported, configPath/credencial ausentes, availability missing, no-data. | **PASS — carried** |
| A:C3 | `fontes: pausa persistente, retomada e concorrência` | Carry rodada 1, `tests/integration/sources.test.ts:74–80`: pausa false persistente, queue0, status409 e manifesto true na retomada. | **PASS — carried** |
| A:C4 | `fontes: remoção seletiva preserva histórico` | Carry rodada 1, `tests/integration/sources.test.ts:95–106`: hook alheio, histórico e status409 preservados. | **PASS — carried** |
| A:C8 | `histórico: cancelamento e escopo autorizado` | Carry rodada 1, citação atual `tests/collectors/history.test.ts:90–98`: `assert.equal(next.imported, 24)`, `assert.equal(await readFile(path, 'utf8'), bytes)`, `HISTORY_SOURCE_UNAVAILABLE` e `HISTORY_ROOT_UNAUTHORIZED`. | **PASS — carried, citation refreshed** |
| A:C9 | `histórico: OpenCode legado somente leitura e compatibilidade` | Carry rodada 1, citação atual `tests/collectors/history.test.ts:116–123`: import2/total3/replay0, `assert.deepEqual(await readFile(path), before)`, PRIVATE_MESSAGE ausente, versão incompatível e unavailable explícitos. | **PASS — carried, citation refreshed** |
| B:C2 | `GitHub: cache 304, falhas e rate limit respeitado` | Carry rodada 1, provider alterado relido; citação atual `tests/providers/github.test.ts:63–71`: `assert.equal(conditional, true)`, stale/cache1, `assert.equal(calls, before)` e retry >=900000; GET em `:39`. | **PASS — carried, citation refreshed** |
| B:C3 | `PRs: API autenticada, escopo e snapshots persistidos` | Carry rodada 1, `tests/integration/pull-requests.test.ts:18,22–28`: 401, filtro vazio, repo inválido400, stale/erro seguro e snapshot1. | **PASS — carried** |
| B:C4 | `resumo: fatos, falhas e lacunas com evidências` | Carry rodada 1, citação atual `tests/core/summaries.test.ts:22–27`: `assert.match(summary.text, /não comprova teste aprovado/)`, PR aberto, falha, história incompleta e `assert.match(line, /\[evidência: [a-f0-9-]{36}\]/)`. | **PASS — carried, citation refreshed** |
| D:C3 | `ajustes: atribuição global, cortes e reconciliação` | Carry rodada 1, citação atual `tests/core/adjustments.test.ts:18–26`: `assert.equal(totals.humanAdjustedMs, 120001)`, estimated/unassigned0, reatribuição e cortes somam120001. | **PASS — carried, citation refreshed** |
| D:C7 | `nota e ajuste auditável no relatório`, desktop/mobile | Carry rodada 1, `tests/e2e/adjustments.spec.ts:19–32`: teclado, prévia2min, CSV120000/PDF120000ms, nota e compensação. | **PASS — carried** |
| R:C1 | `projeto completo: resumo e navegação sessão → arquivo → commit → PR`, desktop/mobile | Revalidado nesta rodada; `tests/e2e/project-history.spec.ts:103–109`: diff `+depois`, PR1 e checks ausentes; inferência em prova suplementar `sessão → revisão → diff → commit, associação explícita e renome observado`, `:47,52`. | **PASS — revalidated** |
| R:C2 | `projeto: evidências e PR por SHA respeitam escopo` | Revalidado nesta rodada; `tests/integration/project-detail.test.ts:13–15,27`: 401, PRs `[1]`, root pausada404. | **PASS — revalidated** |
| R:C3 | `filtros: seleção múltipla e contexto do projeto permanecem coerentes`, desktop/mobile | Carry rodada 1, citação atual `tests/e2e/project-history.spec.ts:164–177`: seleção múltipla, heading detalhe0, clienteB mostra segundo e primeiro0. | **PASS — carried, citation refreshed** |
| R:C4 | `filtros: origem e atividades sem projeto com retorno ao histórico`, desktop/mobile | Carry rodada 1, citação atual `tests/e2e/project-history.spec.ts:189–206`: máquina/fonte/ferramenta, unassigned-only, eventos e retorno ao atribuído. | **PASS — carried, citation refreshed** |
| R:C5 | `projeto: paginação, lacunas e recuperação de erro nas evidências`, desktop/mobile | Carry rodada 1, citação atual `tests/e2e/project-history.spec.ts:224–235`: avisos offline/lag/gap/stale, PR20→21, Enter e foco após Escape. | **PASS — carried, citation refreshed** |
| R:C7 | `fluxo completo controlado: seleção → evidências → ajuste → PDF/CSV → backup/restore`, desktop/mobile | Carry rodada 1, `tests/e2e/full-flow.spec.ts:32,35,40–42`: seleção correta, nota/PR/diff, literal30000ms e `expect(deriveTime(restored, filter)).toEqual(before)`. | **PASS — carried** |

**Reconciliação atual:** A **10 PASS / 1 FAIL**; B **5/0**; D **10/0**; R **7/0** = **32 PASS + 1 FAIL = 33**. Os 16 FAIL anteriores resultam em 15 fechados + F3 intermitente; S1 é adicional e não altera o denominador.

## Rodada 2 — S1 e Swept afetados

**S1 fechado — PASS.** A garantia antes ausente foi conferida no código atual:

- `src/web/Workspace.tsx:45,74–79,113`: abort no cleanup por query/desmontagem, ao trocar sessão, fechar e Escape; `api` recebe signal; `if (!controller.signal.aborted) setDetail(value)`.
- `src/web/pages/ProjectDetail.tsx:17–18,33–40,60`: abort no unmount/fechamento/Escape/troca para PR; consulta de commit usa signal e não aplica resposta abortada.
- Prova **`detalhes: fechar leitura atrasada preserva a evidência aberta depois`** passou nas duas plataformas. `tests/e2e/project-history.spec.ts:280–282` libera resposta da primeira sessão após abrir a segunda e mantém `await expect(session.getByText('remote-session', { exact: true })).toBeVisible()` com primeira ausente. `:293–295` libera commit atrasado após abrir PR e mantém `await expect(page.getByRole('heading', { name: 'PR #2 · Revisão 2', exact: true })).toBeVisible()` e dialog de commit0.

Swept de GET/cache/enums relido no provider atual (`src/providers/github.ts:12–24,32,87–100,121–144`): request GET, auth via gh existente, normalização allowlist e recurso unknown indisponível, sem falsa aprovação. Swept de auth/immutability/roots/retention/backup não alterados carregam a releitura da rodada 1; as novas provas reais de revogação, guard de serviço mockado e idle/sync estão na tabela F2/F5/F15. Paginação/polling segue `Workspace.tsx:44–48` e `ProjectDetail.tsx:25–31`. Nenhuma nova obrigação estética ou de arquitetura foi acrescentada.

## Único finding remanescente — ranked

1. **P1 — F3 / A:C10: prova de retomada da CLI intermitente por orçamento de execução.** Na primeira suite batched, `tests/integration/history-cli.test.ts:44:76` falhou: `assert.equal(resumed.status, 0, resumed.stderr)`, **actual130/expected0**. O helper `:12` impõe `timeout: 10000` para cada comando síncrono. A falha é compatível com esse timeout: a CLI trata SIGINT **e SIGTERM** como cancelamento e sai130 (`src/cli/index.ts:99–104`). Contudo, o `spawnSync.error` não foi registrado pelo teste nessa falha; **não afirmo ETIMEDOUT como causa definitivamente capturada**. O ensaio isolado e a segunda suite completa passaram sem alterações, demonstrando intermitência, não correção entre tentativas.

   **Mínimo para fechar:** tornar o orçamento/harness da retomada de 1000 registros suficiente para a execução batched e evidenciar a conclusão com exit0, `complete:true`, importados acumulados1000, banco1004 e replay0; manter a fase SIGINT explícita exigindo exit130/HISTORY_CANCELLED e os checks sem redução. Registrar `spawnSync.error/status/signal` caso haja nova falha permite distinguir prazo do harness de erro de importação. Reexecutar a prova e o target de integração; uma tentativa verde posterior não deve ocultar a vermelha desta rodada. Não há evidência aqui de perda de dados, nem requisito novo de que a importação tenha SLA de10s.

As antigas lacunas estruturais de F3 foram sanadas (sinal real, confirmação, retomada e contagens agora são assertados); o bloqueio atual é a execução vermelha observada dessa prova. Sem correção pelo verifier.

## Limites e conclusão da rodada 2

T12 real/confiança pessoal, PR real, parsers históricos nativos adicionais e piloto de um dia/T24 continuam pendentes. O smoke real delimitado passou integralmente no escopo A:C11, incluindo zero revisões; não substitui aqueles aceites.

**Conclusão:** 32/33, S1 fechado e 15 dos 16 findings anteriores encerrados. Typecheck/build,46 unitários,28 E2E e smoke passaram. Integração registrou **24/25 na primeira execução e25/25 no retry completo**. Veredito permanece FAIL exclusivamente por F3/A:C10 intermitente, com todo o histórico de execução preservado.

---

## Histórico preservado — rodada 1, superado pela rodada 2 acima

As seções abaixo são o relatório original, incluindo citações/linhas/contagens da working tree anterior. Não representam o veredito atual e não atribuem SHA às alterações não commitadas.

# Continuação — verificação independente (rodada 1 histórica)

**Verdict: FAIL — 17/33 checks integralmente provados; 16 com lacunas de prova.**

- **Profile:** light. Sem fault injection, sem recomputação obrigatória de Coverage join e sem vereditos de Test policy. A enumeração visual/comparação de composição do profile ui não foi executada. Os controles e estados citados nos checks foram conferidos nas provas existentes.
- **Data:** 08/11/2026. **Round:** 1 — full, todos os quatro checklists.
- **Verifier:** agente independente nesta nova sessão, sem autoria da implementação; nenhuma delegação.
- **Range:** `231e046be73f25c4ecc55aa0790cf796a9590312` → **working tree**, incluindo untracked. HEAD continua nessa base. Não existe um diff HEAD que isole esta sessão: quase todo `src/`, `tests/`, `scripts/` e os checklists já estavam untracked. Os cinco módulos informados como alterados na retomada foram inspecionados; sua atribuição à sessão é a informação do handoff, não algo demonstrável pelo Git.
- **Escrita do verifier:** apenas este relatório. Nenhuma edição de código/testes/specs/checklists, instalação, commit ou alteração de confiança/configuração pessoal. Build/testes produziram seus artefatos normais ignorados; servidores dos testes usaram dados temporários/portas efêmeras. Não executei smoke:github/smoke:codex nem chamadas a modelos/provedores externos.

## Fontes e método

Lidos integralmente: `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md`, os quatro checklists, `TASKS.md`, `docs/ESPECIFICACAO.md` e `docs/ARQUITETURA.md`. As notas de retomada no topo dos checklists prevalecem sobre os adiamentos históricos. Não usei os adiamentos para excluir T20 ou full-flow.

Nenhum `AGENTS.md` encontrado no projeto; os dois diretórios ancestrais imediatos consultados também não tinham esse arquivo. Profile light confirmado pelo pedido e pelos checklists. `PRODUCT.md`/mockup não foram objeto de auditoria visual vinculante nesta rodada light.

`rg -n -A ...` foi tentado em três lotes de arquivos, mas o executável não existe neste ambiente (`command not found: rg`, exit 127). Usei a ferramenta de busca de conteúdo e leitura numerada dos arquivos como fallback. Os paths/linhas abaixo são os do TypeScript fonte lido, não as posições transformadas exibidas pelo reporter Playwright.

Critério: PASS exige evidência do valor/efeito declarado; FAIL de um check pode ser somente **lacuna de prova**, sem afirmar defeito observado em produção. Assertions de igualdade contra o estado anterior capturado no próprio teste são apropriadas para conservação/replay; contagens genéricas ou ausência de alerta não substituem assertions sobre conteúdo, fronteira HTTP ou estado concreto exigidos pelo check. Provas suplementares executadas estão identificadas, sem substituir a prova nomeada pelo simples resultado da suite.

## Gates executados pelo verifier

Runtime: `node v24.19.0`. Uma invocação por target, após build compilado:

| Comando | Resultado observado |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; TypeScript servidor + Vite, 45 módulos |
| `npm run test:unit` | exit 0; **46 passed, 0 failed, 0 cancelled, 0 skipped** |
| `npm run test:integration` | exit 0; **23 passed, 0 failed, 0 cancelled, 0 skipped** |
| `npm run test:e2e` | exit 0; **26 passed**, 13 cenários em desktop + mobile; nenhum skip |
| smoke histórico real, comando abaixo | exit 0; 46/46 IDs, replay 0 |

Todos os nomes de testes citados nas tabelas seguintes apareceram individualmente como executados e aprovados no output da respectiva invocação. `git diff --check` também saiu 0, mas só cobre os arquivos tracked; não é prova dos untracked.

### Smoke histórico real — execução autorizada

Li `scripts/smoke-history.ts` antes da execução e confirmei o uso do leitor `openReadonlyDatabase` (`src/core/sqlite.ts:7–16`, `readOnly: true` e `PRAGMA query_only = ON`). O script cria/remove seu próprio store temporário (`scripts/smoke-history.ts:21,60`). O comando executado foi:

```sh
npm run smoke:history -- --database "/Users/lucasruon/.local/share/opencode/opencode.db" --root "/Users/lucasruon/Downloads/Sistemas/Worklog" --from "2026-11-06T13:55:00.000Z" --to "2026-11-06T14:05:00.000Z"
```

Resultado: `nativeRecordsScanned: 1706`, `expectedNormalizedIds: 46`, `imported: 46`, `replayInserted: 0`, `summaryRuleVersion: evidence-summary-v1`, `summaryEvidenceIds: 46`, `humanOrFileEvents: 0`, `storage: temporary-isolated-store`. Amostra: 564926 → 4628606 bytes; database 487424 bytes; orçamento 1073741824 bytes; 5164 ms. Não representa crescimento diário.

O campo impresso `verification: independent-verifier-deferred-by-user` é texto histórico fixo em `scripts/smoke-history.ts:59`, não o estado desta rodada. O smoke executou de fato nesta verificação. Há uma lacuna específica sobre a tabela de revisões em A:C11 abaixo; não declaro o aceite integral desse check nem o piloto de um dia a partir deste comando.

## Checks — namespaces

**A** = `.checks/t14-t15.md`; **B** = `.checks/t18-t19.md`; **D** = `.checks/t20-t23.md`; **R** = `.checks/t20-retomada.md`. Assim, C1 de arquivos diferentes nunca é contado como um único check.

### A — fontes/histórico: 6/11 provados

Todos os testes desta tabela passaram; o resultado da última coluna avalia a suficiência da prova.

| Check | Prova nomeada executada | Evidência localizada e assertion pertinente | Resultado |
|---|---|---|---|
| A:C1 | integração `fontes: cadastro, isolamento de contas e filtros consistentes` | `tests/integration/sources.test.ts:29` — `assert.equal(response.status, 201)`; `:35–36` — `assert.equal(all.items.length, 2); assert.notEqual(all.items[0].id, all.items[1].id)`; `:39–43` — `assert.equal(sessions.items[0].sourceId, ids[0])`, `assert.ok(activity.items.every((item: { sourceId: string }) => item.sourceId === ids[0]))`, `assert.equal(summary.summary.agentAccumulatedMs, 60_000)`. Dois perfis/paths e mesmo ID nativo declarados em `:27–32`. | **PASS** |
| A:C2 | integração `fontes: diagnóstico sem credenciais ou falsa conexão` | `tests/integration/sources.test.ts:57–62` — `assert.equal(unsupported.compatibility, 'unsupported')`; `assert.equal(unsupported.lastActivity, null)`; `assert.equal(JSON.stringify(response).includes('configPath'), false)`; `assert.equal(JSON.stringify(response).includes('PRIVATE_CREDENTIAL'), false)`; `assert.equal(response.items.find((item: { id: string }) => item.id === id).availability, 'missing')`; `assert.equal(response.items.find((item: { id: string }) => item.id === f.source.id).state, 'no-data')`. | **PASS** |
| A:C3 | integração `fontes: pausa persistente, retomada e concorrência` | `tests/integration/sources.test.ts:74–80` — `assert.equal(listSources(f.ctx).find((s) => s.id === f.source.id)?.enabled, false)` depois do replay de cadastro; `assert.equal(queueClaude(...), 0)`; `assert.equal((await f.call(..., 'PATCH', { enabled: true, revision: 0 })).status, 409)`; `assert.equal(manifest.sources.find((s: { id: string }) => s.id === f.source.id).enabled, true)`; sessões preservadas com `assert.equal(...items.length, 1)`. | **PASS** |
| A:C4 | integração `fontes: remoção seletiva preserva histórico` | `tests/integration/sources.test.ts:95` — comparação da configuração com `{ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-other-hook' }] }] } }`; `:96` — `assert.equal(f.ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n, count)`; `:98–106` — `assert.equal(removed.state, 'removed')`, retomada simples e remoção remota com `.status, 409`. | **PASS** |
| A:C5 | E2E `fontes: cadastro, pausa e filtro por perfil` — desktop/mobile | `tests/e2e/sources.spec.ts:25–30` — `await expect(row.getByText('Configuração ausente · histórico preservado')).toBeVisible()`; `await expect(row.getByText('Pausada', { exact: true })).toBeVisible()`; `:39–40` — `await expect(page.getByRole('button', { name: 'Abrir sessão profile-session' })).toBeVisible()` e `expect(await page.locator('body').innerText()).not.toContain(join(directory, 'settings.json'))`. Só pausar usa Enter (`:27`); habilitar usa click (`:29`). Origem e compatibilidade não têm assertion neste teste. | **FAIL — F6** |
| A:C6 | unitário `histórico: três fontes, período, replay/live e proveniência` | `tests/collectors/history.test.ts:36–44` — `assert.equal(result.imported, 2)`; `assert.equal(result.skipped, 3)`; `assert.equal((await importHistory(...)).imported, 0)`; `assert.ok(sessions.every((s) => s.provenance === 'mixed'))`; `assert.equal(deriveTime(f.ctx, f.filter).humanEstimatedMs, 0)`; `assert.equal(f.allEvents().some((e) => e.type === 'human.interaction'), false)`. Raiz negada tem prova adicional em A:C8 (`:85`); falta registro com identidade de outra fonte no archive. | **FAIL — F7** |
| A:C7 | unitário `histórico: truncamento, formato, timestamp e retomada` | `tests/collectors/history.test.ts:55–57` — `assert.equal(truncated.imported, 1)`, `assert.ok(truncated.warnings.includes('HISTORY_TRUNCATED'))`, `assert.equal(resumed.imported, 1)`; `:61–66` — warnings `HISTORY_RECORD_INVALID`/`HISTORY_FORMAT_UNSUPPORTED`, nova importação `assert.equal(...imported, 1)` e ausência de `PRIVATE_TRANSCRIPT` somente nos eventos. Faltam replay após substituição, schema antigo e privacidade do diagnóstico. | **FAIL — F8** |
| A:C8 | unitário `histórico: cancelamento e escopo autorizado` | `tests/collectors/history.test.ts:77–85` — `assert.equal(first.imported, 1)`; `assert.ok(first.warnings.includes('HISTORY_CANCELLED'))`; `assert.equal(next.imported, 24); assert.equal(next.complete, true)`; `assert.equal(await readFile(path, 'utf8'), bytes)`; `await assert.rejects(importHistory(...), { code: 'HISTORY_SOURCE_UNAVAILABLE' })`; `assert.equal(denied.imported, 0); assert.ok(denied.warnings.includes('HISTORY_ROOT_UNAUTHORIZED'))`. | **PASS** |
| A:C9 | unitário `histórico: OpenCode legado somente leitura e compatibilidade` | `tests/collectors/history.test.ts:103–110` — `assert.equal(result.imported, 2); assert.equal(f.allEvents().length, 3)` após fila live; replay `assert.equal(...imported, 0)`; `assert.equal(JSON.stringify(f.allEvents()).includes('PRIVATE_MESSAGE'), false); assert.deepEqual(await readFile(path), before)`; `assert.ok(unsupported.warnings.includes('HISTORY_VERSION_UNSUPPORTED'))`; `assert.equal(missing.imported, 0); assert.ok(missing.warnings.includes('HISTORY_UNAVAILABLE'))`. | **PASS** |
| A:C10 | integração `histórico CLI: exportação, importação e erro acionável` | `tests/integration/history-cli.test.ts:18,22–28` — `assert.equal(JSON.parse(exported.stdout).exported, 3)`; `assert.equal(JSON.parse(imported.stdout).imported, 1)`; `assert.equal(JSON.parse(run('import', ...period).stdout).imported, 0)`; contagem de eventos `4`; `assert.equal(bad.status, 1); assert.ok(JSON.parse(bad.stdout).warnings.includes('HISTORY_FORMAT_UNSUPPORTED'))`; `assert.equal(...includes('PRIVATE_TRANSCRIPT'), false)`. Não há cancelamento do processo CLI nem lote interrompido/retomado pela CLI. | **FAIL — F3** |
| A:C11 | smoke histórico real, exit 0 | `scripts/smoke-history.ts:43,50–57` — `assert.ok(expected.size > 0, ...)`; `assert.equal(imported, expected.size)`; `assert.deepEqual(new Set(actual.map((e) => e.event_id)), expected)`; `assert.equal(replay.imported, 0)`; `assert.ok(summary.evidenceIds.every((id) => expected.has(id)))`; `assert.equal(ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM events WHERE type IN ('human.interaction','focus.change','file.change')")!.n, 0)`. Resultado real 46/46, mas essa última consulta não assertou `file_revisions`. | **FAIL — F9** |

### B — GitHub/resumos: 3/5 provados

| Check | Prova nomeada executada | Evidência localizada e assertion pertinente | Resultado |
|---|---|---|---|
| B:C1 | unitário `GitHub: páginas, estados e enriquecimento sem falsa aprovação` | `tests/providers/github.test.ts:31–34` — `assert.deepEqual(rows.map((p) => [p.number, p.state]).sort(...), [[1, 'open'], [2, 'merged'], [3, 'closed']])`; `assert.equal(draft.draft, true)`; autor/branches literais em `:32`; `assert.deepEqual(draft.commits, ['a'.repeat(40)])`; `assert.equal(denied.reviews.state, 'unavailable'); assert.equal(denied.checks.state, 'unavailable')`. Vínculo negativo complementado por D:C2/R:C2. Datas existem na resposta preparada, mas não são assertadas; estados desconhecidos não são exercitados. | **FAIL — F10** |
| B:C2 | unitário `GitHub: cache 304, falhas e rate limit respeitado` | `tests/providers/github.test.ts:56,60–64` — `assert.equal(cached.updated, 0); assert.equal(conditional, true)`; `assert.equal(listPullRequests(f.ctx, f.filter, clock).length, 1)` e `.stale, true`; `assert.equal(JSON.stringify(state).includes('PRIVATE_TOKEN'), false)`; `assert.equal(calls, before)` inclusive force; `assert.ok(state.nextSyncAt >= clock + 900000)`. Laço `:58` executa 401/403/offline/429. GET em `:36`: `assert.ok(methods.length > 4 && methods.every((method) => method === 'GET'))` na outra prova unitária também executada. | **PASS** |
| B:C3 | integração `PRs: API autenticada, escopo e snapshots persistidos` | `tests/integration/pull-requests.test.ts:18,22–28` — GET sem auth `.status, 401`; seleção excluída `.items.length, 0`; repo desconhecido `assert.equal(unknown.status, 400)`; `assert.equal(delayed.stale, true); assert.equal(delayed.sync.error, 'GITHUB_FORBIDDEN')`; histórico `assert.equal(...count(*) AS n FROM pull_requests...n, 1)`. | **PASS** |
| B:C4 | unitário `resumo: fatos, falhas e lacunas com evidências` | `tests/core/summaries.test.ts:19–24` — `assert.match(summary.text, /conteúdo dos pedidos não é armazenado/i)`; `assert.match(summary.text, /PR #1: aberto/)`; `assert.match(summary.text, /unit-test: completed \/ failure/)`; `assert.match(summary.text, /não comprova teste aprovado/)`; `assert.equal(summary.text.includes('testes aprovados'), false)`; `assert.match(summary.text, /histórico incompleto/i)`; por linha Fato, `assert.match(line, /\[evidência: [a-f0-9-]{36}\]/)`, além dos IDs de falha/interrupção. A prova suplementar `resumo: mensagem multilinha é citação, não alegação gerada` também passou (`:54–55`, `assert.equal(claims.length, 1)`, `assert.deepEqual(summary.evidenceIds, [id])`). | **PASS** |
| B:C5 | unitário `resumo: determinismo, filtros e persistência` | `tests/core/summaries.test.ts:34–39` — `assert.deepEqual(one, two)`; `assert.equal(one.ruleVersion, 'evidence-summary-v1')`; `assert.deepEqual(one.evidenceIds, [included.eventId])`; `assert.equal(one.text.includes('OutsidePeriodTool'), false)`; fonte excluída com evidências zero; `assert.deepEqual(JSON.parse(saved.evidence_ids), [included.eventId])`. Nenhum segundo projeto excluído neste teste. | **FAIL — F11** |

### D — T20–T23: 2/10 provados

| Check | Prova nomeada executada | Evidência localizada e assertion pertinente | Resultado |
|---|---|---|---|
| D:C1 | E2E `projeto completo: resumo e navegação sessão → arquivo → commit → PR` — desktop/mobile | `tests/e2e/project-history.spec.ts:84–94` — `await expect(page.getByRole('heading', { name: 'Resumo com evidências', exact: true })).toBeVisible()`; diff `toContainText('+depois')`; PR heading `toBeVisible()`; `:101–102` — vazio de sessões/PRs após Codex. As provas R:C3/R:C4 acrescentam catálogo e filtros na Atividade, mas não assertam o detalhe completo contra dados concorrentes de outro projeto/período/origem em todos os blocos. | **FAIL — F4** |
| D:C2 | integração `projeto: evidências e PR por SHA respeitam escopo` | `tests/integration/project-detail.test.ts:14–15` — `assert.deepEqual(body.pullRequests.map((p: { number: number }) => p.number), [1])`; `assert.equal(body.pullRequests[0].checks.state, 'none'); assert.equal(body.pullRequests[0].draft, true)`. R:C5 acrescenta stale na UI e B:C1 testa indisponibilidade no provider. A resposta do detalhe de commit não é assertada com checks/reviews `unavailable`; `none` não é `unavailable`. | **FAIL — F12** |
| D:C3 | unitário `ajustes: atribuição global, cortes e reconciliação` | `tests/core/adjustments.test.ts:17–25` — baseline `humanEstimatedMs, 300000`; depois `assert.equal(totals.humanEstimatedMs, 0); assert.equal(totals.humanAdjustedMs, 120001); assert.equal(totals.unassignedHumanMs, 0)`; projeto original `.humanAdjustedMs, 0`, projeto B `120001`; `assert.equal(left.humanAdjustedMs + right.humanAdjustedMs, 120001)`; `previousMs, 300000`. | **PASS** |
| D:C4 | unitário `ajustes: conflito, concorrência e desfazer imutável` | `tests/core/adjustments.test.ts:35–42` — `assert.throws(() => applyAdjustment(...), { code: 'ADJUSTMENT_OVERLAP' })` e `ADJUSTMENT_CHANGED`; após undo `humanEstimatedMs, 300000`, `humanAdjustedMs, 0`; `assert.equal(JSON.stringify(f.allEvents()), raw)`; `assert.equal(...time_adjustments...n, 2)`; DELETE rejeitado. As duas assertions de erro não assertam status 409 nem atravessam HTTP. | **FAIL — F1** |
| D:C5 | unitário `notas: versões, classificação e relatório congelado` | `tests/core/adjustments.test.ts:55–61` — `assert.equal(report.notes[0]!.classification, 'context')`; concorrência `assert.throws(..., { code: 'NOTE_CHANGED' })`; snapshot `assert.equal(savedReport(f.ctx, snapshot).notes[0]!.text, '  =FÓRMULA\nNota á')`; nova nota `assert.equal(queryReport(...).notes[0]!.text, 'Texto revisado')`; período excluído `notes.length, 0`; `note_versions...n, 2`. Exclusão de outro projeto é complementada pelo full-flow; falta recusa de target não autorizado/disponível. | **FAIL — F13** |
| D:C6 | unitário `relatório completo: seleção, notas, PRs, revisões e política` | `tests/reports/full-report.test.ts:18–20,26,29–33` — contagens `notes=1, prs=2, revisions=2`; `assert.ok(report.revisions.some((r) => r.diff?.patch?.includes('+depois')))`; fórmula `assert.ok(csv.includes("'  =SOMA(1,2)"))`; texto PDF com `assert.match(text, /Nota á/)`; `assert.throws(() => savedReport(...), { code: 'REPORT_EXPIRED' })` **após chamada direta a invalidateReports**; flags desligadas zeram seções. UTF-8/escaping/frozen CSV: `tests/reports/exports.test.ts:56–62` — BOM `[239,187,191]`, célula literal `'  =SOMA(1,2)\n"Árvore"`, `assert.deepEqual(renderCsv(savedReport(f.ctx, id)), bytes)`. Retenção real invalida em `tests/integration/recovery.test.ts:43`; prévia/downloads reais em `tests/integration/reports-git.test.ts:32–37`. Falta snapshot invalidado pela ação real de mudar política, em vez de invalidá-lo diretamente. | **FAIL — F2** |
| D:C7 | E2E `nota e ajuste auditável no relatório` — desktop/mobile | `tests/e2e/adjustments.spec.ts:19,22` usa Enter nos botões; `:25–28` — `await expect(total.getByRole('cell').nth(4)).toHaveText('2 min')`; `expect(csv).toContain('120000')`; `expect(text).toContain('120000 ms'); expect(text).toContain('Nota explícita á')`; nota persistida `toHaveValue('  =SOMA(1,2)\nNota explícita á')` em `:30`; compensação `await expect(page.getByText('Ajuste desfeito por registro compensatório.', { exact: true })).toBeVisible()` em `:32`. | **PASS** |
| D:C8 | integração `retenção: corte, deduplicação e eventos preservados` | `tests/integration/recovery.test.ts:38–43` — `assert.equal(result.deletedContents, 1)`; metadados/eventos iguais ao anterior; `assert.equal((await revisionDetail(f.ctx, ids[1]!)).diff.reason, 'retention')`; `assert.equal((await revisionDetail(f.ctx, ids[2]!)).content, 'versão 2\n')`; hashes compartilhados preservados; contents `3`. Há amostras em corte−1ms/corte/recente (`:24`), mas não assertion do conteúdo no corte e nenhum cursor semeado/comparado. | **FAIL — F14** |
| D:C9 | integração `backup e restore: snapshot consistente e falhas seguras` | `tests/integration/recovery.test.ts:59–81` — backup/restore `.status, 'ok'`; `assert.deepEqual(deriveTime(restored, f.filter), original)`; eventos `2`, conteúdo restaurado igual, fila `3`, replay receipts duplicates `2`; `await assert.rejects(restoreData(...), { code: 'RESTORE_TARGET_OCCUPIED' })`; corrupção `BACKUP_INTEGRITY_FAILED`; `BACKUP_IO_FAILED`, disco/permissão e `RESTORE_INCOMPLETE`. Não aparece o ramo `SERVICE_MUST_STOP`. | **FAIL — F5** |
| D:C10 | integração `configurações: persistência, política e orçamento` | `tests/integration/recovery.test.ts:90–105` — `assert.equal(cfg.idleMs, 60000)`; retenção `60`; `assert.throws(..., { code: 'CONFIG_CHANGED' })`; `REVISION_POLICY_DENIED` na captura; root continua false; fonte interna pausada `SOURCE_PAUSED`; orçamento mantém revisão `1` e `content, null`; reopen assertou somente `idleMs, 60000`. Não há prova completa de valores inválidos na revisão atual, persistência/efeito dos outros controles e leitura/exportação após exclusão/pausa. | **FAIL — F15** |

### R — retomada T20: 6/7 provados

| Check | Prova nomeada executada | Evidência localizada e assertion pertinente | Resultado |
|---|---|---|---|
| R:C1 | E2E `projeto completo: resumo e navegação sessão → arquivo → commit → PR` — desktop/mobile | `tests/e2e/project-history.spec.ts:88–94` percorre sessão/arquivo/commit/PR, com `await expect(revision.getByLabel('Diff da revisão')).toContainText('+depois')`, heading `PR #1 · Revisão 1` e `await expect(page.getByText('Sem checks registrados.', { exact: true })).toBeVisible()`. Inferência explicitamente assertada na prova suplementar também executada `sessão → revisão → diff → commit, associação explícita e renome observado`: `:45` — `await expect(session.getByText(/Inferência temporal/)).toBeVisible()`; `:50` — `await expect(revision.getByText('Inferência', { exact: true }).first()).toBeVisible()`. | **PASS** |
| R:C2 | integração `projeto: evidências e PR por SHA respeitam escopo` | `tests/integration/project-detail.test.ts:12–20` — `assert.equal((await fetch(...)).status, 401)`; `assert.deepEqual(body.pullRequests.map((p: { number: number }) => p.number), [1])`; root pausada e `assert.equal((await fetch(...)).status, 404)`. | **PASS** |
| R:C3 | E2E `filtros: seleção múltipla e contexto do projeto permanecem coerentes` — desktop/mobile | `tests/e2e/project-history.spec.ts:120–133` — seleção exclui segundo com `await expect(page.getByRole('button', { name: 'Abrir projeto Projeto segundo', exact: true })).toHaveCount(0)`, inclui com `toBeVisible()`; detalhe fixa checkbox primeiro e segundo não marcado; troca de seleção remove detalhe: `await expect(page.getByRole('heading', { name: 'Histórico do projeto', exact: true })).toHaveCount(0)`; busca `Cliente B` deixa segundo visível e `await expect(page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true })).toHaveCount(0)`. | **PASS** |
| R:C4 | E2E `filtros: origem e atividades sem projeto com retorno ao histórico` — desktop/mobile | `tests/e2e/project-history.spec.ts:145–152` — `await expect(page.getByRole('button', { name: 'Abrir sessão remote-session', exact: true })).toBeVisible()`, local ausente; fonte incompatível e ferramenta Codex mostram `Nenhuma sessão neste período.`; `:155–162` — `await expect(page.getByRole('button', { name: 'Abrir sessão unassigned-only', exact: true })).toBeVisible()` e `await expect(events.getByText('Sessão complete-session', { exact: true })).toHaveCount(0)`; retorno: `await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toBeVisible()` e unassigned ausente. | **PASS** |
| R:C5 | E2E `projeto: paginação, lacunas e recuperação de erro nas evidências` — desktop/mobile | `tests/e2e/project-history.spec.ts:180–191` — `toBeVisible()` para `Fonte offline; histórico preservado.`, `Sincronização atrasada.`, `/Última lacuna registrada em/`, `Snapshot desatualizado`; `expect(initialCount).toBe(20)`; `await expect(page.getByRole('button', { name: /^Abrir PR #/ })).toHaveCount(21)`; Enter abre `PR #21 · Revisão 21`; Escape devolve foco `await expect(open).toBeFocused()`. | **PASS** |
| R:C6 | mesmo E2E de R:C5 — desktop/mobile | `tests/e2e/project-history.spec.ts:192–197` — rota abortada, Atualizar, `await expect(page.getByRole('alert').filter({ hasText: 'As evidências abaixo podem estar desatualizadas.' })).toBeVisible()`; após retry `await expect(page.getByRole('alert')).toHaveCount(0)`. Não há assertion de quais dados permaneceram nem de conteúdo retornado pela consulta recuperada. | **FAIL — F16** |
| R:C7 | E2E `fluxo completo controlado: seleção → evidências → ajuste → PDF/CSV → backup/restore` — desktop/mobile | `tests/e2e/full-flow.spec.ts:32` — `expect(csv).toContain('Nota diária com evidência'); expect(csv).toContain('Revisão 1'); expect(csv).toContain('+depois'); expect(csv).toContain('30000'); expect(csv).not.toContain('OTHER_ONLY_DO_NOT_EXPORT'); expect(csv).not.toContain('Projeto fora da seleção')`; `:35` — `expect(text).toContain('30000 ms')`, nota e exclusão também no PDF; `:40–42` — códigos `BACKUP_OK`/`RESTORE_OK`, `expect(deriveTime(restored, filter)).toEqual(before)` e `note_versions...n, 2`. O número textual 30000 está assertado; não é apenas esperado inferido de preencher 0.5 minutos. | **PASS** |

**Reconciliação:** A 6 PASS + 5 FAIL; B 3 + 2; D 2 + 8; R 6 + 1 = **17 PASS + 16 FAIL = 33**. Um mesmo teste pode dar evidência suficiente para R:C2 e insuficiente para a claim mais ampla D:C2; não há promoção automática de um check ao outro.

## Findings priorizados e mínimo para fechar os checks

Todos abaixo são lacunas concretas de prova, salvo a ressalva estática de Swept mais adiante. Não houve teste vermelho nos gates executados.

1. **F1 — P1, fronteira HTTP 409 não provada — D:C4.** `tests/core/adjustments.test.ts:35–36` verifica apenas `code`. Mesmo que a implementação declare 409 (`src/core/adjustments.ts:8,22`), a prova não lê `status` nem passa pelo handler. **Mínimo:** teste de integração autenticado POST `/api/adjustments` com overlap e revisão obsoleta, assertando `response.status === 409` e os códigos correspondentes; conservar as assertions atuais de compensação/eventos.
2. **F2 — P1, revogação por política simulada no lugar da ação real — D:C6.** `tests/reports/full-report.test.ts:28–33` chama `invalidateReports` diretamente; depois de pausar root só consulta relatório novo. Isso não prova que uma prévia já emitida deixa de ser baixável por mudança real de política. **Mínimo:** salvar prévia com conteúdo, mudar política/pausar root pela operação real e assertar `REPORT_EXPIRED`/410 para aquela prévia nos downloads (sem chamada manual a invalidateReports). Retenção já tem a prova real em `tests/integration/recovery.test.ts:43`.
3. **F3 — P1, cancelamento/retomada não atravessa CLI — A:C10.** `tests/integration/history-cli.test.ts:12–28` usa somente `spawnSync` até término; o segundo import é replay completo, não retomada de lote cancelado. **Mínimo:** processo CLI com import interrompido pelo mecanismo suportado, evidência de registros confirmados, nova execução até fim e contagens acumuladas iguais ao banco; assertar diagnóstico sem transcrição. O cancelamento direto da função em `tests/collectors/history.test.ts:77` não prova a ligação do sinal da CLI.
4. **F4 — P1, isolamento do detalhe completo subamostrado — D:C1.** `tests/e2e/project-history.spec.ts:78–105` não coloca dados de outro projeto no detalhe e só varia ferramenta. R:C3 testa catálogo e R:C4 testa Atividade, não todos os blocos do detalhe. **Mínimo:** no cenário de detalhe, adicionar evidências distinguíveis fora do projeto/período e por máquina/ferramenta/fonte; assertar exclusão concreta nas sessões, resumo, revisões, commits e PRs, além da presença dos dados elegíveis e diagnósticos. Não basta conferir que o controle muda.
5. **F5 — P1, recusa de restore com serviço ativo sem prova — D:C9.** `tests/integration/recovery.test.ts:68–81` cobre destino ocupado/corrupção/IO/marcador, mas não `SERVICE_MUST_STOP`, guard em `src/core/maintenance.ts:107`. **Mínimo:** prova controlada e isolada do ramo de serviço ativo com destino novo, assertando código e ausência de sobrescrita; sem instalar/iniciar serviço pessoal. O caso de destino já existente não exercita esse ramo.
6. **F6 — P2, UI de fontes: teclado/origem/compatibilidade — A:C5.** `tests/e2e/sources.spec.ts:27–30` pausa por Enter e retoma por click; `:38–39` só mostra uma sessão da fonte escolhida. Nenhuma assertion da origem/compatibilidade. **Mínimo:** habilitar também por teclado, assertar origem e compatibilidade renderizadas e acrescentar fonte concorrente cuja sessão deva desaparecer ao filtrar. Manter desktop/mobile e privacidade já provados.
7. **F7 — P2, identidade de fonte no archive não é confrontada — A:C6.** `tests/collectors/history.test.ts:28–37` só importa registros com a mesma identidade do header/source. A rejeição `HISTORY_SOURCE_MISMATCH` em `:83` é parser Git configurado para ferramenta errada, não evento de outra fonte. **Mínimo:** archive normalizado com evento de outra source/instalação, afirmar código `HISTORY_SOURCE_MISMATCH`, zero inserções indevidas e checkpoint/contagens consistentes. `[from,to)`, replay/live e ausência de sinal humano já estão assertados.
8. **F8 — P2, substituição/schema/privacidade parcialmente provados — A:C7.** `tests/collectors/history.test.ts:63–66` só usa schema 99; após substituir arquivo não repete os IDs antigos para provar idempotência; `PRIVATE_TRANSCRIPT` só é negado no banco, não nos warnings/diagnóstico. **Mínimo:** substituição contendo IDs já importados + um novo, contagem explícita sem duplicação/replay zero; schema antigo concreto rejeitado; assertion de ausência do marcador no resultado/diagnóstico do timestamp inválido. Append após truncamento já recupera corretamente na prova atual.
9. **F9 — P2, smoke real não assertou a tabela de revisões — A:C11.** `scripts/smoke-history.ts:57` consulta `events` de tipos humano/foco/file.change, não `file_revisions`; zero file.change não é uma assertion sobre revisões baseline. **Mínimo:** acrescentar assertion de contagem zero em `file_revisions` (e resultado explícito) ao smoke e repetir o mesmo ensaio real autorizado/read-only com store temporário. **A amostra real 46/46 e replay zero foi realizada e passou nesta rodada**; somente essa parte do check fica sem prova, não há alegação de fonte ausente.
10. **F10 — P2, datas e estados desconhecidos de PR não assertados — B:C1.** `tests/providers/github.test.ts:31–35` assertam estados conhecidos, draft/autor/branches/commits e 403. As datas preparadas em `:8` nunca são lidas em assert; nenhum status desconhecido é exercitado. **Mínimo:** assertions de created/updated/closed/merged ISO normalizados nos PRs correspondentes e caso de review/check desconhecido mantendo indisponibilidade/sem aprovação, com valores explícitos na assertion. Não precisa acesso GitHub real para essa prova de contrato.
11. **F11 — P2, exclusão por projeto ausente no resumo — B:C5.** `tests/core/summaries.test.ts:28–39` cobre período e fonte; não há segundo projeto. **Mínimo:** fato de outro projeto no mesmo período/fonte e assertions de ausência de seu texto e evidenceId no resultado e snapshot da seleção. Não deduzir isolamento por projeto da prova de filtro por fonte.
12. **F12 — P2, indisponibilidade no detalhe de commit não é `none` — D:C2.** `tests/integration/project-detail.test.ts:15` só verifica `checks.state === 'none'`; revisão/check indisponível foi provado abaixo da API em `tests/providers/github.test.ts:34`, e stale aparece no projeto em R:C5, não na resposta do commit. **Mínimo:** cenário de commit com PR explicitamente ligado e snapshot stale/checks/reviews unavailable, assertando esses valores no body do detalhe e mantendo o PR de SHA alheio excluído. Leitura externa GET está evidenciada em B:C2 e no provider.
13. **F13 — P2, escopo de target de nota não provado negativamente — D:C5.** `tests/core/adjustments.test.ts:51–61` usa somente projectId válido. **Mínimo:** target UUID não disponível/autorizado e assertion da recusa `NOTE_TARGET_UNAVAILABLE`/404 sem criar versão, além de preservar versões/frozen report/filtros já existentes. O full-flow já nega a nota de outro projeto no export; não exigir repetir isso só por preferência.
14. **F14 — P2, corte exato/cursores de retenção sem assertion direta — D:C8.** `tests/integration/recovery.test.ts:24,38–43` contém amostra no corte, mas sua preservação fica indireta pela contagem de conteúdos; cursores não são semeados nem comparados. **Mínimo:** assertar `cutoff === '2026-10-08T12:00:00.000Z'`, conteúdo no instante exato preservado, anterior removido, e cursor não vazio inalterado. Metadados, eventos, latest, compartilhamento e perda explícita do diff já têm assertions.
15. **F15 — P2, configuração/política com efeitos incompletamente provados — D:C10.** `tests/integration/recovery.test.ts:91` usa revisão obsoleta, portanto só prova CAS, não valores inválidos; `:105` reabre e confere somente idle. Pausar root não é seguido de tentativa de captura/leitura/exportação nessa prova. **Mínimo:** validar entrada inválida com revisão atual e código `INVALID_CONFIGURATION`; reabrir e conferir retenção/sync/orçamento/exclusões com valores literais; provas do efeito dos novos idle/sync; após pausa e após exclusão, assertar recusa na captura e ausência na leitura/exportação. Preservação de metadados ao suspender conteúdo já passa em `:104`.
16. **F16 — P2, retry provado pela ausência do alerta, não pelo dado — R:C6.** `tests/e2e/project-history.spec.ts:194–197` só assertam alerta presente/ausente. **Mínimo:** assertar evidência identificável ainda presente após falha e, após Tentar novamente, resposta bem-sucedida e dados recuperados com identidade/valor esperado. Alertas e ausência de pageerror continuam úteis, mas não substituem essa assertion.

### Buscas de ausência realizadas

Além da leitura integral dos testes nomeados, busquei:

- `ADJUSTMENT_OVERLAP|ADJUSTMENT_CHANGED|NOTE_CHANGED|409|RESTORE.*ACTIVE|HISTORY_CANCELLED` em `tests/`: erros de ajuste/nota somente em `tests/core/adjustments.test.ts:35–36,56`; os 409 encontrados eram controles de fonte, sem prova HTTP dos ajustes.
- `SERVICE_MUST_STOP|BACKUP_INTEGRITY_FAILED|sync_cursors|file_contents|cutoff` em `tests/integration/*.ts`: sem `SERVICE_MUST_STOP`; cursor encontrado em `sources.test.ts:118`, não associado a retenção; integridade do restore em `recovery.test.ts:70`.
- `HISTORY_SOURCE_MISMATCH|HISTORY_FORMAT_UNSUPPORTED|SIGINT|SIGTERM|HISTORY_CANCELLED|schemaVersion` em testes de histórico: cancelamento só na função em `history.test.ts:77`; único mismatch em `:83`; schema desconhecido em `:63`; nenhum cancelamento da CLI.
- `saveNote|NOTE_TARGET|notes.length|NOTE_CHANGED|savedReport|REPORT_EXPIRED|invalidateReports` em `tests/*.ts` recursivamente: nenhuma assertion `NOTE_TARGET_UNAVAILABLE`; invalidação do full-report manual, retenção real em `recovery.test.ts:43`.
- `createdAt|updatedAt|closedAt|mergedAt|unknown|unavailable` em `tests/providers/*.ts`: assertion de indisponibilidade em `github.test.ts:34`, nenhuma das datas.
- `projectIds|Outside|excluded|Exclu` em `tests/core/summaries.test.ts`: período/fonte, sem exclusão por projeto.

Essas buscas dão o escopo da ausência relatada; não afirmo ausência global de implementação dos comportamentos.

## Swept — comportamento existente relido no código

Esta é a releitura das restrições citadas como existentes, não uma Coverage join nem uma revisão geral de estilo.

| Restrição existente citada | Código conferido | Resultado/limite |
|---|---|---|
| Auth/Host/Origin da API — A, B, D, R | `src/server/auth.ts:34–37,43–59`; `src/server/index.ts:66–72,87–90` | Guard local e auth aplicados antes das rotas; mutação com cookie exige Origin. |
| Validação de filtros/UUID/UTC/limites — R e demais | `src/core/filters.ts:3–17`; `src/server/routes.ts:47–70,118–143`; `src/collectors/source-config.ts:7–15,39–45` | Validações concretas e CAS presentes; isso não substitui os testes faltantes de D:C4/D:C10. |
| Cadastro repetido não remove pausa/tombstone; identidade por instalação/tool/path — A | `src/server/routes.ts:220–234`; `src/collectors/source-config.ts:14–16,26–27,39–59` | Overlay separado; reinstalação explícita limpa tombstone. |
| Remoção local explícita e seletiva; locks existentes — A | `src/cli/source-management.ts:7–23`; `src/cli/hooks.ts:24–25,48–55,69–75,91–92,106–127` | Remota recusada; pausa antes do filesystem; locks e comparação da configuração antes da escrita nos instaladores Claude/Codex. |
| Histórico read-only, retomada e proveniência; sem fabricar ausência — A/R | `src/collectors/history.ts:44–75,78–111,163–198`; `src/core/sqlite.ts:7–16`; `src/web/Workspace.tsx:98,121` | Leitura explícita; checkpoint junto ao append, warnings allowlist, cancelamento após registro completo; provenance visível. Não fecha lacunas A:C6/C7/C10/C11. |
| Falta de configuração não vira conexão; diagnóstico sem config bruta — A | `src/collectors/source-status.ts:12–25` | Presença, compatibilidade, lastActivity, lag e estados distintos; retorno explícito não inclui configPath. |
| GitHub GET, whitelist, cache/backoff e lease/promise/transação — B/D | `src/providers/github.ts:12–24,32–42,50–68,72–98,100–143,154–170` | GET fixo; repo canônico registrado; promise por contexto, lease SQL, snapshot transacional; falhas mantêm snapshot; polling só consulta enabled. `pullRequestsForCommit` exige `pr.commits.includes(hash)`. |
| Resumo sem modelo e com IDs/ruleVersion — B | `src/core/summaries.ts:9–25,27–52` | Gerador determinístico local; fact adiciona ID; requested ausente, completed não vira teste aprovado; snapshots persistidos. |
| Ledger/notas append-only e eventos imutáveis — D | `db/migrations/013_adjustments_notes.sql:11–12,22–23`; `db/migrations/001_events.sql:23–24`; `src/core/adjustments.ts:12–37,53–66` | Triggers e compensação presentes; transações síncronas em `src/core/sqlite.ts:43–50`. |
| Conteúdo sujeito a roots/política antes de captura/leitura/exportação — D/R | `src/collectors/revisions.ts:44–60,65–72,94–107,124–146`; `src/reports/query.ts:19–32,50–60`; `src/core/configuration.ts:23,28–34` | Root habilitada, política reaplicada e safety revision; flags explícitas no ReportData. Testes não provam toda a fronteira declarada em D:C10 nem a revogação real de D:C6. |
| Retenção só conteúdo e backup/destino atômico — D | `src/core/maintenance.ts:76–156,158–170` | SQLite backup, digest/contagens, destino novo, marcador/staging e rename; retenção deleta somente file_contents. Guard de serviço presente, sem prova do ramo. |
| Diagnóstico de armazenamento e metadata preservada — D | `src/core/maintenance.ts:16–28`; `src/core/configuration.ts:36–38`; `src/collectors/revisions.ts:51–54` | Consumo/status e suspensão de conteúdo implementados; nenhuma purga de eventos neste caminho. |
| Detalhe/catálogo, sem projeto, offline/gap/stale — R | `src/web/Workspace.tsx:35,76–91,98–107,114–121`; `src/web/pages/Projects.tsx:7,18`; `src/web/pages/ProjectDetail.tsx:40–50`; `src/web/pages/Files.tsx:9–11` | Seleção e query reusadas, contexto sai do detalhe ao mudar seleção; FileCoverage reutilizado; avisos explícitos. |
| Polling não substitui páginas expandidas — R | `src/web/Workspace.tsx:43–46,63–69,100`; `src/web/pages/ProjectDetail.tsx:23–29` | `pauseRefresh()` seta expanded; timer para enquanto expanded/moreBusy. Conferido estaticamente; R:C5 só espera até a 21ª linha, não atravessa um tick de 5s. Light não inclui fault injection. |
| Abort de leitura obsoleta na troca de filtro/desmontagem — R | `src/web/pages/ProjectDetail.tsx:17–22` e `src/web/Workspace.tsx:47–61` vs `Workspace.tsx:72–74` e `ProjectDetail.tsx:32` | **Parcial:** efeitos de listagem têm AbortController/cleanup, mas `openSession` e `showCommit` não recebem signal nem têm guarda de resposta obsoleta. Ver S1 abaixo. |

**S1 — P2, ressalva adicional de Swept de concorrência (fora da contagem dos 33).** A linha R:Swept declara abortar leitura obsoleta em troca de filtro/desmontagem. Isso é verdadeiro para os efeitos de listagem, mas não para as leituras de detalhe em `src/web/Workspace.tsx:72–74` (`setDetail(await api(...))`) e `src/web/pages/ProjectDetail.tsx:32` (`setCommit(await api(...))`). Não exercitei race/fault injection, portanto não afirmo ter reproduzido um vazamento ou falha visual. A garantia abrangente de abort não está presente nesses caminhos. Mínimo para fechar a ressalva: cancelamento/guarda de resposta nessas leituras e prova controlada da troca/fechamento com resposta atrasada. Não é pedido de refactor/estilo.

## Limites operacionais que continuam pendentes

- T12: captura Codex real/confiança nativa pessoal. Fixtures não concluem esse aceite.
- PR real do piloto: não houve chamada GitHub nesta verificação; snapshots controlados não substituem PR existente real.
- Piloto de um dia/T24 e bloqueio/suspensão físicos: não exercitados; full-flow e amostra histórica de dez minutos não os substituem.
- Parsers históricos nativos adicionais Claude/Codex/OpenCode v2: continuam fora dos contratos demonstrados.
- Conferência com perfis pessoais e aceite visual completo não são declarados por este profile light.

**Conclusão:** build e todas as suites estão verdes, e a amostra histórica real foi repetida com êxito nos IDs/contagens/replay. Ainda faltam as assertions/fronteiras enumeradas para fechar os 16 checks e a ressalva Swept. Não corrijo a implementação nesta rodada; o autor deve acrescentar as provas mínimas, obter green e devolver as lacunas para re-verificação independente.
