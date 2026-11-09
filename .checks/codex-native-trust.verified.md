# Codex native trust — verificação independente

**Verdict: PASS — 3/3 checks, com limites históricos explícitos.**
**Perfil:** light. **Rodada:** 1, escopo operacional completo do checklist.
**Verificador:** subagente independente; autor != verificador.
**Base:** HEAD `231e046be73f25c4ecc55aa0790cf796a9590312`, árvore não commitada. Os três arquivos-alvo são novos; não se atribui a este escopo o restante do trabalho presente no `git status`.

## Entradas e contrato

- Lidos `.checks/codex-native-trust.md` e `/Users/lucasruon/.claude/skills/tlc-implement/references/verify.md`.
- Inspecionados `scripts/codex-native-review.mjs`, `artifacts/codex-local-native/verification.json`, `artifacts/codex-local-native/verification-live.json` e `.checks/codex-local-install.verified.md`.
- Contrato oficial aberto: https://raw.githubusercontent.com/openai/codex/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/tui/src/hooks_rpc.rs . `write_hook_trusts` usa `ConfigBatchWrite`, `key_path: "hooks.state"`, `trusted_hash: update.current_hash`, `MergeStrategy::Upsert`, `reload_user_config: true`; coincide com `scripts/codex-native-review.mjs:117`.
- C3 foi explicitamente renegociado: dois turnos mínimos autorizados depois da falha sem modelo. Não se exige sucesso da tentativa inicial nem se trata inferência autenticada como modelo local.
- Não há AGENTS.md no workspace. Perfil light informado no checklist/brief. Comparação UI, Coverage join, Test policy e fault injection não se aplicam neste perfil; checklist não contém seção Test policy.

## Checks e assertions

| Check | Prova independente | Evidência localizada | Resultado |
| --- | --- | --- | --- |
| C1 | `node scripts/codex-native-review.mjs --self-test`, exit 0: `PASS exact-worklog-definitions (valid + 7 rejected variants)` | `scripts/codex-native-review.mjs:22–38`: `assert.equal(selected.length, 10)`, igualdade do conjunto de eventos, dez keys únicas, `assert.equal(hook.command, command)`, caminho local, source user, enabled true, managed false, timeout 2, matcher null e hash não vazio. `:46–50`: aceita dez válidos; `assert.throws(...)` para comando alterado, hash vazio, source project, disabled, timeout 600, matcher e duplicação. | PASS |
| C2 | `node scripts/codex-native-review.mjs` **sem flags**, exit 0: reviewed=10, todos os dez statuses `trusted`, localOnly=true, changed=false. Hash e backup revalidados por Python somente leitura. | `scripts/codex-native-review.mjs:110–117`: retorno antes da escrita sem `--approve`; `:115`: `assert.deepEqual(fresh, before)`; `:117`: API oficial; `:121`: `assert.ok(ours.every(hook => hook.trustStatus === 'trusted'))`; `:122,124,126`: metadados próprios, inventário alheio e bytes de hooks iguais antes/depois. Relatórios inicial/live `:3–7` registram confiança, dez hooks, preservação e hash. | PASS, preservação antes/depois histórica com limite abaixo |
| C3 | Python stdlib/SQLite `mode=ro`, exit 0; cada ID live consultado sem filtro de fonte, projeto ou tipo antes das assertions. | `scripts/codex-native-review.mjs:134`: sandbox read-only/on-request; `:141`: prompt mínimo; `:82–83,145–147`: conclusão via `turn/completed` e `assert.equal(row.turnStatus, 'completed')`; `:151–162`: cinco tipos, captura e ausência de ferramentas. `verification-live.json:12–38,41–67`: dois IDs, turnos completed e cinco tipos por sessão. Projeção SQL independente confirmou exatamente os dez eventos e associações abaixo. | PASS |

## Gate de segurança

O comando padrão só faz initialize/initialized e hooks/list, abre SQLite com `{ readOnly: true }` (`scripts/codex-native-review.mjs:59`) e retorna antes de config/batchWrite, criação de relatórios e thread/start (`:110–113`). Não executei `--approve`, `--live-turns`, modelo, instalação ou smoke mutável.

O comando esperado é recomposto de executável/CLI local, data-dir e ID da fonte (`:69`); nenhuma definição selecionada com comando diferente passa pelo gate (`:26`). Inventário de ambas as raízes passa pelo mesmo gate (`:105`). Não há edição direta de TOML, bypass de confiança ou gravação em fonte alheia. A gravação opt-in usa apenas keys/hashes nativos selecionados; releitura de metadados e bytes precede a chamada (`:114–117`). Alteração concorrente posterior à releitura não é exclusão mútua/compare-and-swap; não foi simulada nem é garantia deste PASS.

## SQLite independente — somente campos projetados

Conexão: `sqlite3.connect(path.as_uri()+'?mode=ro', uri=True)` para `~/Library/Application Support/Worklog/worklog.sqlite`.

Fonte projetada por ID: `id,tool,config_path,version,enabled,device_id`.
Confirmado: `6c09e88d-a817-5aca-86b5-86cffd7d1532`, tool `codex`, versão `0.167.0`, enabled `1`, config_path `/Users/lucasruon/.codex/hooks.json`, device `b8bc387b-5e10-4ccf-a559-9ead1847c4cb`.

Consulta executada para cada ID, com parâmetros:

```sql
SELECT e.event_id,e.source_id,e.type,
       json_extract(e.document,'$.cwd') cwd,
       ep.project_id,p.name project,r.path root_path,
       r.enabled root_enabled,r.device_id root_device,ep.reason
FROM events e
LEFT JOIN event_projects ep ON ep.event_id=e.event_id
LEFT JOIN projects p ON p.id=ep.project_id
LEFT JOIN project_roots r ON r.id=ep.root_id
WHERE json_extract(e.document,'$.nativeSessionId')=?
ORDER BY e.type
```

Assertions executadas: `len(rows)==5`; tipos exatamente `session.start, session.end, turn.submit, turn.start, turn.end`; todos `source_id==sid`, `cwd==root`, `project==session['project']`, `root_path==root`, `root_enabled==1`, `root_device==source['device_id']`; um único project_id por sessão. Os tipos/contagens também iguais ao relatório; `captured is True`, `turnStatus=='completed'`, `turnSubmissions==2`, duas sessões.

| ID nativo | Projeto / project_id | cwd e root_path exatos | Resultado |
| --- | --- | --- | --- |
| `01a1bdf7-4e0e-7122-bbf6-f2726fdf393e` | Worklog / `9e928196-f868-4cd4-84fb-24e7432e4a19` | `/Users/lucasruon/Downloads/Sistemas/Worklog` | 5 eventos, um por tipo; reason authorized-root |
| `01a1bdf7-5f22-7e41-966a-3960abe637ce` | Posicionadas / `09bca149-4a74-4bee-be35-2110b8da5dae` | `/Users/lucasruon/Developer/Posicionadas` | 5 eventos, um por tipo; reason authorized-root |

A consulta não restringe previamente os tipos nem a fonte: exatamente esses cinco eventos por ID excluem também quaisquer tool/human events dessas sessões, inclusive de outras fontes ou sem associação. Nenhum documento inteiro, transcrição, mensagem ou config.toml foi lido. O script original limita a assertion de ausência de tool aos rows filtrados; a consulta independente acima elimina esse ponto cego nesta verificação.

## Arquivos e preservação histórica

- SHA-256 de hooks.json revalidado contra ambos os relatórios: `62691443fb40ffb19c653c4516de3d75426d3d0cf4c5cd6614bb4b324a52777d`.
- Backup independente pré-instalação lido sem exibir comandos: `/Users/lucasruon/.codex/hooks.json.worklog-backup-b8d25512-9c73-403c-8a68-e97edaadba0b`; hash confirmado `c45d05cb486317603c4d7af9eca5b1d9a7618d6ee563cd0a8233700f832b4ed1`.
- Assertions Python executadas: campos fora de hooks iguais; para cada evento `groups[:len(before)]==before`; exatamente dez grupos adicionais com marcador Worklog; removendo só esses grupos `restored==old`. Quatro handlers antigos preservados semanticamente, incluindo ordem/strings/campos. Releitura confirmou bytes dos dois arquivos inalterados durante a verificação.
- O backup prova preservação da definição instalada, **não** o trust/enabled nativo alheio anterior à aprovação. Para esse passado, a evidência disponível é relatório `unrelatedUnchanged:true` mais assertions `:122–126`; não há snapshot bruto antes/depois para replay histórico independente. Não reexecutei aprovação para fabricar essa prova. O estado trusted atual foi confirmado diretamente pela API.
- Falha inicial permanece em `verification.json:8–14`: modelRequests=0 e captured=false para `01a1bdf4-6a66-7000-9872-05c6af14b78f`. SQL projetado atual encontrou somente `session.end:1`, coerente com o checklist; não houve promoção retroativa a sucesso. O relatório inicial usa schema anterior (`modelRequests/localOnly`), distinto do script atual; não se alega reproduzi-lo byte a byte com este script.

## Limites / gaps

Nenhum gap bloqueante nos C1–C3 dentro do escopo autorizado. Limites: preservação histórica do inventário nativo alheio depende da evidência registrada e das assertions; notificações passadas `turn/completed` não foram reproduzidas (relatório + código, corroborados pelo lifecycle persistido); não se prova execução de ferramentas/subagentes, conteúdo da resposta do modelo, ausência universal de alterações fora desses eventos ou conclusão de T15/T24. Não foram gastos novos turnos/modelos.

## Atualização durante a revisão — catch sanitizado

Reaberto o estado atual de `scripts/codex-native-review.mjs:43–59` após aviso do autor. O catch agora ocupa `:53–57`: saída somente `{ passed:false, code }`, com allowlist `CODEX_SPAWN_FAILED`, `CODEX_NATIVE_RPC_FAILED`, `CODEX_NATIVE_TIMEOUT`; demais erros viram `NATIVE_REVIEW_FAILED`. Não imprime AssertionError.message ou metadados de deepEqual. Inspeção estática PASS; não foi provocada falha operacional.

**Correção de referências do corpo acima para o arquivo atual:** linhas 1–52 não mudaram; todas as referências ao script a partir da antiga linha 53 passam a **linha citada + 4**. Assim, o gate de retorno é `:114–117`, escrita oficial `:121`, preservação `:125–130`, sandbox `:138`, prompt `:145`, conclusão `:149–151`, SQL/assertions `:155–166`; SQLite readonly é `:63`, comando esperado `:73`, inventário ambas raízes `:109`. Esta tabela de deslocamento atualiza as citações sem confundir os dois estados observados; a única mudança comunicada é a expansão sanitizada do catch.

Reexecutado **no estado atual** `node scripts/codex-native-review.mjs --self-test`: exit 0, `PASS exact-worklog-definitions (valid + 7 rejected variants)`. Inventário anterior mantido como evidência: transporte/gate não alterados; sem nova chamada de modelo. Trechos operacionais novos de `docs/CODEX.md:7–13` e `docs/PILOTO.md:41` lidos: descrevem autorização, falha inicial, captura mínima posterior e limites; ainda dizem verificação em andamento. Nenhuma documentação foi editada pelo verificador.

Única escrita deliberada desta verificação: `.checks/codex-native-trust.verified.md`. Sem delegação, commit, alteração de configuração ou dados.
