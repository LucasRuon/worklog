# Worklog

Sistema pessoal de acompanhamento de projetos, trabalho com agentes e tempo. Criado em 05/11/2026.

**Situação:** **coleta automática instalada no Mac e no `macmini`**, com plugin pessoal **OpenCode 2.2.6 atualizado e captura real Worklog confirmada**. Verificação independente [PASS, 2/2](.checks/opencode-personal-live.verified.md): plugin ativo e sessões, turnos e ferramentas associados ao projeto correto. Claude remoto 2.1.319 foi validado anteriormente; serviço remoto e sincronização foram reconferidos ativos. Worklog e Posicionadas estão cadastrados para o piloto. Guia: [docs/AUTOMACAO.md](docs/AUTOMACAO.md).

**Uso diário:** abra `opencode` no projeto local autorizado ou `claude` no projeto remoto autorizado. O projeto é identificado pelo Git/pasta, sem comando de conexão por sessão. Operação, atualização e remoção: [docs/OPERACAO.md](docs/OPERACAO.md). O M1 original está registrado em [docs/M1.md](docs/M1.md).

**Commits e exportação:** o menu **Commits** consulta mensagens, autoria, arquivos elegíveis e estado dos refs; **Exportação** gera prévia e downloads CSV/PDF com projetos explicitamente selecionados. O coletor remoto desta instalação já recebeu o release com Git e revisões. Em atualizações futuras, reinicie o servidor para carregar rotas novas. Uso e limites: [docs/GIT-EXPORTACAO.md](docs/GIT-EXPORTACAO.md).

**Arquivos e diffs:** o menu **Arquivos** reúne revisões observadas entre commits, com conteúdo elegível, comparação com a versão anterior, renomes comprovados e lacunas explícitas. O detalhe da sessão permite abrir revisões relacionadas; vínculos temporais são inferidos e a associação manual prevalece. Serviços local/remoto recebem a mesma captura e sincronização de revisões. Uso e limites: [docs/ARQUIVOS.md](docs/ARQUIVOS.md).

**Codex:** adapter local da CLI **0.167.0** implementado; dez hooks instalados/confiados **somente neste Mac**, preservando os quatro handlers anteriores. Captura real de dois turnos mínimos em Worklog/Posicionadas aprovada por [verificação independente PASS 3/3](.checks/codex-native-trust.verified.md), sem ferramentas. Não é necessário repetir `/hooks` para os mesmos hashes. Guia: [docs/CODEX.md](docs/CODEX.md).

**Continuação 08/11:** painel completo **T20 implementado** e verificação independente de T14/T15/T18–T23 concluída com **PASS, 33/33 checks** no perfil light. O detalhe de projeto reúne sessões, resumo, revisões/diffs, commits, PRs e diagnósticos. Filtros por origem e seleção múltipla compartilham o período; “Somente sem projeto” permite revisar atividades não atribuídas. Relatório: [`.checks/continuacao.verified.md`](.checks/continuacao.verified.md).

**Relatórios e operação:** T21/T22/T23 incluem notas/PRs/revisões/diffs, ajustes compensatórios, configuração, retenção e backup/restauração, com provas independentes. **T15 concluída no aceite "disponível e comprovado"**, [PASS independente 4/4](.checks/t15-fechamento.verified.md): recuperação real Codex 10/10 e OpenCode legado 46/46, replay zero. Cobertura nativa adicional continua como limitação/evolução, sem alegação de suporte integral. **Continuam pendentes:** demais perfis pessoais/PR real e piloto de um dia T24. Operação: [docs/RELATORIOS-AJUSTES-RECUPERACAO.md](docs/RELATORIOS-AJUSTES-RECUPERACAO.md). Próximas ações: [`.checks/PROXIMA-SESSAO.md`](.checks/PROXIMA-SESSAO.md).

**Histórico nativo OpenCode v2:** novo parser offline **`opencode-log-v1`**, para o log durável SSE de fontes 2.2.5/2.2.6. Preserva os IDs da coleta ao vivo, período, privacidade e retomada; **7/7 checks independentes**, gates daquela extensão **50 unitários / 26 integração / 28 E2E**. A sessão real consultada tinha apenas o marcador final, retornando `HISTORY_UNAVAILABLE`; recuperação positiva de histórico v2 continua pendente. Guia: [docs/FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md); relatório: [`.checks/t15-opencode-log.verified.md`](.checks/t15-opencode-log.verified.md).

**Compatibilidade T13:** OpenCode 2.2.5/2.2.6 de ponta a ponta, instalação registra a versão detectada e remoção preserva a origem. Gates dessa revisão: **54 unitários / 28 integração / 30 E2E**, typecheck/build aprovados. **Verificação independente PASS, 7/7 checks**: [relatório](.checks/t13-opencode-226.verified.md).

**Histórico Codex T15:** parser `codex-rollout-0.167.0` implementado para turnos de thread raiz, com horários explícitos e IDs/recibos compartilhados com hooks, inclusive offline e entre processos. Resultado sempre parcial (`HISTORY_LIFECYCLE_ONLY`): não promete ferramentas/linhagens herdadas. Gates dessa extensão **92 unitários / 30 integração / 30 E2E**, typecheck/build aprovados. **Verificação independente PASS, 9/9 checks**: [relatório](.checks/t15-codex-rollout.verified.md). O fechamento posterior da T15 preserva esses limites, conforme [aceite vigente](docs/FONTES-HISTORICO.md).

**Extensão Codex v2:** opt-in `codex-rollout-v2-0.167.0` acrescenta Bash/apply_patch completed e filhos diretos com borda ordinal comprovada, preservando o v1 e os IDs dos hooks. Gates dessa extensão **122 unitários / 31 integração / 30 E2E**, typecheck/build aprovados; [verificação independente PASS, 8/8](.checks/t15-codex-items.verified.md), perfil light. Cobertura parcial; amostras reais de recibos não são prova de rollout nativo.

## Executar a base local

**Extensão Codex v3:** chamadas dinâmicas históricas concluídas com sucesso, nomes canônicos, horários explícitos e replay/live sem duplicação. [Verificação independente PASS, 5/5](.checks/t15-native-extension.verified.md); regressão completa do build **158 unitários / 32 integração / 30 E2E**. T15 encerrada no aceite disponível/comprovado; formatos/linhagens não suportados continuam explícitos em [FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md).

Requer Node **24.19.0** (veja `.nvmrc`).

```sh
nvm use
npm ci
npm run build
npm run dev
```

Em outro terminal do projeto:

```sh
npm run cli -- open
```

O comando abre `http://127.0.0.1:4320` com autenticação local. Ctrl+C encerra o servidor. Dados persistidos fora do repositório, em `~/Library/Application Support/Worklog` no macOS. Variáveis opcionais em `.env.example`; são lidas do ambiente do processo, sem carregamento automático do arquivo.

Para usar outra porta/diretório, passe os mesmos parâmetros ao servidor e ao comando `open`:

```sh
npm run dev -- --port 4321 --data-dir "/caminho/absoluto/dados-worklog"
npm run cli -- open --port 4321 --data-dir "/caminho/absoluto/dados-worklog"
```

Produção local: `npm run build` seguido de `npm start`. Diagnóstico: `npm run cli -- doctor`.

## Verificação

```sh
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npx playwright install chromium
npm run test:e2e -- tests/e2e/bootstrap.spec.ts
npm run test:e2e -- tests/e2e/first-use.spec.ts
npm run test:e2e
```

Comandos de teste aceitam um caminho depois de `--`. O teste E2E usa a UI compilada e também verifica o modo de desenvolvimento. Ambiente, fontes detectadas e evidências: [docs/AMBIENTE.md](docs/AMBIENTE.md).

### Endpoints implementados

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/health` | Local, resposta mínima de saúde |
| POST | `/api/auth/bootstrap` | Bearer do arquivo local; cria sessão de navegador |
| GET | `/api/auth/session` | Cookie ou bearer local |
| POST | `/api/auth/logout` | Cookie com Origin válido ou bearer local |
| GET / POST | `/api/projects` | Listagem paginada e cadastro/associação de raízes locais |
| GET | `/api/sessions` | Sessões do período, com paginação |
| GET | `/api/sessions/:id` | Detalhe e execuções observadas da sessão |
| GET | `/api/activity` | Eventos filtrados, páginas de até 100 |
| GET | `/api/summary` | Tempos separados, contagens e distribuição por projeto |
| GET / POST | `/api/sources` | Diagnóstico seguro e cadastro local de ferramenta/perfil/configuração/versão |
| PATCH | `/api/sources/:id` | Pausa/retomada com revisão otimista; histórico preservado |
| POST | `/api/sources/:id/remove` | Remover instrumentação Worklog da instalação local, sem apagar origem |
| GET | `/api/prs` | PRs filtrados/paginados, estado do cache e repositórios selecionados |
| POST | `/api/prs/sync` | Solicitar leitura GitHub de repo cadastrado, respeitando retry/rate limit |
| GET | `/api/work-summary` | Resumo determinístico com IDs de evidências e versão da regra |
| GET / PATCH | `/api/settings` | Defaults e janela configurável de estimativa |
| GET / POST | `/api/notes` | Nota por alvo/lista filtrada e nova versão auditável |
| GET / POST | `/api/adjustments` | Ledger filtrado e correção explícita com revisão global |
| POST | `/api/adjustments/:id/undo` | Compensação sem apagar o ajuste anterior |
| GET / PATCH | `/api/configuration` | Configuração persistida e uso medido de armazenamento |
| PATCH | `/api/projects/roots/:id` | Pausa/retomada de raiz sem apagar cadastro/histórico |
| POST | `/api/retention` | Aplicar a retenção atual, preservando eventos/cursores |
| POST | `/api/focus` | Sinal explícito de dedicação ou pausa local |
| GET | `/api/commits` | Commits filtrados e paginados, com cobertura por raiz |
| POST | `/api/commits/scan` | Antecipar a varredura Git dos projetos selecionados |
| POST | `/api/reports` | Gerar prévia congelada com seleção explícita e opções |
| GET | `/api/reports/:id.csv` / `/api/reports/:id.pdf` | Baixar os mesmos dados da prévia, por até 15 min |
| GET | `/api/files` / `/api/files/history` / `/api/files/:id` | Lista, histórico, conteúdo elegível e diffs sob demanda |
| POST | `/api/evidence-links` | Associação explícita entre revisão e sessão |
| GET | `/api/commits/:id` | Detalhe de commit relacionado a uma revisão |

Rotas de domínio exigem autenticação; mutações por cookie exigem Origin exato. O painel completo reutiliza os endpoints existentes; nenhuma rota adicional ficou necessária para T20. Notas/ajustes/configuração/retenção estão implementados. Backup/restore são comandos CLI locais, sem endpoint de upload. O piloto de um dia permanece pendente; verificação independente técnica concluída em 08/11. A interface começa vazia, sem dados do mockup.

## Por onde começar

1. Ler [Especificação](docs/ESPECIFICACAO.md).
2. Ler as decisões propostas e os contratos em [Arquitetura](docs/ARQUITETURA.md).
3. Consultar a [validação do M1](docs/M1.md) e o [primeiro uso](docs/PRIMEIRO-USO.md). Nesta máquina a sessão OpenCode e a raiz Worklog já estão conectadas.
4. Prosseguir com Git, arquivos, outras ferramentas, Mac mini, PRs e exportação conforme as dependências.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [TASKS.md](TASKS.md) | 24 tarefas com prioridade, dependências, arquivos propostos e critérios verificáveis. |
| [tasks.csv](tasks.csv) | Mesmo backlog em formato tabular, para importar em um gerenciador de tarefas. |
| [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) | Requisitos acordados, limites e comportamento esperado. |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Stack proposta, fluxo de dados, modelo e interfaces. |
| [docs/FONTES.md](docs/FONTES.md) | Documentação técnica consultada e verificações de compatibilidade necessárias. |
| [docs/AMBIENTE.md](docs/AMBIENTE.md) | Inventário real de runtimes/fontes, comandos de execução e evidências da T01. |
| [docs/PROGRESSO.md](docs/PROGRESSO.md) | Progresso T01–T08, testes, decisões e bloqueio de autenticação nativa. |
| [docs/PRIMEIRO-USO.md](docs/PRIMEIRO-USO.md) | Cadastro de projetos, instalação/remoção de hooks e uso do painel. |
| [docs/M1.md](docs/M1.md) | Aceite técnico com dados desta sessão OpenCode, capturas e reprodução. |
| [docs/AUTOMACAO.md](docs/AUTOMACAO.md) | Plugin v2, hooks remotos, serviços, autorizações e validação real. |
| [docs/CODEX.md](docs/CODEX.md) | Contrato 0.167.0, instalação seletiva, confiança nativa, testes e limite do smoke. |
| [docs/FONTES-HISTORICO.md](docs/FONTES-HISTORICO.md) | Controles de fontes, filtros, importação/retomada, formatos e limites de histórico. |
| [docs/PRS-RESUMOS.md](docs/PRS-RESUMOS.md) | GitHub GET/cache/rate limit e resumos determinísticos com evidências. |
| [docs/RELATORIOS-AJUSTES-RECUPERACAO.md](docs/RELATORIOS-AJUSTES-RECUPERACAO.md) | Relatório completo, ledger/notas, configuração, retenção e recuperação. |
| [docs/PILOTO.md](docs/PILOTO.md) | Pré-requisitos e cenários reais ainda pendentes de T24. |
| [docs/OPERACAO.md](docs/OPERACAO.md) | Status, sincronização, atualização e remoção dos componentes gerenciados. |
| [referencias/mockup/index.html](referencias/mockup/index.html) | Cópia independente do mockup navegável em grafite. Abrir no navegador. |
| [referencias/mockup/DESIGN.md](referencias/mockup/DESIGN.md) | Referência visual do mockup. |
| [referencias/capturas/desktop.png](referencias/capturas/desktop.png) | Prévia visual desktop. |
| [referencias/capturas/mobile.png](referencias/capturas/mobile.png) | Prévia visual mobile. |

## Marcos

| Marco | Tarefas | Resultado |
|---|---|---|
| M1 — Primeiro uso local | T01–T08 + parte antecipada da T13 | OpenCode local → sessões → execução / dedicação sinalizada → painel. Claude permanece como fonte adicional da T05. |
| M2 — Evidências do trabalho | T09–T11 | Commits, alterações de arquivos, versões e associações com sessões. |
| M3 — Três ferramentas | T12–T15 | Codex, OpenCode, múltiplas contas e importação histórica. |
| M4 — Trabalho remoto | T16–T17 | Coleta no Mac mini e sincronização por SSH. |
| M5 — Histórico completo | T18–T20 | PRs, resumos e telas completas por projeto. |
| M6 — Uso cotidiano | T21–T24 | Exportações, ajustes de tempo, operação e piloto real. |

## Convenções

- P0: primeiro marco local. P1: escopo principal após a base. P2: fechamento operacional do produto; não significa dispensável.
- Ordem sugerida: numeração das tarefas; dependências são obrigatórias. Não iniciar frentes simultâneas sem necessidade.
- Marcar uma tarefa concluída somente com seus critérios de aceite e evidências de validação.
- Tempo humano estimado, execução de agentes e duração da sessão são medidas distintas.
- O mockup contém dados ilustrativos; o aplicativo real deve começar vazio.
- Valores de configuração e stack que não foram escolhidos pelo usuário estão identificados como propostas técnicas nos documentos.

Progresso detalhado em `TASKS.md` e `tasks.csv`.
