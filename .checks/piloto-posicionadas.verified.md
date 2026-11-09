# Preparação Worklog + Posicionadas — verificação

**Verdict: PASS — C1/C2, 2/2 comprovados no estado atual.**
**Perfil:** light (sem auditoria UI, join Coverage, Test policy ou injeção de falhas).
**Verifier:** subagente independente, autor != verificador; sem delegação.
**Rodada:** 1, escopo operacional de preparação solicitado em 08/11/2026.
**Base:** árvore de trabalho atual; HEAD informado `231e046`. A árvore já continha implementação majoritariamente untracked; não se atribui o diff HEAD inteiro a esta rodada. Nenhum commit realizado.

## Prova executada

`node scripts/verify-pilot-setup.mjs` — exit 0. Resultado individual: `C1=PASS`, `C2=PASS`, `version=2.2.6`, `captureProven=false`.

| Check | Assertions localizadas e executadas | Resultado |
|---|---|---|
| C1 — raízes exatas habilitadas, nomes e projetos distintos | `scripts/verify-pilot-setup.mjs:12–19`: paths `Downloads/Sistemas/Worklog` e `Developer/Posicionadas` relativos ao home; consulta `WHERE r.path=?`; `assert.ok(row)`, `assert.equal(row.enabled, 1)`, `assert.equal(row.name, name)`. Linha 22: `assert.notEqual(roots[0].project_id, roots[1].project_id)`. | PASS; Worklog `9e928196-f868-4cd4-84fb-24e7432e4a19`, Posicionadas `09bca149-4a74-4bee-be35-2110b8da5dae`. |
| C2 — identidade, store, versão nativa suportada e fonte habilitada | `scripts/verify-pilot-setup.mjs:23–29`: consulta pelo sourceId fixado; `assert.ok(['2.2.5', '2.2.6'].includes(version))`, `assert.ok(source)`, `assert.equal(source.version, version)`, `assert.equal(source.enabled, 1)`. Linhas 31–33: `assert.ok(wrapper.startsWith('// worklog-managed-opencode-v2'))`, `assert.ok(wrapper.includes(\`"sourceId":${JSON.stringify(sourceId)}\`))`, `assert.ok(wrapper.includes(\`"dataDir":${JSON.stringify(dataDir)}\`))`. | PASS; sourceId `4c30691f-a389-5098-86a7-12636c8e4e33`, versão 2.2.6. |

Busca independente `grep` por `assert\.|readOnly|SELECT|console` encontrou as assertions acima; não houve filtro vazio. Wrapper gerenciado lido diretamente: `~/.config/opencode/plugins/worklog.js:1–3` contém marcador, import do módulo compilado e chamada `createWorklogPlugin` com sourceId e `dataDir=/Users/lucasruon/Library/Application Support/Worklog` esperados. Suporte confirmado em `src/collectors/plugins/opencode-projector.ts:5`: `['2.2.5', '2.2.6']`.

## Swept — conferência no código relevante

| Item | Evidência e conclusão |
|---|---|
| Validação | `src/core/projects.ts:41–49`: path absoluto, nome, realpath, diretório e sobreposição com store; `src/cli/manage.ts:40–42` e `src/cli/automation.ts:13`: versão detectada/suportada antes de instalar. C1/C2 medem resultado persistido. |
| Falhas | `src/cli/automation.ts:18,23,26–28`: recusa arquivo alheio/build ausente; grava wrapper antes de registrar instalação bem-sucedida. Probe falha por assertion/erro e só imprime PASS após todas as verificações (`scripts/verify-pilot-setup.mjs:34`). Não há promessa de transação única entre filesystem e SQLite. |
| Idempotência/retry | `src/core/projects.ts:61–74`: busca por device/path e UPSERT; `src/cli/automation.ts:19,25–28`: identidade estável por instalação/path e gravação apenas quando conteúdo difere. Conferência estática, sem repetir instalação pessoal. |
| Autorização | Brief recebido autoriza apenas duas raízes e atualização pessoal. `src/cli/index.ts:107–108` cadastra raiz explícita; `src/cli/manage.ts:37` só substitui workspaces quando recebidos; `src/core/automation.ts:31–35` respeita raízes existentes e pausa. Não foi auditado um snapshot pessoal anterior de workspaces nem o histórico de comandos executados pelo autor. |
| Concorrência/ordenação | `src/core/projects.ts:61–76` usa transação; `src/core/sqlite.ts:43–50` implementa BEGIN IMMEDIATE/COMMIT/ROLLBACK. `src/core/private-files.ts:15–24` usa arquivo exclusivo 0600, fsync e rename atômico; chamado em `src/cli/automation.ts:26`. |
| Ciclo de dados | Cadastro/instalação usam UPSERT/registro de identidade, sem purga de eventos nesses caminhos (`src/core/projects.ts:61–75`, `src/cli/automation.ts:19–29`). C2 confirma store/identidade atuais, não comparação integral de histórico antes/depois. |
| Dependências externas | `src/providers/github.ts:8,13,76` restringe chamadas a GET. Não repetida consulta GitHub nem inventário de remotes; zero PRs/ausência de remote são registros operacionais do autor, não prova independente desta rodada. |
| Estados | `scripts/verify-pilot-setup.mjs:34` imprime explicitamente `captureProven:false`; `docs/PILOTO.md:3,10,16,35–44` e `TASKS.md:463–476` mantêm piloto/captura pendentes. |
| Observabilidade | `scripts/verify-pilot-setup.mjs:16,24` consulta somente metadados necessários; linha 34 imprime checks, IDs/nomes, versão e limite de captura, sem transcrições/payloads. Linha 10 abre SQLite com `{ readOnly: true }`, linha 35 fecha a conexão. |

## Documentação e limites

Lidos `.checks/piloto-posicionadas.md`, `docs/PILOTO.md`, `docs/AUTOMACAO.md`, `TASKS.md` e `.checks/PROXIMA-SESSAO.md`. As notas novas registram preparação sem fechar T24. Trechos antigos que ainda pedem atualização pessoal devem ser interpretados como históricos, conforme ressalvas explícitas em `docs/AUTOMACAO.md:11` e `.checks/PROXIMA-SESSAO.md:21`.

- Perfil light: comparação formal de fontes binding/UI, Coverage/Test policy e fault injection não executados. Nenhum AGENTS.md encontrado no workspace.
- Esta prova comprova configuração atual das duas raízes e wrapper/fonte, não instalação passada, preservação integral de histórico, ausência de quaisquer outras raízes, nem estado efetivo de captura no processo OpenCode já aberto.
- Não comprova captura após recarga, turnos/ferramentas reais, confiança Codex, login Claude, histórico privado, PR real ou um dia de uso/crescimento. PID do serviço, baseline de bytes e consulta GitHub documentados não foram reexecutados por esta verificação limitada.
- Nenhuma instalação, recarga, alteração pessoal, leitura de transcrição/segredo, commit ou delegação. Store pessoal acessado somente pelo script autorizado em modo read-only; wrapper gerenciado lido sem alteração. Única gravação do verificador: este relatório.

**Gaps bloqueantes C1/C2:** nenhum. **Faults:** não aplicável ao perfil light.
