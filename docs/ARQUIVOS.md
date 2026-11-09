# Histórico de arquivos, revisões e evidências

## Uso

Abra **Arquivos** no menu lateral. Deixe a ferramenta em **Todas** ou **Arquivos** e ajuste projeto, máquina e período. Cada linha é uma revisão observada; clique no nome para abrir o diff, o conteúdo elegível e o histórico do mesmo arquivo.

No detalhe de uma sessão, **Arquivos relacionados** abre as revisões vinculadas. Na revisão, **Abrir sessão** volta à sessão e **Abrir commit** mostra o commit relacionado. As inferências são rotuladas e explicam sua evidência. **Associar sessão** registra uma associação explícita a uma sessão do mesmo projeto e máquina, que prevalece sobre hipóteses temporais.

O primeiro estado capturado é **Estado inicial observado**: não afirma que o arquivo foi criado naquele instante. Gravações posteriores, criações, exclusões e renomes têm horário **observado**, não horário exato da ação. Reconciliações após uma lacuna podem agrupar alterações ocorridas enquanto o coletor estava indisponível. Nenhuma revisão implica dedicação humana.

## Captura

- Observação nativa por `fs.watch`, com debounce de 500 ms por raiz e reconciliação independente a cada 30 s. Falha do watcher aparece como lacuna; ele é tentado novamente. Uma pasta indisponível preserva seu histórico e recebe diagnóstico próprio.
- Descoberta e inventário só nas raízes cadastradas da máquina. Raízes aninhadas, inclusive pausadas, têm precedência sobre a raiz-pai. Não se percorrem symlinks. A substituição da raiz por um symlink é recusada.
- Git fornece arquivos rastreados e não rastreados, com nomes NUL-delimitados. Ignores, dependências, builds, `.git`, `.env*`, chaves e credenciais continuam excluídos. A política é reaplicada antes da leitura/persistência e das consultas. Novas exclusões ocultam revisões antigas; no remoto, revogações de acesso são sincronizadas.
- Texto UTF-8 de até 2 MiB é preservado por SHA-256 em `file_contents`, sem duplicar conteúdo idêntico. Binários, controles não textuais, codificação inválida e arquivos maiores recebem somente metadados e motivo. A leitura é limitada e verifica a identidade do arquivo antes/depois.
- Save por substituição atômica mantém a identidade lógica do caminho. Renome só é comprovado quando há correspondência única de dispositivo/inode/data de criação na mesma reconciliação. Sem identidade suficiente, aparece como criação/exclusão, sem inventar certeza.
- Eventos `file.change`, revisões e estado de acompanhamento são gravados atomicamente. Reprocessar o mesmo estado não cria uma revisão nova. O primeiro estado não gera um falso evento de criação.

Um lease persistido coordena o agente e o servidor: apenas um proprietário mantém o watcher de cada raiz. A renovação é independente de SSH; após queda abrupta, outro processo pode assumir em até 120 s. Parar um observador que já perdeu o lease não encerra o novo proprietário.

### Limites e lacunas

O inventário admite até 25 mil nomes por raiz e tem limite de saída dos comandos Git. O processamento de revisões por rodada usa até 32 MiB de leitura e orçamento de 10 s depois do inventário; ao atingir o orçamento, a cobertura informa captura parcial e continua nas próximas reconciliações. Não há remoção silenciosa de dados para caber nesse orçamento.

Diffs são calculados sob demanda com jsdiff, com contexto de três linhas, orçamento de 200 ms, distância máxima de 10 mil alterações, até 512 KiB e 10 mil linhas na resposta. Se excedidos, o motivo é explícito e o conteúdo elegível continua consultável. A lista paginada não inclui conteúdo nem diffs. O detalhe mostra até 100 revisões recentes do arquivo e informa quando há mais; a lista por período permite localizar revisões anteriores.

Quando o conteúdo foi removido, os metadados permanecem e a indisponibilidade é mostrada. A execução automática da retenção de 30 dias, backup/restauração e orçamento de armazenamento continuam em **T23**; esta entrega não apaga blobs automaticamente.

Não há promessa de preservar cada gravação intermediária, detectar todas as renomeações ou recuperar conteúdo anterior ao início do monitoramento. Pastas temporárias de ensaios anteriores que já foram removidas aparecem como indisponíveis; seu cadastro/histórico não foi apagado.

## Relações com sessões e commits

`src/collectors/relations.ts` considera sessões no mesmo projeto e máquina perto da gravação detectada. Mais de uma sessão gera hipóteses ambíguas. Reconciliações e estados iniciais não fabricam autoria de sessão. Os adapters atuais não preservam o caminho editado nas chamadas nativas: portanto, a janela temporal permanece **inferência**, mesmo quando houve uma ferramenta chamada Edit.

Um commit com o mesmo arquivo, horário compatível (Git tem precisão de um segundo) e até 30 min após a observação também é uma hipótese. Não comprova autoria nem inclusão da versão textual exata. Associação explícita do usuário prevalece, sem editar eventos brutos.

## Sincronização e operação

Os agentes atualizados anunciam `files-v1`. A central busca um journal de revisões/acessos com cursor próprio, independente de eventos e Git. Cada pacote tem até 100 registros e aproximadamente 7 MiB. Há validação de raiz, identidade, versão textual por hash e sequência antes da gravação transacional. Replay não duplica; erro preserva cursor e dados anteriores.

Os comandos `agent git` e `agent files` exportam dados já persistidos. Não iniciam uma nova varredura dentro da requisição SSH. A captura fica no serviço de fundo; `collect` permite antecipar uma coleta manual. Isso evita que uma primeira indexação longa prenda a requisição de exportação.

Git e arquivos têm orçamento de 10 s entre páginas por rodada SSH; uma chamada em andamento ainda está sujeita ao timeout de transporte de 25 s. Backlogs continuam do cursor confirmado nas próximas rodadas. A cobertura mostra o estado parcial. Uma falha em revisões não interrompe a importação de sessões.

Após compilar uma atualização, os comandos de [OPERACAO.md](OPERACAO.md) atualizam os serviços local e remoto. O release remoto não exige instalar jsdiff ou PDFKit: a geração de diffs/PDF é carregada sob demanda apenas pela central.

## API

| Método | Rota | Resultado |
|---|---|---|
| GET | `/api/files?<ReportFilter>` | Revisões sem conteúdo, paginação e cobertura por raiz |
| GET | `/api/files/history?rootId=UUID&path=relativo` | Histórico observado do arquivo e indicação de limite |
| GET | `/api/files/:id` | Conteúdo elegível, diff, histórico, vínculos e sessões candidatas |
| POST | `/api/evidence-links` | `{revisionId,sessionId}` registra associação explícita |
| GET | `/api/commits/:id` | Commit consultável a partir de uma revisão |
| GET | `/api/sessions/:id` | Inclui revisões relacionadas e grau de confiança |

Todas exigem autenticação. A associação por cookie exige Origin local, como as demais mutações. Filtros seguem `[from,to)` e a ferramenta do observador é `files`; não se atribui automaticamente uma gravação ao OpenCode/Claude.

Migrações aditivas: `007_files.sql` e `008_evidence.sql`. Tabelas principais: `file_revisions`, `file_contents`, `tracked_files`, `file_access`, `file_scans`, `file_journal`, `file_remote_sync` e `evidence_links`.

## Exportação

CSV/PDF continuam incluindo tempos, sessões, commits e metadados dos arquivos dos commits. Revisões observadas e seus diffs são consultáveis no painel, mas ainda não entram no relatório; a integração completa continua em T21.

## Verificação

`tests/collectors/files.test.ts` cobre save atômico, debounce, renome, exclusão, política, binários, tamanho, deduplicação, raiz substituída, lacunas e coordenação entre observadores. `evidence.test.ts` cobre concorrência, precedência explícita, relação inferida com commit e conteúdo removido. `tests/remote/files.test.ts` cobre integridade, replay, cursor atômico, paginação e revogação.

`tests/integration/files-local.test.ts` verifica autenticação, escopo, paginação, listas sem conteúdo, diffs, associação e export CLI sem varredura. `tests/e2e/project-history.spec.ts` percorre sessão → revisão → diff → commit, volta à sessão e confere renome, conteúdo escapado e filtros em desktop/mobile.

Rodada completa: **27 unitários + 10 de integração + 10 E2E = 47 testes**, sem skips; typecheck e build também verificados. Capturas temporárias em `test-results/project-history-*/`.
