# Histórico Git e exportação

## Abrir os recursos

Após atualizar o código, execute `npm ci`, `npm run build` e reinicie o servidor (`npm run dev` ou `npm start`, conforme o modo em uso). Abra o painel com `npm run cli -- open`.

- **Commits**, no menu lateral: escolha projetos, período, máquina e ferramenta. Para mostrar commits, deixe a ferramenta em **Todas** ou **Git**. O período usa a data do **committer**, não a data em que o Worklog descobriu o commit.
- **Reindexar Git** antecipa uma varredura das raízes locais cadastradas da seleção; não cria commits nem altera checkout. **Carregar mais commits** continua a paginação. Mensagem e arquivos ficam nos detalhes expansíveis de cada linha.
- **Exportação**, no menu lateral: abra o seletor de projetos e marque um ou mais. Escolha os filtros, as seções e **Gerar prévia**. Depois use **Baixar CSV** ou **Baixar PDF**. Sem projeto explicitamente selecionado, a geração é recusada.

O fim do dia escolhido na interface é inclusivo; a API consulta `[from,to)` em UTC, com corte inicial em `America/Sao_Paulo`. O filtro de ferramenta também vale para o arquivo: selecionar OpenCode, por exemplo, exclui commits Git.

## O que é exportado

Resumo por projeto e da seleção, sessões opcionais, commits opcionais e metadados opcionais dos arquivos desses commits. Dedicação estimada, ajustes, execução acumulada de agentes, união de relógio e duração de sessões permanecem medidas distintas, com valores em milissegundos no CSV/PDF. Os tempos usam a mesma consulta do painel.

Notas e PRs dependem de tarefas futuras. Revisões observadas e diffs já são consultáveis em **Arquivos**, mas ainda não entram neste relatório. Os nomes de arquivos dos commits passam pela política de exclusão antes da persistência, inclusive em renomes. Não se lê conteúdo de versões de arquivos para montar o relatório atual.

CSV: UTF-8 com BOM, vírgula, todas as células entre aspas, aspas internas duplicadas e linhas CRLF. Campos que podem iniciar fórmulas, inclusive após espaços, recebem apóstrofo inicial. Quebras de linha em mensagens e nomes são preservadas.

PDF: geração local por PDFKit, fonte Noto Sans incorporada para acentos em português, quebra automática de páginas e numeração. Links de commits são incluídos quando o remote normalizado é GitHub. Não há acesso ao provedor durante a geração. Datas, origem, incompletude e limitações acompanham o documento.

## Coleta e integridade

`src/collectors/git.ts` coleta até 100 commits ainda não observados por raiz e rodada. A primeira consulta à tela também dispara a coleta. Com o painel ou agente atualizado em execução, raízes locais são verificadas a cada 30 s; backlog agenda a próxima rodada em 1 s. Repositório grande mostra importação parcial até concluir. Há timeout e limite de saída por comando; erros preservam o histórico anterior e ficam visíveis.

Git é chamado com argv, sem shell, hooks, textconv, diff externo, substituição de objetos ou fsmonitor. Mensagens usam campos NUL; arquivos usam `--name-status -z`. Arquivos de merge são comparados ao primeiro parent. Não se infere a branch histórica original. Refs exibidos são os que apontavam diretamente para o SHA na última varredura.

Unicidade: repositório + SHA. Clones/worktrees com a mesma identidade compartilham o commit; observações e arquivos são escopados por raiz/máquina. Rebase, reset ou remoção de refs não apagam os commits já observados: eles ficam identificados como preservados fora dos refs. A importação de Git não gera intervalos nem horas humanas.

Implementação persistente: migração `006_git.sql`, tabelas `git_commits`, `git_observations`, `git_files`, `git_scans` e `git_remote_sync`. `005_automation.sql` já existia, por isso não se usa o número 005 proposto originalmente para Git.

## Agente remoto

O novo coletor anuncia `git-v1`. `agent git` exporta snapshots paginados de até 50 observações; a central valida identidade, raízes, campos e nomes de arquivo antes de gravar. Cursor Git e cursor de eventos são independentes. Replay é idempotente. A identidade do snapshot exclui o horário de verificação sem mudança, permitindo continuar históricos grandes entre rodadas. Falha Git preserva sessões e informa diagnóstico próprio.

Em uma instalação antiga, atualize o release remoto pelos comandos de **Instalar ou atualizar** em [OPERACAO.md](OPERACAO.md), após compilar. Agente antigo continua sincronizando sessões; a tela informa quando a coleta Git remota não está disponível. **Atualização de 06/11:** esta instalação pessoal já recebeu o coletor Git/revisões e teve sincronização real confirmada; o registro da entrega inicial sem atualização automática foi superado. Evidências atuais em [ARQUIVOS.md](ARQUIVOS.md) e [PROGRESSO.md](PROGRESSO.md).

O release remoto continua sem depender dos pacotes de PDF: o módulo PDF é carregado sob demanda apenas na rota de download da central.

## Prévia e limites

`POST /api/reports?<ReportFilter>` recebe `{options:{sessions,notes,files,commits,prs,fullDiff}}`. As opções são booleanas obrigatórias. Seções indisponíveis solicitadas são recusadas; arquivos exigem commits. Seleção vazia, projeto desconhecido e inclusão de eventos sem projeto são recusados.

A resposta contém `{id,report}`. Downloads autenticados em `GET /api/reports/:id.csv` e `GET /api/reports/:id.pdf` reutilizam exatamente esse `ReportData`, mesmo que a coleta continue. Alterar filtros/opções invalida a prévia na interface. Ela expira após 15 min ou reinício do servidor; são mantidas no máximo cinco prévias por processo. Um download expirado pede nova geração.

Limites explícitos: 10 mil sessões e 10 mil commits por relatório, e até 16 MiB de dados de prévia. Se excedidos, reduza o período/projetos; nunca se baixa um relatório silenciosamente truncado. A persistência de relatórios gerados não faz parte desta entrega.

## Verificação

```sh
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

Cobertura específica: `tests/collectors/git.test.ts`, `tests/remote/git.test.ts`, `tests/reports/exports.test.ts`, `tests/integration/reports-git.test.ts` e `tests/e2e/exports.spec.ts`. E2E baixa CSV/PDF, verifica seleção de dois dentre quatro projetos e totais, renderiza primeira/última página do PDF longo e captura desktop/mobile. Imagens temporárias ficam em `test-results/`.
