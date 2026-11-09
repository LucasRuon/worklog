# Relatórios, ajustes e recuperação — T21/T22/T23

Implementação local em 07/11, verificação independente concluída em **08/11/2026: PASS**. T20 retomada e painel completo verificado; este guia cobre T21/T22/T23. Relatório dos 33 checks: `../.checks/continuacao.verified.md`. Piloto real prolongado permanece T24; serviços pessoais não foram redeployados.

## Relatório completo

Exportação agora permite escolher sessões, commits, revisões/arquivos, notas, PRs e diffs elegíveis. Arquivos são independentes da seleção de commits. Diffs exigem a seção de arquivos.

- Seleção não vazia de projetos e período `[from,to)` continuam obrigatórios. Máquinas, ferramentas e fontes usam o mesmo `ReportFilter` das consultas.
- Prévia e CSV/PDF consomem o **mesmo ReportData congelado**, incluindo versão do ledger. Edição posterior de nota/ajuste não altera o arquivo da prévia já gerada.
- Mudança de política/pausa de raiz/retenção que revogue conteúdo invalida a prévia (`REPORT_EXPIRED`). Gere outra antes de baixar.
- CSV mantém BOM UTF-8, acentos, aspas, quebras de linha e neutralização de fórmula após espaços iniciais. Notas são texto, não HTML executável.
- PDF inclui paginação, distinções de tempo, proveniência, notas, revisões/diffs, snapshots de PR e auditoria de ajustes. PR sem check não é aprovação; cache desatualizado continua identificado.
- Diffs: até 100 revisões por prévia, prazo de geração de 1500 ms e limites existentes por patch (512 KiB/10 mil linhas). Limite excedido retorna erro explícito, não diff silenciosamente truncado.
- Limites gerais: 10 mil registros por seção e 16 MiB por ReportData. Reduza período/seleção para relatórios maiores.

## Notas e classificação

Uma nota pertence a um alvo conhecido (projeto, sessão, revisão, commit ou PR) e conserva versões append-only. Classificações: contexto, trabalho, pendência e verificação **declarada pelo usuário**; isso não transforma a nota em um teste executado pelo sistema.

`occurredAt` é a data declarada da nota; `createdAt` é o instante de persistência. O relatório usa a versão atual cuja data declarada está no período e cujo projeto está selecionado. A versão congelada em uma prévia permanece inalterada. Notas/ajustes manuais têm origem local `focus`; filtros exclusivos de outra ferramenta/fonte podem excluí-los.

Texto até 8192 caracteres, classificação validada e revisão otimista: edição concorrente retorna `409 NOTE_CHANGED`. Limpar o texto grava nova versão, sem apagar a anterior.

## Dedicação corrigida

O ajuste **substitui** a dedicação humana do intervalo global, atribuindo-a ao projeto escolhido. Não se soma à estimativa original no mesmo trecho.

- Informar início/fim em UTC, duração corrigida e motivo.
- Somente intervalo passado; `0 <= nextMs <= duração do intervalo`.
- Outro ajuste ativo sobreposto retorna `409 ADJUSTMENT_OVERLAP`, inclusive em outro projeto.
- Para reatribuir, desfaça o ajuste anterior e registre o novo. Desfazer grava uma compensação ligada ao original; eventos e registros anteriores são imutáveis.
- A revisão é global; alteração concorrente retorna `409 ADJUSTMENT_CHANGED`.
- Cortes parciais distribuem a quantidade explicitamente corrigida proporcionalmente ao intervalo. O cálculo inteiro por BigInt mantém conservação de milissegundos entre períodos adjacentes.
- Painel/relatório distinguem `humanEstimatedMs`, `humanAdjustedMs` e `unassignedHumanMs`. Nenhuma dessas medidas é automaticamente cobrança; execução de IA não é somada como trabalho humano.

## Configuração e orçamento

Integrações expõe configuração persistida e controles de raízes. Defaults: janela humana 5 min, idle 5 min, retenção 30 dias, SSH 15 s, orçamento 1 GiB. Limites configuráveis: idle/janela 1–60 min; retenção 1–365 dias; SSH 1–300 s; orçamento 1 MiB–1 TiB. Backoff SSH continua limitado a 5 min.

Exclusões são paths relativos às raízes, uma por linha, sem `..`; não habilitam .env, chaves ou outros dados negados. A política é reaplicada antes da captura e nas consultas/exportação. Reenvio de cadastro não desfaz raiz pausada.

Pausar a fonte interna de arquivos interrompe a coleta local; pausar `focus` impede novos sinais/probes. O comando explícito de pausar dedicação continua permitido para encerrar uma janela já iniciada. Histórico e backlog não são apagados.

O orçamento é um limite de proteção para **novo conteúdo volumoso**, não uma promessa de tamanho máximo absoluto: eventos/metadados/fila continuam sendo preservados. Há alerta em 80%, uso de arquivos medido e SQLite alocado. WAL e páginas livres podem manter o tamanho físico mesmo após retenção. Aumente o orçamento/libere espaço antes de recuperar a captura; alterações de configuração forçam reconciliação de fingerprints.

### Amostra real medida

No piloto legado do Worklog, período 06/11 13:55–14:05 UTC, um store temporário importou **46/46 IDs**, replay zero, sem eventos humanos/revisões fabricados. Amostra desta rodada: **564.926 bytes antes**, **4.665.686 bytes após** (inclui WAL), **487.424 bytes de SQLite alocado**, **2416 ms** para importação/replay/resumo. A enumeração leu 1496 registros nativos de metadados na amostra.

É uma medição delimitada, **não crescimento diário nem garantia de throughput**. Uma tentativa anterior atingiu o prazo de 120 s; o processamento foi ajustado para ignorar registros fora do período antes de autorizações repetidas de filesystem, mantendo autorização da sessão nativa antes de ler campos de mensagens/ferramentas. A nova amostra terminou e as regressões de histórico passaram. Medição de um dia permanece no piloto T24.

## Retenção

O coletor atualizado e o servidor verificam a retenção diariamente. Pode ser executada explicitamente:

```sh
npm run cli -- maintenance retention
```

Remove apenas conteúdo intermediário **anterior** ao corte. Mantém metadados das revisões, eventos brutos, cursores, notas/ajustes, conteúdo recente e último conteúdo compartilhado de arquivos. Hashes deduplicados não são apagados enquanto houver referência protegida. Diff perdido retorna `retention`. Filas e eventos não sincronizados não são purgados para liberar espaço.

## Backup consistente

Use um destino novo, privado, fora das raízes monitoradas, com espaço livre suficiente:

```sh
npm run cli -- maintenance backup --output "/caminho/backup-novo" --data-dir "/caminho/dados-worklog"
```

O backup usa a API SQLite (incluindo dados que estavam no WAL), não cópia direta do banco ativo. O conteúdo de revisões já está no SQLite. Também preserva arquivos de fila normalizados e recibos Codex; arquivos inválidos são recusados, temporários/quarentena não são tratados como entradas válidas.

A fila é copiada antes do snapshot SQLite e recibos imutáveis depois, conservando dados já duráveis e os timestamps necessários ao replay. O manifesto registra SHA-256, identidade, contagens e hashes das entradas auxiliares. O token de bootstrap do navegador não é copiado. O destino existente é recusado.

Para um corte operacional exato, encerre produtores/coletores antes do backup e conserve o diretório original até validar a recuperação. A captura pode produzir novos eventos depois do início do snapshot; não remova a origem presumindo que esses eventos posteriores estejam incluídos.

## Restaurar sem sobrescrever

Pare o serviço que usará os dados e restaure em diretório novo:

```sh
npm run cli -- service stop --data-dir "/caminho/dados-worklog"
npm run cli -- maintenance restore --input "/caminho/backup-novo" --data-dir "/caminho/dados-recuperados"
```

- Digest, identidade e contagens são conferidos. Destino ocupado/raiz monitorada é recusado.
- Um marcador impede abrir uma restauração incompleta (`RESTORE_INCOMPLETE`). Falha normal remove somente o destino novo criado pela operação, sem tocar na origem.
- Conteúdo, histórico e identidade da instalação são preservados; caminhos dos coletores internos e leases são ajustados ao novo destino.
- Não execute duas cópias dessa mesma identidade como coletores simultâneos. Reconfigure serviço/hooks/plugins para o diretório recuperado antes de retomar; a restauração não instala nem inicia serviços automaticamente.
- Código acionável: `BACKUP_DISK_FULL` (liberar espaço), `BACKUP_PERMISSION_DENIED` (permissões), `BACKUP_IO_FAILED` (destino/IO), `BACKUP_INTEGRITY_FAILED` (não usar esse backup), `RESTORE_TARGET_OCCUPIED` (escolher destino novo).

Configuração CLI:

```sh
npm run cli -- maintenance config
npm run cli -- maintenance config --config '{"revision":0,"retentionDays":45}'
npm run cli -- maintenance pause --root UUID
npm run cli -- maintenance resume --root UUID
```

Use a revisão retornada por `maintenance config`; a revisão zero no exemplo só vale para configuração ainda não alterada.

## Endpoints novos

| Método | Rota | Função |
|---|---|---|
| GET / POST | `/api/notes` | Nota atual por target/lista filtrada e nova versão |
| GET / POST | `/api/adjustments` | Ledger filtrado/revisão global e novo ajuste |
| POST | `/api/adjustments/:id/undo` | Compensação auditável |
| GET / PATCH | `/api/configuration` | Configuração, uso medido e atualização com revisão |
| PATCH | `/api/projects/roots/:id` | Pausar/retomar raiz sem apagar dados |
| POST | `/api/retention` | Retenção pelo relógio atual do servidor |

Autenticação/Host/Origin existentes continuam obrigatórios. Backup/restore são CLI, não upload arbitrário pelo navegador. Não houve atualização dos serviços pessoais/host remoto nesta rodada.

## Provas e execução futura

`adjustments.test.ts`, `full-report.test.ts`, `recovery.test.ts`, `maintenance-cli.test.ts`, `adjustments.spec.ts` e `configuration.spec.ts` cobrem a implementação. CSV/PDF foram baixados/extraídos e as capturas de relatório/configuração desktop/mobile inspecionadas; detector mecânico não apontou novos problemas.

O rascunho T20 e o cenário controlado `full-flow.spec.ts` devem ser retomados **na outra sessão**, conforme pedido do usuário. O piloto de um dia e o verificador independente não foram executados aqui.
