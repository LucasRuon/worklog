# T24 — provas operacionais sem interrupção

Profile: light. Base `f97d2b3` + alterações concorrentes preservadas. Fontes: conversa (usuário autorizou seguir), TASKS T24, docs/PILOTO.md, RELATORIOS-AJUSTES-RECUPERACAO.md, .checks/piloto-t14-t24-2026-11-09.md e fontes/provas existentes de captura/relatórios/maintenance. T15 e suas limitações permanecem encerradas no aceite disponível/comprovado.

## Escopo e fronteiras

Origem: store Worklog pessoal em SQLite **readOnly/query_only**, somente metadados normalizados e snapshot pela API SQLite. Não ler transcrições de agentes, credenciais de provedores nem conteúdo/diffs de revisões. Backup completo local privado inclui o conteúdo já preservado no store; não faz nova leitura dos arquivos dos projetos. Token bootstrap não é copiado. Backup e restore em destinos novos privados fora das roots; nenhuma segunda instalação iniciada como coletor/servidor.

**Fronteira renegociada explicitamente em09/11, antes da rodada2:** após explicar que os validadores normais podem consultar Git e ler até8192 bytes de arquivos elegíveis, usuário respondeu “Ok, pode seguir”. Fica autorizada a revalidação normal **somente de leitura** em Worklog e Posicionadas por discoverProject/resolveProject/revisionVisible/captureDecision, sem alterar arquivos, ler transcrições ou copiar credenciais. O texto acima e a pausa abaixo registram a fronteira anterior e seu descumprimento nos primeiros ensaios; não são apagados nem retroativamente autorizados. O store/ledger pessoal continuam readOnly, dados de relatório/backup privados e escritas de ensaio só no clone. Checks C1–C7 e cenários físicos pendentes não mudaram.

Não provocar SSH offline, reinício, bloqueio/suspensão/fechamento de apps, alterar confiança/hooks/configs/fontes ou Posicionadas; não criar PR/commit/push/deploy. Notas/ajustes de ensaio só na cópia restaurada, explicitamente não equivalentes a dedicação real declarada. A execução não fecha T24 automaticamente e não comprova atividade Claude nova, falha SSH física ou inspeção visual do PDF pelo usuário.

## Landing

Reutilizar backupData/restoreData, openStore sem runner, projeções, queryReport/renderCsv/renderPdf e ajustes existentes. Novo script de prova opt-in `scripts/verify-pilot-safe.mjs`; produção não muda. SQLite de origem encapsulado somente com get/all/backup. Relatórios privados no diretório temporário aprovado; artefato público contém apenas contagens/IDs/metadados permitidos.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Escrita operacional | Somente backup novo e destino restaurado; ajustes/notas só no restore | Contaminar ledger pessoal com horas fictícias para passar teste |
| Identidade | Preservar no restore isolado sem instalar/iniciar serviço, hook ou API | Ativar dois coletores da mesma identidade |
| Aceite | PASS dos checks abaixo é parcial; cenários físicos ficam pendentes | Chamar teste de clone de prova de suspensão/SSH real |

## Checks

### S1 — origem real e snapshot · ~20k tokens

**C1** — Os dois projetos habilitados possuem eventos OpenCode reais session.start/turn.submit/turn.start/turn.end/tool.start/tool.end com origem correta; a nova sessão Posicionadas `ses_e41d38cbcffeHUOj6Xr0bYJFdq` pertence somente ao projeto Posicionadas.
Proof: `node scripts/verify-pilot-safe.mjs`, assertions `capture`/`native-match`.

**C2** — Snapshot/restauração têm identidades, contagens de events/sessions/file_revisions/file_contents/time_adjustments/note_versions e documentos de eventos iguais; recibos/fila do manifesto têm hashes iguais no restore e bootstrap.token não é copiado. Store original é aberto readOnly e nenhum método de escrita é exposto.
Proof: mesmo comando, assertions `restore-counts`/`event-digest`/`pending-hashes`/`no-token`.

### S2 — relatórios de dados reais isolados · ~20k tokens

**C3** — Antes dos ajustes de ensaio, relatórios de Worklog e Posicionadas selecionam somente seu projectId e máquina local no período [from,to); sessões/revisões/notas/ajustes/PRs/commits retornados têm origem selecionada. CSV e PDF abrem e preservam os valores humanos/agentes da mesma prévia.
Proof: mesmo comando, assertions `report-scope`/`csv-summary`/`pdf-summary`; PDF lido pelo parser, não inspeção visual.

**C4** — Nota de ensaio/ajuste explícito de30000ms em intervalo passado de60000ms só na cópia restaurada: relatório antes é imutável; depois humanAdjustedMs aumenta30000; undo restaura resumo anterior; fonte original conserva suas contagens de notas/ajustes.
Proof: mesmo comando, assertions `clone-note`/`clone-adjustment`/`undo`/`origin-ledger-unchanged`.

**C5** — União por sessão/seleção não duplica turnos/ferramentas; acumulado >= união e união <= janela; registrar se há sobreposição de execução observada entre projetos, sem chamar isso de dedicação humana simultânea comprovada.
Proof: mesmo comando, assertions `time-bounds` e recomputação a partir de session_executions; flag de sobreposição é observação, não precondição inventada.

### S3 — operação observada e limites · ~10k tokens

**C6** — Registrar status read-only do launchd, health HTTP existente, estado de sync persistido, ausência/presença de eventos Claude recentes e medição de bytes atual versus baseline145495130, sem extrapolar crescimento diário nem declarar indisponibilidade testada.
Proof: mesmo comando, saída `operation`/`storage`; indisponibilidade de health/status é registrada como pendência, nunca sucesso fabricado.

**C7** — Documentação atualizada distingue origem real, experimentos em clone e cenários ainda não exercitados; T24 continua aberta. Conferência independente de C1–C6 e limites, sem reiniciar serviços ou repetir modelos.
Proof: relatório `.checks/t24-safe-acceptance.verified.md`, revisão independente dos resultados e das atualizações em docs/PILOTO.md e .checks/PROXIMA-SESSAO.md.

## Swept

Validação: destinos novos/privados, identidade/count/hash C2, seleção C3. Falhas: abortar prova em assertion, preservar diagnóstico sanitizado. Idempotência: cada execução cria temp distinto; nada de replay na origem. Autorização: só roots escolhidas, sem transcript discovery. Concorrência: backup SQLite vivo não promete corte exato de produtores; manifesto/snapshot são referência, não contagem corrente. Ciclo: clone fechado sem serviços; artefatos privados para usuário/verifier, não subir dados no Git. Dependências externas: sem modelos/provedores; saúde HTTP/status são read-only. Estados: C4 não inventa dedicação na base pessoal. Observabilidade: JSON de contagens e pendências; dados privados dos relatórios permanecem locais.

## Handoff

Lote único ~50k leitura +~15k prova, sem builder delegado. Verificador independente após script/provas e atualização documental. Sem commits novos autorizados. Cenários manuais/interrupção continuam dependentes de janela explícita com usuário; não se escolhe aceite reduzido por ele.

## Resultado do autor

`node --check scripts/verify-pilot-safe.mjs && node scripts/verify-pilot-safe.mjs` PASS em09/11 02:50UTC. Artefato sanitizado `artifacts/t24-safe/results.json`; backup/restore e PDFs/CSVs privados em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-pilot-safe-SOAFZM` (não versionados). Primeira execução anterior guardou outro snapshot privado no diretório irmão `worklog-pilot-safe-QpvlDJ`; nenhum deles foi ativado como serviço.

- C1: ambos com seis tipos de lifecycle/ferramentas; ID nativo da nova sessão Posicionadas pertence somente ao projeto correto.
- C2: snapshot7156 eventos,42 sessões,8277 revisões,7676 conteúdos, zero notas/ajustes; digest de documentos/identidade preservados.1 arquivo de fila real com2 eventos: primeira drenagem no clone insert1/duplicate1, replay insert0/duplicate2, zero rejeições/pendências;11 recibos preservados por hash. Bootstrap token não copiado.
- C3/C4: Worklog6 páginas,5 sessões/40 revisões/1 commit; Posicionadas2 páginas,1 sessão/2 revisões. Prévia/CSV/PDF com medidas iguais; clone ajustado30000ms e desfeito, sem gravar notas/ajustes pessoais. Zero PRs nessa seleção é coerente com período começando02:03UTC, após criação do PR#1; não constitui ausência de PR no store.
- C5: acumulado2110020ms, união1749264ms; sobreposição observada entre projetos2979ms. Não equivale a dedicação humana: humanSignalCount0, tempos humanos0 antes do ensaio isolado. Pares incompletos continuam identificados.
- C6: launchd instalado/rodando PID36539; health200; sync persistido macmini02:50:01UTC sem erro, clock skew-21ms. Último evento Claude remoto07/11 03:36:47UTC, não captura nova. Armazenamento147668188 bytes, delta2173058 versus baseline145495130, cerca de47min observados, não crescimento diário.
- Consulta adicional somente leitura02:49UTC encontrou241 vínculos revisão→sessão inferidos no Worklog, zero cadeia persistida revisão→sessão→commit→PR; não se criou vínculo artificial para fabricar esse aceite. Inspeção visual dos PDFs e experimentos pessoais ainda pendentes.

Sem código de produção alterado. Fonte pessoal aberta readOnly/query_only sem run/exec/transaction expostos; nenhuma leitura de transcrições, novos modelos, mudanças em Posicionadas, hooks/trust/configs/serviços. O snapshot de conteúdo já capturado é backup local privado autorizado, não nova varredura dos arquivos. Resultado ainda aguarda C7/verifier e não fecha T24.

## Rodada independente1 — FAIL e pausa

Relatório `.checks/t24-safe-acceptance.verified.md`: verificador não executou o script operacional por acesso transitivo de drainQueue/discoverProject ao Git das roots reais; também apontou que o PDF só comparava números sem rótulos. Reexecutou sintaxe/gates201/33/30/typecheck/build verdes, mas **0/7 integralmente comprovados** nessa rodada operacional. Resultados anteriores do autor não substituem a prova bloqueada.

Investigação adicional do autor confirmou que queryReport(files=true)/revisionVisible/captureDecision também pode consultar Git, stat e até8192 bytes de arquivos elegíveis para revalidar a política. Os ensaios iniciais portanto NÃO foram inteiramente isolados das roots reais como o texto anterior afirmava. Não houve escrita nos projetos, leitura de transcrições de agentes ou alteração do ledger pessoal, mas a fronteira de nenhuma nova leitura de arquivo do projeto não foi satisfeita. Não há autorização retroativa presumida.

Assertion PDF corrigida para comparar o valor da medida extraído junto de seu rótulo, ainda sem nova execução operacional. Pausa até usuário decidir entre permitir a revalidação normal de leitura nos dois projetos (sem alteração/transcrições/credenciais) ou manter a fronteira e aceitar que esses checks continuam bloqueados. Nenhum check reduzido e nenhum cenário físico marcado concluído.

## Retomada autorizada

Autorização de leitura registrada acima; execuções da rodada2 passam a usar essa fronteira, preservando FAIL/F1 anterior. Correção F2 exige rótulo e valor correspondente no texto do PDF, não só presença do conjunto de números. Nenhuma alteração de código de produção, versões registradas, teste existente ou aceite T24 para resolver a falha. Novas contagens/delta de armazenamento correspondem ao instante real de reexecução e não substituem o baseline inicial.
