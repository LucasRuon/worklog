# T12 — Verificação independente Codex

**Verdict: PASS — 7/7 checks comprovados no escopo declarado.**
**Aceite integral da T12: pendente**, conforme `TASKS.md:261`; C7 comprova descoberta/confiança, não captura real.

- **Profile:** light; nenhuma fault injection, alteração de código/testes ou delegação.
- **Round:** 1 — entrega completa, verificada em 06/11/2026.
- **Verifier:** independente do autor, executando as provas nesta sessão.
- **Alvo:** árvore de trabalho em `/Users/lucasruon/Downloads/Sistemas/Worklog`, HEAD `231e046be73f25c4ecc55aa0790cf796a9590312`. Não há range de commits da implementação: a base T01–T11/T13/T16/T17 já era preexistente e majoritariamente untracked. O diff global contra HEAD não foi atribuído à T12. Nenhum commit/push autorizado ou realizado (`TASKS.md:40`).
- **Escopo inspecionado:** todos os arquivos novos T12 e integrações indicados pelo solicitante, documentação de estado e checklist; módulos compartilhados foram lidos para conferir os caminhos efetivamente reutilizados.
- **Âncora da árvore:** SHA-256 agregado `d29cf8ab089d13d0e060b2d456c784bbde768c49e8c20d379e23a56dbaf1597e`, reproduzível pelo comando abaixo, antes deste relatório:

```sh
shasum -a 256 .checks/t12-codex.md src/collectors/codex.ts src/collectors/queue.ts src/cli/hooks.ts src/cli/index.ts tests/collectors/codex.test.ts tests/integration/codex-hook.test.ts tests/fixtures/codex/hooks.json scripts/smoke-codex.ts package.json README.md docs/CODEX.md TASKS.md tasks.csv docs/PROGRESSO.md | shasum -a 256
```

## Fontes e método

Lidos integralmente `.checks/t12-codex.md`, `docs/CODEX.md`, a seção T12 e restrições de `TASKS.md`, e `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md`. Também lidos `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md` e os registros T12 em README, tasks.csv e PROGRESSO. Nenhum `AGENTS.md` encontrado na busca do repositório; profile light confirmado pelo solicitante/checklist.

O schema público fixado em `rust-v0.167.0/codex-rs/hooks/src/schema.rs` foi aberto diretamente no GitHub raw: confirma `turn_id` nos hooks de turno e os campos de subagente usados pelo adapter. Não foi necessário executar modelos. Comparação/enumeração UI, Coverage join e julgamento de Test policy não são exigidos em light; o checklist não contém seções Coverage/Test policy nem fonte visual vinculante.

Os seis nomes de teste foram encontrados em `tests/collectors/codex.test.ts:21,60,87,112,130` e `tests/integration/codex-hook.test.ts:14` e apareceram individualmente como executados/aprovados. A tentativa de busca com `rg -n -A 45` retornou 127 (`rg` ausente); a localização foi conferida pela ferramenta de busca de conteúdo e leitura numerada dos arquivos. Não houve instalação de ferramentas.

## Comandos executados pelo Verifier

Runtime: Node **v24.19.0**. Cada comando abaixo terminou com **exit 0**.

| Comando | Resultado observado |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, sem erros |
| `npm run test:unit -- tests/collectors/codex.test.ts` | 5 testes passaram; 0 falhas, skips ou cancelamentos |
| `npm run build` | TypeScript servidor + Vite concluídos; compilado atualizado antes da integração |
| `npm run test:integration -- tests/integration/codex-hook.test.ts` | 1 teste passou; 0 falhas, skips ou cancelamentos |
| `npm run smoke:codex` | `passed: true`; versão 0.167.0; 10 hooks; somente `untrusted`; 0 eventos; 0 requisições de modelo |
| `npm run test:unit -- tests/collectors/claude.test.ts tests/collectors/automation.test.ts` | 6 testes passaram; regressão adicional motivada pela extração de `prepareCapture` na fila compartilhada |

### C1–C7: prova, asserção localizada e julgamento

Paths relativos à raiz do repositório. Os valores esperados de C1 estão na mesma unidade de teste (`tests/collectors/codex.test.ts:23–34`), enumerando os dez hooks da fixture.

| Check | Prova efetivamente executada | Evidência que decide a afirmação | Resultado |
|---|---|---|---|
| **C1** — dez hooks, contrato e privacidade | **`Codex: contrato 0.167.0 e privacidade`** | `tests/collectors/codex.test.ts:37`: `assert.deepEqual(events.map((event) => [event.type, event.payload]), expected[index], String(raw.hook_event_name))`; `:38`: `assert.equal(events.some((event) => event.type === 'human.interaction'), false)`. Fixture com os dez hooks em `tests/fixtures/codex/hooks.json:2–11`; ausência de `PRIVATE_` também assertada em `:39`. | PASS |
| **C2** — pai/subagente e interrupção | **`Codex: pai, subagente e interrupção nas projeções`** | `tests/collectors/codex.test.ts:80`: `assert.equal(parent.state, 'interrupted'); assert.equal(child.state, 'waiting')`; `:81`: `assert.equal(child.parentSessionId, parent.id)`; `:82`: `assert.equal(f.ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM session_executions WHERE session_id = ? AND kind = 'turn'", child.id)?.n, 1)`. A sequência usa o mesmo `session_id` e `SubagentStart` com turno do pai (`:63–73`); `:78` exige duas sessões. | PASS |
| **C3** — replay, horários, ferramentas e escopo | **`Codex: fila offline, replay e escopo`** | `tests/collectors/codex.test.ts:102`: `assert.equal(result.inserted, 4); assert.equal(result.duplicates, 2)`; `:104`: `assert.ok(dates.every((row) => row.occurred_at === observed.occurredAt))`. Duas chamadas distintas entram em `:95–96`; cwd externo e escape por symlink retornam zero em `:97,99`; fonte pausada retorna zero em `:107`. | PASS |
| **C4** — rejeição sem persistir entrada bruta | **`Codex: rejeições e diagnóstico sem payload`** | `tests/collectors/codex.test.ts:116`: `assert.deepEqual(normalizeCodex({ ...f.source, version: '0.168.0' }, raw, observed), [])`; `:119`: `assert.equal(queueCodex(f.ctx.config.dataDir, f.source.id, invalid, observed), 0)`; `:121–122`: `assert.equal(diagnostic.code, 'CODEX_INPUT_UNSUPPORTED'); assert.deepEqual(Object.keys(diagnostic).sort(), ['at', 'code'])`; `:124`: `assert.equal(drainQueue(f.ctx).inserted, 0)`. Casos incluem `turn_id` ausente, evento desconhecido, sessão inválida e payload >1 MiB (`:118`); fonte pausada também em `:117`/C3. | PASS |
| **C5** — configuração idempotente/seletiva e confiança | **`Codex: instalação seletiva, backup e confiança`** | `tests/collectors/codex.test.ts:141`: `assert.equal(await readFile(configPath, 'utf8'), first)`; `:144`: `assert.equal(groups.at(-1)!.hooks[0]!.timeout, 2)` para cada evento; `:153`: `assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), expected)` após remoção, conservando configuração original e hook com outro source ID; `:154` exige fonte alvo desabilitada. `:145` exige um backup; `:146–147` exigem bytes originais de `config.toml` e `hook-trust.json`. | PASS |
| **C6** — entrypoint compilado fail-open/offline | **`Codex: entrypoint compilado fail-open e offline`** | `tests/integration/codex-hook.test.ts:30`: `assert.equal(native.status, 0); assert.equal(native.stdout, '{}\n'); assert.equal(native.stderr, '')`; mesmas exigências para JSON inválido/payload grande em `:34` e base indisponível em `:37`. SQLite é fechado em `:27`, fila existe em `:31`, e `:39` exige `assert.equal(drainQueue(ctx).inserted, 2)`. Executa o comando shell gerado, com path contendo espaço, apóstrofo e `$`. | PASS |
| **C7** — descoberta nativa e limite explícito | **`npm run smoke:codex`**, nome de escopo emitido **`native-discovery-and-trust`** | `scripts/smoke-codex.ts:60`: `assert.deepEqual(hooks.map((hook) => hook.eventName).sort(), codexHooks.map((name) => name[0]!.toLowerCase() + name.slice(1)).sort())`; `:61`: `assert.ok(hooks.every((hook) => hook.timeoutSec === 2 && hook.enabled))`; `:63`: `assert.ok(!trustStatuses.includes('trusted'), 'Fresh hooks must require native trust review')`; `:65`: `assert.equal(queue.inserted, 0)`. Saída observada: 10 hooks, `trustStatuses: ['untrusted']`, `eventsObserved: 0`, `modelRequests: 0`, `liveCapture: 'pending-native-trust-review'`. | PASS **somente descoberta/limite** |

Regressões adicionais executadas, todas aprovadas:

- `Claude: merge/removal preserva configuração e fila funciona sem banco/UI`
- `automação: autoriza workspace, enfileira sem cadastrar e descobre só o repositório correto`
- `plugin v2 captura pelo entrypoint compilado e não persiste eventos fora das raízes autorizadas`
- `projeção OpenCode v2 descarta conteúdo antes do IPC e não confunde idle com fim de sessão`
- `instalador do plugin é idempotente e remoção preserva plugins alheios`
- `plugin reconhece sessão recente criada antes da ativação sem importar seu conteúdo`

## Swept existing — releitura contra o código

| Restrição citada no checklist | Conferência direta |
|---|---|
| Validação compartilhada de IDs/cwd/payload | `src/core/events.ts:23–45` exige chaves, UUIDs, UTC, IDs curtos, cwd absoluto sem controles, payload por discriminante e limite de 16 KiB normalizados. `src/core/policy.ts:63–75` valida e filtra a forma persistível; `src/collectors/codex.ts:17–29` aplica versão/limite/IDs do contrato. |
| Fonte habilitada e root/workspace autorizados; root pausada e symlink externo negados | `src/collectors/queue.ts:16–18,27–35`: fonte habilitada e identidades coincidentes, cwd real/diretório, root mais específica, negação explícita de root pausada, workspace e política. `src/core/policy.ts:28–56` confere exclusões e caminhos. |
| Replay não pode dispensar autorização | `src/collectors/codex.ts:60–65` obtém fonte habilitada e autoriza **antes** de gravar recibo; `:76–83` valida recibo, compara todos os campos exceto horário e chama `enqueueEvents`; `src/collectors/queue.ts:50–54` reaplica `prepareCapture` **antes** da fila. Recibo existente não libera um cwd/fonte atualmente negado. |
| Concorrência/idempotência e ordenação | Recibo publicado por hard link exclusivo, `EEXIST` reutiliza vencedor, fsync do diretório e leitura privada (`src/collectors/codex.ts:66–81`); lock exclusivo `O_EXCL/O_NOFOLLOW`, comparação da configuração original e escrita atômica (`src/cli/hooks.ts:89–124`). Projeção ordena por horário/prioridade/sequência (`src/core/sessions.ts:9–11`). |
| Fila apagada somente após append; recibos retidos | `src/collectors/claude.ts:102–105`: todos os appends antecedem unlink. `src/core/events.ts:86–102` valida conflito e preserva duplicação idempotente. Recibos `.json` não são apagados por `queueCodex`; somente o temporário `.pending` é removido (`src/collectors/codex.ts:75`). Retenção permanece T23. |
| Subagente compartilhando ID, estados e ausência de tempo humano fabricado | `src/collectors/codex.ts:24–27,34–42` inclui agente na identidade, não abre turno no SubagentStart, fecha só turno no SubagentStop e registra interrupção. `src/core/sessions.ts:6–8,59–79` separa sessão/agente, pai e pares incompletos; `src/core/policy.ts:69` inclui a fonte no event ID. PostToolUse é somente `completed`, sem declarar teste aprovado. |
| Falha de dependência e observabilidade sem payload | Branch de hook antecede `openStore` (`src/cli/index.ts:53–70`), emite `{}` e tratamento final preserva exit 0 (`:135–138`). Diagnóstico é construído apenas com `code`/`at` (`src/collectors/codex.ts:84–90`). `getSourceDiagnostics` só sinaliza atividade após evento recebido (`src/collectors/source-config.ts:27–30`). |

## Revisão das integrações e documentação

- `configureCodexHooks` preserva chaves e handlers alheios, remove apenas comando idêntico ao gerado para esta instalação/fonte, usa quoting de apóstrofo, timeout 2, backup e lock (`src/cli/hooks.ts:76–124`). A única atualização de fonte nessa função usa o próprio `source` (`:123`).
- `hooks --tool codex` valida versão instalada, registra a origem, chama o instalador e informa revisão nativa pendente (`src/cli/index.ts:74–88`). O hook dedicado usa a fila compartilhada sem abrir banco. Não foi criado endpoint HTTP novo; os existentes são reutilizados (`src/server/routes.ts:172,201–221`).
- `package.json:14` aponta `smoke:codex` para o script inspecionado. O script cria `CODEX_HOME` temporário e só envia `initialize`, `initialized` e `hooks/list` (`scripts/smoke-codex.ts:17–19,31,54–56`); não cria thread/turno de modelo. O processo é encerrado e os temporários removidos em `:67–74`.
- README:13, docs/CODEX.md:7–26, TASKS.md:257–265, tasks.csv:13 e docs/PROGRESSO.md:9–13,34 mantêm a captura real pendente. Não há alegação de app desktop validado. A pendência não foi transformada em aprovação por causa do smoke.
- Nenhum defeito concreto foi identificado no fluxo novo examinado. Escritas desta verificação ficaram no relatório, nos artefatos de build autorizados e nos diretórios temporários usados pelas provas. Nenhuma configuração pessoal, instalação de hook pessoal, serviço ou trust foi alterado.

## Lacunas e limites da conclusão

1. **Aceite ao vivo pendente:** ainda falta revisar/confiar via `/hooks` e demonstrar uma sessão real entrando no projeto/métricas. O checkbox `TASKS.md:261` deve continuar aberto. Nenhum modelo foi chamado; o teste compilado é sintético, não prova disparo nativo. App desktop continua sem prova.
2. **Amostragem light:** não houve fault injection nem ensaio de corrida entre processos, alteração concorrente de config ou queda entre recibo e fila. Os mecanismos foram lidos, mas sua resistência a falhas nesses pontos não foi experimentalmente demonstrada.
3. **Cobertura delimitada:** os testes T12 exercitam root explícita e symlink externo; workspace automático é coberto adicionalmente pelo teste preexistente da fila, não por captura Codex nativa. A pausa testa uma entrega nova, não o replay do mesmo recibo após revogação; a proteção deste último foi confirmada estaticamente pela dupla autorização.
4. **Nível das provas:** projeções sintéticas comprovam separação pai/filho e estados, não uma medição real de métricas. O teste de configuração simula hook de outra instalação com outro source ID; não sobe uma segunda instalação real. Não há prova nesta sessão do teste red histórico mencionado pelo autor.

**Conclusão:** checklist C1–C7 aprovado no profile light, com provas executadas nesta árvore. **T12 permanece implementada com aceite nativo real pendente.**
