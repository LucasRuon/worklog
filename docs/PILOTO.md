# Piloto completo — estado pendente

## Estado vigente — provas seguras em09/11/2026

**Retomada autorizada:** usuário aprovou explicitamente a revalidação normal de leitura Git/arquivos elegíveis nos dois projetos após a pausa de auditoria. Store/ledger pessoal seguem somente leitura e ajustes só no clone, sem modelos, transcrições, credenciais, reinstalação ou reinício de serviços. A rodada2 reexecutará a prova com comparação PDF rótulo→valor corrigida; FAIL inicial e fronteira anterior continuam documentados, sem apagar evidências ou alterar os checks. T24 não é encerrada por essa autorização.

**Atualização de auditoria:** rodada independente1 em `.checks/t24-safe-acceptance.verified.md` retornou FAIL,0/7 operacionalmente comprovados: o script pode consultar Git/arquivos das roots reais via validadores existentes, contrariando o isolamento de leitura prometido. Os resultados do autor abaixo são cronológicos, não aceite independente. Gates técnicos201/33/30/typecheck/build foram reexecutados e passaram. Novas execuções operacionais desse caminho estão pausadas até autorização explícita para revalidação de leitura normal ou outra solução compatível com a fronteira; nenhum check foi enfraquecido. T24 permanece aberta.

**T24 continua aberta; não é preciso reiniciar o uso já observado.** Worklog e Posicionadas têm atividade real e agora ambos têm captura OpenCode comprovada. A sessão Posicionadas `ses_e41d38cbcffeHUOj6Xr0bYJFdq`, criada08/11 23:39BRT, foi recebida com28 eventos às23:39:37 (contagens posteriores cresceram). As sessões Posicionadas anteriores não receberam recuperação histórica por suposição. Codex mínimo nos dois projetos e PR#1 real já foram comprovados; não reinstalar/confiar novamente por causa dos roteiros cronológicos abaixo.

Prova opt-in `node scripts/verify-pilot-safe.mjs` em09/11 02:50UTC usou origem pessoal **readOnly** e backup/restore novos privados, sem coletores/servidores na cópia. Snapshot7156 eventos/42 sessões e11 recibos: hashes/identidade/contagens preservados; fila real recuperou1 evento e replay0. CSV/PDF de só Worklog ou só Posicionadas, com período/máquina, foram gerados e lidos por parser, com os mesmos valores da prévia. Nota/ajuste30000ms/compensação ocorreram **somente na cópia**, sem declarar dedicação fictícia na origem. Isso não comprova edição pessoal de nota/ajuste, inspeção visual ou fechamento da cadeia real de evidências.

Execução simultânea entre projetos observada:2979ms de sobreposição nesse snapshot. Não comprova simultaneidade de dedicação humana; a janela selecionada não tinha sinal humano e estimativa0 é intencional. Launchd rodando, health200, sync macmini recente sem erro; último evento Claude remoto continua07/11. Baseline vigente do piloto145495130 bytes; medição02:50UTC147668188, delta2173058, **não crescimento de um dia**.

Checklist `.checks/t24-safe-acceptance.md`, relatório independente `.checks/t24-safe-acceptance.verified.md` após conferência e resultado local ignorado pelo Git `artifacts/t24-safe/results.json`. Backup/restore/PDF/CSV reais ficam em diretório privado temporário apontado no resultado, fora das roots. O script lê dados reais e gera backups privados: **não executar automaticamente como regressão**. Não lê transcrições ou inicia modelos.

Faltam: bloqueio/suspensão físicos, terminal fechado, falha/reconexão SSH real autorizada, conferência da dedicação humana, cadeia real arquivo→revisão→sessão→commit→PR, PDF visual/nota/ajuste pessoais e medição final do período acordado. Essas ações não foram presumidas autorizadas só por iniciar as provas seguras. A janela de24h registrada na conferência é procedimento de observação, não limitação técnica nem tradução obrigatória de “um dia de uso”; qualquer mudança de aceite precisa ser explícita, sem retroagir baseline/medição.

Os registros abaixo são cronológicos: estados antigos de PR ausente, confiança Codex ou captura pós-recarga pendentes foram superados pelas provas posteriores.

**T24 não concluída.** T20 retomada e verificação independente técnica concluídas em 08/11/2026: **PASS, 33/33 checks**. `tests/e2e/full-flow.spec.ts` passou em desktop/mobile: seleção → evidências → ajuste → CSV/PDF → backup/restore. É um ensaio controlado; não comprova um dia de uso real.

## Pré-requisitos da próxima sessão

### Preparação pessoal em 08/11/2026

- Usuário escolheu **Worklog** (`/Users/lucasruon/Downloads/Sistemas/Worklog`) e **Posicionadas** (`/Users/lucasruon/Developer/Posicionadas`). As duas raízes estão habilitadas em projetos distintos; Posicionadas foi cadastrado pela CLI, sem ampliar os workspaces autorizados.
- Atualização pessoal OpenCode autorizada e executada por `automation install`, no store e wrapper originais. Fonte `4c30691f-a389-5098-86a7-12636c8e4e33` preservada, habilitada, versão **2.2.6**. Isso comprova instalação, ainda não captura após recarga.
- `service status`: launchd instalado e rodando, PID observado **36539**.
- Medição inicial via `maintenance config`: **128759975 bytes** totais, SQLite **122478592 bytes**, 15 arquivos, `partial=false`, orçamento **1073741824 bytes**, status `ok`. É baseline, não crescimento de um dia.
- GET autenticado `repos/LucasRuon/worklog/pulls?state=all` retornou `[]`; Posicionadas não possui remote Git. Aceite de PR real continua pendente de um PR existente indicado pelo usuário.
- Typecheck/build passaram. Prova operacional read-only: `node scripts/verify-pilot-setup.mjs`; critérios em `.checks/piloto-posicionadas.md`.

Os itens abaixo permanecem como roteiro; a escolha dos projetos e a atualização do plugin pessoal acima já foram realizadas. Não foi executado um dia de uso, nem concedida confiança Codex, nem lida uma transcrição histórica pessoal.

1. Usar a T20 implementada e verificada; escolher quando atualizar os serviços pessoais com a versão revisada. A nova interface foi validada em stores temporários.
2. Concluir a confiança nativa dos hooks Codex em `/hooks` e comprovar captura real.
3. Escolher dois projetos reais e um PR existente para consulta; Worklog estava sem PRs na última consulta.
4. Usar versões/fontes suportadas, registrando os limites dos parsers históricos disponíveis.
   - OpenCode instalado agora é **2.2.6**; suporte técnico e smoke nativo isolado foram concluídos. Atualizar explicitamente a instrumentação pessoal e conferir sua captura antes do piloto. Não alterar só a versão da fonte; o parser offline não instala o plugin.
5. Registrar versões efetivamente instaladas; nenhuma instalação foi redeployada nesta rodada.

## Evidências técnicas já disponíveis

**Fechamento T15:** histórico disponível/comprovado aceito explicitamente pelo usuário e verificado independentemente **PASS 4/4**, perfil light, em `.checks/t15-fechamento.verified.md`. Recuperação real Codex10/replay0 e OpenCode legado46/replay0. Limitações nativas continuam documentadas em FONTES-HISTORICO; T15 não bloqueia mais este piloto por cobertura integral, mas um dia de uso/cenários reais T24 ainda precisa ser executado.

### Captura pessoal revalidada — 08/11, 22:09 America/Sao_Paulo (09/11 UTC)

`node scripts/verify-opencode-personal-live.mjs` passou: plugin `worklog` active na localização Worklog, fonte original 2.2.6 habilitada e eventos reais associados ao projeto/raiz corretos. Recorte recebido desde `2026-11-09T00:45:00.000Z`: 6 session.start, 6 turn.submit, 72 turn.start, 72 turn.end, 154 tool.start e 154 tool.end na consulta de 01:09 UTC. Contagens podem crescer; não são medição de duração/dedicação.

Isso substitui a pendência de captura após recarga **para Worklog** anotada acima. Ainda não há evidência de atividade Posicionadas neste recorte. Checklist `.checks/opencode-personal-live.md`.

Histórico v2 reconsultado via `smoke:opencode-history` somente na sessão de verificação deste trabalho (`ses_e423b5c91ffeL66cO3TpuFDecv`), em store temporário: 1 frame log.synced, zero eventos, HISTORY_UNAVAILABLE. Consulta adicional GET com `after=0&follow=false` produziu o mesmo resultado. Coleta ao vivo não comprova disponibilidade de histórico retroativo.

Conferência remota nesta rodada: `remote service --host macmini --action status` retornou instalado/rodando, systemd-user PID 514965, `linger=true`. `remote status` registrou última sincronização `2026-11-09T01:09:04.980Z`, zero falhas, erro nulo e clock skew -13 ms. É prova de disponibilidade/sincronização naquele instante; não substitui o ensaio de desconexão/reconexão com backlog.

Usuário confirmou que ainda não existe PR para o piloto. Codex: autorizada instalação **somente local**, executada em `~/.codex/hooks.json`; dez hooks Worklog acrescentados, quatro handlers anteriores preservados, backup privado criado. Revisão nativa de confiança `/hooks` ainda depende do usuário; não houve chamada de modelo nem captura real comprovada. Detalhes em `CODEX.md`.

Verificações independentes operacionais: `.checks/opencode-personal-live.verified.md` **PASS 2/2** e `.checks/codex-local-install.verified.md` **PASS**. Painel local iniciado por `npm start`, health HTTP **200** em `http://127.0.0.1:4320`; para autenticar no navegador, `npm run cli -- open`. Esse processo HTTP é separado do coletor launchd e não foi instalado como serviço permanente.

**Captura Codex posterior (22:41 BRT):** usuário autorizou a revisão nativa local e, após o ensaio sem modelo não disparar início, autorizou explicitamente dois turnos mínimos de modelo. Dez hashes Worklog `trusted` pela mesma API usada no `/hooks`; alheios preservados e arquivo hooks.json intacto. Sessões `01a1bdf7-4e0e-7122-bbf6-f2726fdf393e` (Worklog) e `01a1bdf7-5f22-7e41-966a-3960abe637ce` (Posicionadas), cada uma com session.start, turn.submit, turn.start, turn.end e session.end, projeto correto e nenhuma ferramenta. Isso substitui a pendência de confiança/captura Codex mínima anotada anteriormente; não substitui piloto de um dia ou ferramentas reais. Relatório `artifacts/codex-local-native/verification-live.json`; **verificação independente PASS 3/3**, perfil light, em `.checks/codex-native-trust.verified.md`. Verificador somente leitura confirmou todos os dez eventos e confiança atual, sem repetir chamadas de modelo/aprovação.

- Typecheck/build, **46 unitários, 25 integração e 28 E2E** aprovados na rodada independente final, sem skips.
- Histórico real legado delimitado: **46/46 IDs**, replay zero, zero eventos humanos/arquivo e zero revisões fabricadas. Não substitui histórico nativo das versões ainda sem parser.
- Novo parser `opencode-log-v1` verificado independentemente (**7/7 checks**); gates daquela extensão **50 unitários, 26 integração e 28 E2E**. Smoke da sessão v2 disponível retornou só marcador final/`HISTORY_UNAVAILABLE`, sem prova positiva de recuperação.
- Revisão T13: suporte 2.2.5/2.2.6 ponta a ponta, duas sessões nativas em raiz/store temporários, replay zero, zero modelos/humanos/revisões; segunda sessão recebida pelo stream. Gates mais recentes **54 unitários / 28 integração / 30 E2E**. Não atualiza fontes pessoais nem encerra T24.
- HTTP 409 dos ajustes, HTTP 410 dos downloads revogados, retenção com cursor preservado, cancelamento SIGINT/retomada de 1000 registros e restore com serviço ativo controlado comprovados.
- Probe de idle e estado de serviço foram controlados em processos de teste; bloqueio físico, suspensão, um dia de crescimento e integrações pessoais permanecem na lista abaixo.
- Relatório completo: `../.checks/continuacao.verified.md`. O teste CLI usa orçamento de subprocesso de 30 s para evitar confundir timeout do ensaio com cancelamento solicitado; não estabelece SLA do produto.

## Provas reais a registrar

- Um dia de uso, com horários UTC/fuso, versões e máquinas.
- Claude/Codex/OpenCode locais e Claude remoto conforme disponibilidade real, sem declarar conta expirada como funcional.
- Agentes simultâneos, dedicação explícita em outro projeto, pausa/bloqueio físico e terminal fechado.
- SSH indisponível e recuperação com backlog, preservando cursores/IDs.
- Arquivo editado antes do commit → revisão/diff → sessão → commit → PR, incluindo caso ambíguo rotulado.
- Exportar somente um dos dois projetos, por período/máquina, antes/depois de ajuste; comparar totais e abrir o PDF final.
- Medir armazenamento ao início/fim do dia. A amostra de 46 eventos em store temporário não substitui essa medição.
- Backup/restore isolado e confirmação de fila/recibos, sem ativar duas instalações com a mesma identidade.

## Comandos de regressão

Já executados nesta rodada; repetir quando o código ou ambiente do piloto mudar:

```sh
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e -- tests/e2e/full-flow.spec.ts
```

Dados ausentes, erro de integração, cenário não exercitado ou fonte sem parser comprovado devem permanecer como pendência. Só criar a entrega final do produto após registrar os resultados reais; nenhum marco é fechado pela existência dos testes.
