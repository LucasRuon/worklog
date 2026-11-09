# T24 — etapa assistida pelo usuário

Profile light. Base f97d2b3 + provas operacionais não commitadas; TASKS T24 e conversa vinculantes. Em09/11 o usuário escolheu **“Sim, agora”** para registrar dedicação real no painel, bloquear/desbloquear o Mac e fechar/reabrir terminal do OpenCode. O agente só orienta e consulta metadados; não executa essas ações pelo usuário. Não inclui suspensão, SSH offline/restart, modelos, leitura de transcrições/credenciais, alteração de Posicionadas, commit/push/deploy ou redução de aceite.

## Landing e fronteiras

Sinal humano só por ação real do usuário no painel, nunca evento sintético do agente. Coletor pessoal permanece rodando; nenhuma inferência de dedicação humana a partir de tempo de agente. Não fechar o terminal desta conversa nem uma tarefa em execução; somente terminal que o usuário considerar seguro. Bootstrap/login pelo fluxo existente, nenhum token exposto.

Baseline somente leitura às09/11 13:32:51UTC (10:32:51BRT): maxRow7791, fonte focus com focusObservation=observed; roots Worklog/Posicionadas habilitadas, launchd PID36539 instalado/rodando; ledger pessoal notas0/ajustes0. Último sinal humano existente06/11; últimos lock08/11 e pause09/11 00:46UTC não contam como novas provas. Artefato privado `artifacts/t24-safe/manual-baseline.json`.

## Checks

**M1** — Ação do usuário “Registrar dedicação” em Worklog cria human.interaction/explicit após o baseline com cwd/projeto Worklog e fonte local focus. Nenhum turno IA é transformado em sinal humano.
Proof: confirmação do usuário + consulta readOnly dos eventos focus depois do maxRow/at do baseline, relacionando event_projects e project_roots.

**M2** — Bloqueio físico pelo usuário por pelo menos20s seguido de desbloqueio tem evento machine.idle/reason=lock na amostragem e encerra a janela humana no cálculo, sem prolongar durante bloqueio ou duplicar entre projetos. Caso o probe não observe lock, registrar FAIL/pending, nunca inferir de inatividade.
Proof: antes/depois e horário declarado pelo usuário, evento reason exato e deriveTime em snapshot/restauração posterior, comparado com limite de5min e pausa observada. Só a confirmação verbal não prova o coletor.

**M3** — Terminal seguro do OpenCode fechado/reaberto pelo usuário não encerra o coletor launchd; novo evento/sessão do uso normal depois da reabertura chega à fonte/projeto corretos. Não iniciar modelo para gerar prova pelo agente. Ausência de tarefa/evento posterior deixa captura pendente, não sucesso presumido de serviço rodando.
Proof: estado do serviço antes/depois, confirmação de fechamento/reabertura e metadados do evento nativo/live correspondente. Não atribuir a estes fatos o teste de SSH/suspensão.

## Swept e execução

Validação/estado: tipos, origem e horários acima. Falhas: nenhum timeout vira sucesso; manual indisponível => pendência. Idempotência/concorrência: coletor permanece único; consultas readOnly; não drenar fila pessoal por este roteiro. Autorização: só ações especificadas realizadas pelo usuário, por vez. Ciclo/observabilidade: artefatos de metadados privados, relatório sem conteúdo; ledger original recebe apenas os sinais que o próprio usuário registrar legitimamente. Dependências: painel/launchd existentes; não instalar/reiniciar para esconder falha. Registros append-only no checklist, T24 aberta até restantes aceites comprovados. Verificador independente deve conferir resultados, não repetir bloqueio ou fechar apps.

## Estado

Baseline pronto. Próxima ação: usuário abrir painel Visão geral, selecionar Worklog em “Projeto em que estou trabalhando” e clicar uma vez em “Registrar dedicação”; retornar confirmação. Bloqueio e terminal ainda não executados/confirmados.

### M1 — primeira conferência13:35UTC

Usuário respondeu “Registrado”. Consulta readOnly depois do baseline encontrou1 human.interaction/explicit, fonte focus local, ocorrido09/11 13:34:46.654UTC, **cwd/projeto Posicionadas**, ID63700e1a-17a0-48aa-8fc2-b6f7b882ac59; nenhum sinal Worklog novo. Artefato privado `artifacts/t24-safe/manual-m1.json`: passed=false/matchedSignals0 para o valor de M1. Não reatribuir o evento nem reduzir check. Necessário perguntar qual projeto estava efetivamente selecionado antes de classificar escolha do usuário versus defeito de interface. Bloqueio/fechamento de terminal ainda não orientados.

### M1 — projeto corrigido pelo usuário13:36UTC

Usuário esclareceu “Selecionei errado” e registrou novo sinal em Worklog. Conferido human.interaction/explicit em13:35:40.383UTC (10:35:40BRT), ID4670ae01-2d71-4625-994f-a38c392ed4a9, fonte focus local e cwd/projeto Worklog corretos. Artefato privado `artifacts/t24-safe/manual-m1-corrected.json`: passed=true/matchedSignals1. Primeiro evento Posicionadas preservado, sem reatribuição ou defeito de UI alegado. M1 comprovado pelo autor; verificação independente pendente. Próxima etapa autorizada: bloqueio físico por20s pelo próprio usuário e retorno, sem fechar terminal ainda.

### M2 — bloqueio observado e corte exato13:38UTC

Após a orientação de bloqueio por20s, usuário respondeu “voltei”. Coletor observou machine.idle/reason=lock em13:37:13.203UTC (10:37:13BRT), IDaed56603-3b77-4b2b-a412-b9821445c4d0; segunda amostra lock em13:37:16.233UTC. Launchd permaneceu instalado/rodando com PID36539; focusObservation=observed. Artefato privado `artifacts/t24-safe/manual-m2.json`. As duas amostras não medem, sozinhas, a duração total do bloqueio físico.

Prova de cálculo às13:38:52.822UTC: snapshot pela API SQLite com origem readOnly/query_only, projeção somente em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-manual-m2-EmOmFP/data`. No período [13:35:40.383,13:38:52.515), deriveTime retornou Worklog/global **92820ms (1m32.820s)**, Posicionadas0; no recorte começando no primeiro lock, dedicação estimada **0ms**. Assertions de igualdade exata com sinal→lock, soma entre projetos e limite de300000ms passaram. Artefato privado `artifacts/t24-safe/manual-m2-time.json`: passed=true. Não inferir dedicação de atividade IA nem contabilizar novamente as amostras de lock. M2 comprovado pelo autor no recorte; verificação independente pendente.

Estado vigente: M1/M2 conferidos pelo autor; M3 ainda não executado. Próxima ação: orientar somente fechamento de um terminal OpenCode seguro e ocioso em Posicionadas, nunca desta conversa ou de tarefa em execução; depois orientar reabertura e conferir serviço/captura. Suspensão/SSH permanecem fora desta etapa.

### M3 — alternativa sem interromper Posicionadas

Usuário informou tarefa em execução no OpenCode de Posicionadas; orientado a não fechar nem interromper. Como a tarefa demoraria, pediu alternativa. Foi orientado a abrir outra janela de terminal com `opencode /Users/lucasruon/Downloads/Sistemas/Worklog`, sem enviar mensagem ou retomar sessão existente; confirmou “Abriu”. O teste passa a usar esse cliente ocioso separado em Worklog, preservando o critério de continuidade/captura no projeto correto e sem alegar fechamento do cliente ativo de Posicionadas ou encerramento de todo o serviço OpenCode.

Baseline antes do fechamento às14:48:04.354UTC: maxRow8757; coletor Worklog launchd instalado/rodando com o mesmo PID36539. Consulta do store readOnly/query_only, sem reinício, modelo ou escrita no ledger. Artefato privado `artifacts/t24-safe/manual-m3-before-1794235684369.json`. Próxima ação: usuário fechar somente a nova janela ociosa; reabertura e captura posterior ainda pendentes. Abrir/fechar cliente sem novo evento nativo não basta para concluir integralmente M3.

### M3 — janela fechada, coletor preservado14:48:45UTC

Usuário confirmou “fechei”. Consulta readOnly/query_only às14:48:45.002UTC encontrou launchd instalado/rodando com PID36539, igual ao baseline anterior ao fechamento; maxRow8785. Artefato privado `artifacts/t24-safe/manual-m3-closed-1794235725003.json`: sameCollectorPid=true. Isto comprova continuidade observada do coletor após o fechamento declarado da janela ociosa, não reabertura nem captura nativa dessa janela; crescimento global de eventos não é atribuído a ela. Próxima ação: usuário reabrir OpenCode em Worklog na janela separada, sem retomar tarefa ativa ou enviar prompt. Posicionadas permanece intocada; M3 integral ainda pendente.

### M3 — reabertura confirmada14:49:52UTC

Usuário confirmou “reabriu”. Consulta readOnly/query_only às14:49:52.953UTC encontrou coletor launchd instalado/rodando com o mesmo PID36539. Artefato privado `artifacts/t24-safe/manual-m3-reopened-1794235792954.json`: sameCollectorPid=true. Agregados OpenCode/Worklog após o baseline contêm turnos/ferramentas, mas nenhum session.start; esta própria conversa também gera eventos Worklog, portanto os agregados não comprovam captura da janela reaberta e não são atribuídos a ela.

Fechamento/reabertura declarados e continuidade observada do coletor estão comprovados no recorte; captura nativa específica da janela reaberta continua pendente até uso normal identificável. Não pedir turno de modelo artificial para preencher a lacuna, não iniciar modelo nem fabricar evento. Usuário pode usar essa janela em uma próxima tarefa real e avisar para conferência de metadados; nenhuma interrupção de Posicionadas é necessária. M3 parcial, T24 aberta.

### M3 — uso real de revisão de PR capturado15:50:57UTC

Usuário informou que executou revisão do PR aberto, sem ter nova task para iniciar. Revisão é uso real válido para M3; o critério não exige implementação ou alteração de arquivos. Consulta somente de metadados do store readOnly/query_only identificou nova sessão raiz OpenCode `ses_e3f00d7ccffe06G6ZIjf6rz0Mb`, distinta desta conversa `ses_e41f85b2fffeeqWj0qav4cljwv`, sem parentSessionId, cwd/projeto Worklog e fonte automatico-v2. session.start em15:48:29.954UTC (12:48:29BRT), recebido15:48:30.126UTC, evento65333f1d-7c0f-5a2c-80cc-ec5c37614166, posterior à confirmação de reabertura14:49:52.953UTC.

Recorte até15:50:46.146UTC contém1 session.start,1 turn.submit,9 turn.start,16 tool.start,16 tool.end e8 turn.end. Assertions de projeto/cwd/fonte, sessão raiz nova posterior à reabertura e captura de turno/ferramenta passaram. Coletor launchd permanece rodando com PID36539, igual ao baseline antes do fechamento. Artefato privado `artifacts/t24-safe/manual-m3-capture-1794239457547.json`: passed=true. O propósito de revisão vem da confirmação do usuário; nenhuma transcrição foi lida, modelo iniciado por este agente ou conclusão da revisão presumida. Não transformar contagens em cobertura exaustiva ou dedicação humana.

Estado vigente: M1/M2/M3 comprovados pelo autor no escopo assistido (fechamento/reabertura de cliente ocioso separado, não cliente Posicionadas ativo nem serviço OpenCode inteiro). Verificação independente ainda pendente; T24 permanece aberta para os demais critérios. Não é necessário iniciar outra task para repetir M3.
