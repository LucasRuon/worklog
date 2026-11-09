# Ambiente e verificação — T01

Inventário inicial em 05/11/2026, atualizado com o piloto em 06/11/2026. Worklog foi selecionado nesta sessão como primeiro projeto, e a coleta nativa OpenCode foi comprovada. A presença das demais ferramentas continua sendo apenas inventário, não prova de coleta ativa.

**Revisão T13 em 08/11:** suporte do plugin estendido a **2.2.6**, com allowlist exata e origem preservada. Smoke nativo em área temporária confirmou active, duas sessões/duas evidências e recebimento pelo stream após ativação; sem chamadas de modelo, perfis pessoais ou serviços alterados. Gates completos **54/28/30** e typecheck/build verdes. Claude local observado na investigação de contratos: **2.1.319**, sem tentativa de login/modelo; Codex permanece **0.167.0**. A instrumentação pessoal OpenCode precisa de atualização opt-in antes do piloto.

**Revalidação da continuação T15 (08/11):** `opencode --version` observou **2.2.6**, `codex --version` observou **0.167.0**. OpenAPI local confirmou o endpoint GET do log durável de sessão, SSE/envelope v1. Nova importação offline `opencode-log-v1` verificada; não equivale à revalidação do plugin ao vivo 2.2.6. A sessão v2 deste projeto consultada continha apenas `log.synced`, sem eventos recuperáveis. Nenhum serviço/plugin pessoal foi alterado.

**Atualização da automação em 06/11:** OpenCode atualizado para **2.2.5**, plugin global Worklog confirmado ativo; Claude remoto **2.1.319**, conta funcional, hooks instalados e sessão real comprovada. Launchd local e systemd-user remoto ativos; linger Linux habilitado. A tabela original abaixo documenta o inventário anterior. Estado atual e evidências em `AUTOMACAO.md`.

## Ambiente local observado

| Item | Resultado |
|---|---|
| Sistema | macOS / Darwin arm64 |
| Node | `v24.19.0`, fixado em `.nvmrc`; pacote aceita `>=24.19.0 <25` |
| Executável Node | `~/.nvm/versions/node/v24.19.0/bin/node` |
| npm | `11.17.0` |
| SQLite | `3.53.3` via `node:sqlite`; abertura em memória e banco persistente verificadas |
| Claude Code CLI | `2.1.318`, entrada em `~/.local/bin/claude` |
| Codex CLI | `0.166.0`, entrada em `~/.local/bin/codex` |
| OpenCode CLI | `1.19.5`, entrada em `~/.opencode/bin/opencode` |

Raízes de configuração/dados detectadas: `~/.claude`, `~/.claude-conta-b`, `~/.claude-conta-c`, `~/.codex`, `~/.config/opencode`, `~/.local/share/opencode`. As três pastas Claude são fontes candidatas distintas. Não foram lidas credenciais, transcrições ou identidades de contas. T05/T12/T13 validarão contratos de eventos; T14 registrará fontes e perfis.

Em `/Applications` e `~/Applications`, o inventário encontrou apenas `~/Applications/Claude Code URL Handler.app` entre os nomes Claude/Codex/OpenCode. Trata-se de um handler, sem versão de app confirmada; não equivale a um aplicativo Codex/Claude/OpenCode testado. Superfícies desktop permanecem não verificadas.

Repetir o diagnóstico local: `npm run cli -- doctor`. Ele lê metadados de presença, resolve executáveis e consulta `--version`; não instala nem modifica hooks/plugins.

## Host `macmini`

SSH revalidado com autenticação existente, `BatchMode=yes` e verificação normal de host.

| Item | Resultado |
|---|---|
| Sistema | Linux x86_64 |
| PATH não interativo | Não resolve Node, npm, Claude, Codex ou OpenCode |
| Node 24 disponível | `/home/lucas/.nvm/versions/node/v24.21.0/bin/node` |
| SQLite nesse Node | `3.53.4`, consulta em memória bem-sucedida |
| npm com PATH explícito do Node 24 | `11.19.0` |
| Outra versão encontrada | Node `22.23.3` no NVM; não é o runtime escolhido pelo projeto |
| Claude | `/home/lucas/.local/bin/claude`, versão `2.1.318`; raiz `/home/lucas/.claude` |
| Codex/OpenCode | Não encontrados no PATH nem nos paths usuais consultados; ausência global não comprovada |

**Requisito para T16/T17:** utilizar o Node 24 pelo caminho absoluto ou fornecer seu diretório no PATH do serviço. Não há necessidade comprovada de instalar outro Node; a versão 24 existente passou no smoke SQLite e satisfaz o intervalo do pacote. Instalação do coletor, compatibilidade completa do pacote e serviço remoto serão verificadas nessas tarefas.

## Projetos e provedor

- No planejamento inicial, o usuário adiou os projetos. Em 06/11, autorizou seguir com o M1 nesta sessão; Worklog foi cadastrado como primeiro projeto.
- O repositório Worklog tinha Git inicializado e nenhum remote na verificação inicial. No piloto atual, foi observado e normalizado `github.com/LucasRuon/worklog`.
- Nenhuma pasta de outro projeto foi vasculhada nem cadastrada para captura.
- GitHub confirmado como provedor do primeiro projeto para T18. Integração de PRs ainda não implementada. Outros projetos/provedores serão verificados quando forem escolhidos.

## Stack efetivamente instalada

Dependências diretas com versões exatas em `package.json` e transitivas em `package-lock.json`:

- React / React DOM `19.2.0`.
- TypeScript `5.9.3`, tsx `4.20.6`.
- Vite `7.3.7`, plugin React `5.1.0`.
- Playwright `1.56.1`, Chromium de teste `141.0.7390.37` / build `1194`.
- Tipagens Node `24.10.1`, React e React DOM `19.2.2`.

Foram consultadas versões do registry antes da instalação. O tag mais recente de Playwright apontava para uma dependência indisponível, por isso foi utilizada uma versão com cadeia instalável. Vite foi fixado no patch corrigido indicado pela auditoria. `npm audit` final: zero vulnerabilidades reportadas.

`node:sqlite` permanece isolado em `src/core/sqlite.ts`. A documentação o classificava como RC; a compatibilidade aqui se baseia nos runtimes executados. Não há dependência nativa adicional de SQLite.

## Dados e autenticação

- API/UI no mesmo origin: `http://127.0.0.1:4320`. Desenvolvimento usa Vite em middleware, sem segunda porta pública.
- Padrão macOS: `~/Library/Application Support/Worklog`. Linux: `$XDG_DATA_HOME/worklog` ou `~/.local/share/worklog`.
- `WORKLOG_DATA_DIR` / `--data-dir` aceita diretório absoluto exclusivo; a base recusa dados dentro deste repositório. Futuras raízes monitoradas também precisarão excluir o diretório de dados.
- Diretório de dados `0700`; banco e `bootstrap.token` `0600`. O token não entra em banco, bundle ou logs.
- `npm run cli -- open` lê o token local e abre o navegador com fragmento temporário. A UI remove o fragmento com `replaceState` e troca o token por cookie `HttpOnly`, `SameSite=Strict`, de oito horas. Não usa `localStorage`/`sessionStorage`. Trace de E2E está desativado para não reter o token transitório.
- Todas as requisições passam por validação de Host, Origin e Fetch Metadata. Ações mutáveis exigem bearer local ou cookie; cookie também exige Origin exato. Leituras da API, exceto health, exigem autenticação.
- Reiniciar invalida sessões de navegador; o token local persiste. Reabrir com o comando `open`. Logout revoga a sessão no servidor.
- Migrações SQL por arquivo, transacionais e com hash: alteração/remoção de SQL já aplicado impede abertura em vez de ignorar divergência.

## Evidências de validação

O primeiro teste de bootstrap foi executado antes da implementação e falhou por ausência de `src/server/index.ts`.

| Verificação | Evidência |
|---|---|
| `npm ci` | Reinstalação pelo lockfile |
| `npm run typecheck` | TypeScript estrito, sem erros |
| `npm run test:unit -- tests/core/sqlite.test.ts` | Migração com falha reverte lote; reabertura e aplicação repetida; SQL modificado recusado |
| `npm run test:integration -- tests/integration/bootstrap.test.ts` | Health, permissões, token, Host/Origin externos recusados, logout, porta reutilizada, configuração e symlink de token recusados |
| `npm run test:integration -- tests/integration/cli.test.ts` | Outro processo inicia/encerra em diretório temporário com espaço no path; SIGTERM libera porta; token ausente dos logs |
| `npm run build` | API/CLI compiladas e UI de produção gerada |
| `npm run test:e2e -- tests/e2e/bootstrap.spec.ts` | Quatro cenários: desktop/mobile × produção/desenvolvimento; bootstrap, reload, teclado, logout e ausência de overflow/erros JS |

Capturas locais geradas em `test-results/` e inspecionadas em desktop/mobile. O teste de desenvolvimento revelou espera circular no encerramento do WebSocket de HMR; corrigida fechando Vite antes do servidor HTTP e preservada nos quatro cenários.

### Validação manual pendente

1. Executar `npm run dev`.
2. Em outro terminal, executar `npm run cli -- open` e conferir a tela de primeiro uso autenticada.
3. Encerrar com Ctrl+C e confirmar o término.
4. Escolher posteriormente os projetos para fechar o inventário do provedor.

T01 tem o primeiro projeto do piloto confirmado. O código avançou até T08 e uma parte antecipada de T13; evidências em [PROGRESSO.md](PROGRESSO.md) e [M1.md](M1.md). Alterações locais ainda sem commit.

## Continuação T02–T08

API de projetos, sessões, atividade, resumo, fontes, settings e sinal explícito de dedicação implementada. O CLI oferece cadastro de raízes, instalação/remoção de hooks Claude e consumo da fila sem UI. Ver [PRIMEIRO-USO.md](PRIMEIRO-USO.md).

Autenticação Claude revalidada sem copiar credenciais: perfil padrão sem login; contas B/C indicam credenciais presentes em `auth status`, mas a execução de `claude -p` falha com login expirado sem renovação automática. Os três smokes Claude produziram zero eventos. Essa pendência é específica da T05; o usuário definiu OpenCode como fonte do M1.

O armazenamento nativo OpenCode foi localizado pelo CLI em `~/.local/share/opencode/opencode.db`. Metadados da sessão nesta raiz foram observados com queries restritas e driver somente leitura. O smoke real validou 116 eventos e uma sessão no painel em 06/11/2026 14:04:09 UTC, sem copiar conteúdo de conversas ou gerar sinais humanos. Capturas/relatório em `artifacts/m1-live/`; detalhes em `M1.md`.

O probe `ioreg` confirmou disponibilidade do sinal de tempo ocioso no macOS. Não foram provocados bloqueio ou suspensão físicos. Dedicação usa sinal explícito porque o hook de submissão de prompt também ocorre em automações.
