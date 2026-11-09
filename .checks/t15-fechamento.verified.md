# T15 — fechamento disponível e comprovado — verificação independente

**Verdict: PASS — C1–C4 (4/4).**
**Profile:** light.
**Diff range:** `fa121cc..b162071` (HEAD executado: `b1620713eee2b87296d2320ca6728d4ef5f406d3`).
**Round:** 1 — full.
**Verifier:** contexto independente, autor != verificador; sem delegação, correção ou commit.
**Execução:** 2026-11-09 01:54 UTC.

## Fontes e escopo

Lidos integralmente `.checks/t15-fechamento.md` e `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md`; lidos T15 em `TASKS.md:312–334` e aceite vigente em `docs/FONTES-HISTORICO.md:3–15`. O usuário confirmou neste despacho o aceite **Disponível e comprovado**, não cobertura nativa integral. Nenhuma contradição encontrada nesse recorte. Não há AGENTS.md no inventário pesquisado; perfil light explícito no despacho e checklist.

Diff conferido: somente checklist, TASKS, FONTES-HISTORICO e novo `scripts/smoke-codex-recovery.ts`; nenhum código de produto alterado. Árvore inicialmente limpa. Testes anteriores são provas de regressão, não implementação nova: a nova prova real é o smoke incluído no diff.

## Checks e assertions executadas

| Check | Evidência localizada e assertion decisiva | Resultado |
|---|---|---|
| C1 | `scripts/smoke-codex-recovery.ts:34–46` restringe as duas sessões autorizadas, exige cinco eventos por sessão, fonte/identidades/roots originais e tipos exatos. `:66`: `assert.deepEqual(JSON.parse(bytes), [event])`; `:73`: `assert.equal(result.imported, 10)` e completude/avisos; `:74–76` fecha/reabre e exige `assert.equal(replay.imported, 0)`; `:79`: `assert.deepEqual(inputs, expected.sort((a, b) => a.eventId.localeCompare(b.eventId)))`. O esperado é o documento original autorizado, sem `originSeq`/`receivedAt` locais, comparado integralmente, inclusive eventId/horários. | PASS — smoke exit 0, 10 importados, replay 0 |
| C2 | `scripts/smoke-codex-recovery.ts:83`: `assert.equal(sessions.length, 2)`; `:85`: `assert.ok(sessions.some(session => session.nativeSessionId === samples[index]!.session && session.projectId === projectIds[index] && session.provenance === 'imported'))`; `:90`: `assert.equal(deriveTime(ctx, filter).humanEstimatedMs, 0)`; `:91` exige count de `file_revisions` igual a 0; `:92` exige que todos os eventos sejam somente session.start/end e turn.start/end/submit, excluindo eventos humanos/de arquivos. | PASS — projetos Worklog/Posicionadas corretos, zero dedicação/revisões |
| C3 | `scripts/smoke-codex-recovery.ts:87–89` usa período da primeira sessão e um projeto: `assert.equal(selected.length, 1)` e `assert.equal(selected[0]!.nativeSessionId, samples[0]!.session)`; `:93`: `assert.equal(digest(readPrivate(file.path, 64 * 1024)), file.hash)` para os dez recibos. Origem `:27` chama `openReadonlyDatabase`; `src/core/sqlite.ts:9–10` usa `new DatabaseSync(path, { readOnly: true })` e `PRAGMA query_only = ON`. A exclusividade de `to` tem regressão complementar em `tests/collectors/history.test.ts:28–37`: evento exatamente em `range.to` é excluído, com importados 2/skipped 3 por ferramenta. | PASS — seleção 1, hashes originais inalterados, origem read-only |
| C4 | `tests/collectors/history.test.ts:28–37`: três ferramentas normalizadas, importados 2/replay 0; `:48–52`: três sessões, `assert.ok(sessions.every((s) => s.provenance === 'mixed'))`, zero humano; `:63–79`: `HISTORY_TRUNCATED`, retomada, `HISTORY_RECORD_INVALID`, `HISTORY_FORMAT_UNSUPPORTED`, replay 0 e privacidade; `:90–98`: cancelamento, retomada 24, bytes inalterados e escopo recusado. `tests/collectors/opencode-history.test.ts:84–92` enumera avisos concretos de formato/versão/root/timestamp; `:118–129` exige cancelamento/retomada e, para somente log.synced, `assert.equal(empty.complete, false)` e `assert.deepEqual(empty.warnings, ['HISTORY_UNAVAILABLE'])`. | PASS — oito testes passaram, incluindo os quatro nomes exigidos |

## Gates independentes

- `npm exec -- tsx scripts/smoke-codex-recovery.ts` — exit 0; parser `codex-receipts-v1`, expected/imported 10/10, replayInserted 0, recoveredSessions 2, selectedSessions 1, humanEstimatedMs 0, fileRevisions 0, originalReceiptsUnchanged true. Artifact normal: `artifacts/t15-recovery/codex-receipts.json`.
- `npm run test:unit -- tests/collectors/history.test.ts tests/collectors/opencode-history.test.ts` — exit 0; **8 passed, 0 failed, 0 skipped**. Nomes individualmente presentes no output: três fontes/período/replay/live/proveniência; truncamento/formato/timestamp/retomada; cancelamento/escopo; legado read-only/compatibilidade; log v2 metadados/identidade live; período/limites; identidade/autorização/formatos; cancelamento/retomada/watermark.
- `npm run typecheck` — exit 0.
- A tentativa de lookup contextual por `rg -n -A` não executou porque `rg` não está instalado; substituída por busca dedicada com linhas e leitura dos corpos pertinentes. Nenhum teste foi presumido por filtro vazio.

## Isolamento e privacidade

`scripts/smoke-codex-recovery.ts:18–20,31–46,63–68` limita leituras ao registro da fonte, metadados normalizados das duas sessões próprias e seus dez recibos referenciados por IDs; não enumera transcrições/conversas. `src/core/private-files.ts:6–12` abre recibos `O_RDONLY | O_NOFOLLOW` e verifica proprietário, tamanho e permissões privadas.

O clone deliberado de identidade existe somente em `mkdtemp` (`scripts/smoke-codex-recovery.ts:49–59`), com destino `directory/data` explícito. `openStore` (`src/core/context.ts:18–33`) só abre/migra o store e inicializa identidade; não inicia servidor/hook/worker. A fonte configurada em `:61` registra um caminho, não instala hooks. Escrita dos recibos ocorre apenas no temp, com modo 0600 e `wx`; `:98` fecha o store e remove exclusivamente o diretório criado. Saída `:94–101` contém metadados/contagens fixos, não documentos brutos; falhas sanitizadas. Nenhum serviço, modelo, aprovação, credencial, restore real ou instrumentação pessoal foi acionado. Preservar a identidade aqui é necessário à prova; reutilizá-la em serviço real NÃO está autorizado nem foi testado.

## Gaps e limites

- **Nenhum gap bloqueante em C1–C4 no aceite vigente.** PASS não converte limitações excluídas pelo usuário em suporte real.
- Recuperação real desta rodada comprova somente os dez recibos Codex das duas sessões próprias, não leitura de rollout nativo, ferramentas/MCP ou linhagens adicionais. Claude normalizado não comprova transcrição Claude nativa.
- OpenCode v2 somente com watermark/sem eventos continua indisponível; teste verde comprova o diagnóstico, não recuperação positiva real. Logs com lacunas de sequência continuam recusados, conforme `docs/FONTES-HISTORICO.md:15`.
- Smoke legado 46/46 não foi repetido: foi expressamente reconfirmado no despacho e não é prova executada por este verificador. A regressão sintética legado foi executada no lote. Nenhuma conclusão nova sobre bases/roots pessoais adicionais.
- Sem repetição da suíte completa, integração, E2E ou build nesta rodada documental; typecheck e provas exigidas executados no HEAD acima. Não se encerra M3/T24 nem outros aceites pessoais por consequência deste relatório.
- Comparação exaustiva UI/fontes, recomputação Coverage, julgamento Test policy e fault injection não se aplicaram nesta execução **light**; Coverage/Test policy não estão definidos no checklist. Nenhuma mutação injetada.
