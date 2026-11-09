# Próxima sessão — depois da retomada T20

## Ampliação histórica posterior — 09/11/2026

T15 continua concluída no aceite disponível/comprovado, não integral. Nova rodada `.checks/history-expansion.md`: gaps públicos OpenCode2.2.6 aceitos com aviso/partial e opt-in `codex-rollout-v4-0.167.0` para MCP completed + FunctionCall canônico correlacionado. Novas capacidades provadas apenas por contrato/fixtures; nenhuma nova leitura pessoal/modelo/instrumentação. Matriz vigente e contratos em `docs/HISTORICO-CONTRATOS.md`. Logs só com log.synced continuam indisponíveis. Nested/forks/revert/prefixos externos e Claude nativo continuam não suportados, com bloqueios explícitos de identidade/tempo/parentesco; não são dados fabricados ou capacidades concluídas. Sem commits autorizados nesta rodada. Resultados/verificação independente registrados no checklist/relatório próprios, não nos relatórios anteriores preservados. As notas abaixo registram os estados anteriores e os aceites do piloto podem ter alterações concorrentes em TASKS.md.

Atualizado em **08/11/2026**. O pedido de continuar com `/tlc-implement` retomou T20 e a verificação adiadas em 07/11. Os avisos de adiamento nos registros históricos não representam mais o estado vigente.

**Estado final vigente:** T12 CLI aceita em uso real; **T15 concluída** no aceite explícito do usuário **Disponível e comprovado**, **verificação independente PASS 4/4**, perfil light, em `.checks/t15-fechamento.verified.md`. Recuperação real Codex10/replay0, OpenCode legado46/replay0; limitações nativas mantidas, não cobertura integral. Commits locais autorizados `fa121cc` e `b162071`, sem push. Os parágrafos cronológicos abaixo conservam o histórico anterior a esse fechamento.

**Extensão T15 Codex v2 mais recente:** opt-in `codex-rollout-v2-0.167.0` implementa ferramentas Bash/apply_patch completed paginadas e filhos diretos com borda ordinal explícita; preserva v1. Prefixo ancestral não vira execução do filho, término usa SubagentStop, IDs/recibos são os dos hooks. Gates **122/31/30**, typecheck/build verdes; checklist `.checks/t15-codex-items.md`, relatório independente `.checks/t15-codex-items.verified.md`. HLC/complete=false/exit1 obrigatórios. Demais ferramentas/linhagens, interrupção de filho e amostras nativas pessoais continuam fora; T15 não encerrada.

**Verifier da extensão: PASS, 8/8**, perfil light, rodada 1. Reexecutou 68 unitários/3 integrações e typecheck; hashes/diff próprios conferidos, nenhuma lacuna bloqueante. Sem fault injection exigida neste perfil. Somente registros documentais de resultado foram atualizados após a verificação.

**Continuação mais recente T15 Codex:** parser `codex-rollout-0.167.0` implementado para lifecycle de turnos raiz com horários explícitos, contexto/período e IDs compartilhados com hooks. Recibos individuais privados preservam a primeira captura inclusive offline/concorrente, com compatibilidade de batch legado e backup/restore. Gates **92/30/30**, typecheck/build verdes; **verificação independente PASS, 9/9**, perfil light, em `.checks/t15-codex-rollout.verified.md`, preservando o FAIL inicial e o fechamento de F1–F3. Limitação parcial obrigatória `HISTORY_LIFECYCLE_ONLY`: ainda não cobre ferramentas/linhagens herdadas, não leu histórico pessoal e não encerra T15.

**Continuação anterior T15 — OpenCode:** parser offline **`opencode-log-v1`** implementado/verificado (**7/7**, `.checks/t15-opencode-log.verified.md`); gates daquela extensão **50 unitários / 26 integração / 28 E2E**. Smoke nativo real consultou só a sessão autorizada: um frame `log.synced`, zero eventos, `HISTORY_UNAVAILABLE`, `nativeHistoryProven=false`. Ainda não existe prova positiva de recuperação v2 nessa fonte.

**Revisão T13 mais recente:** suporte live **2.2.5/2.2.6** implementado de ponta a ponta; smoke nativo temporário com plugin active, duas sessões/duas evidências, segunda sessão do stream, origem/projeto corretos e replay zero. Zero modelos/humanos/revisões. Gates **54/28/30**, typecheck/build verdes. **Verificação independente PASS, 7/7 checks**, perfil light, rodada 2; relatório `.checks/t13-opencode-226.verified.md` preserva o FAIL de tipagem inicial e sua correção. **Nada foi reinstalado/reiniciado nos perfis/serviços pessoais.** Atualização pessoal opt-in ainda necessária; não mudar só a versão registrada para contornar o guard.

## Concluído nesta retomada

- **T20:** painel completo por projeto; seleção/filtros coerentes; busca por cliente; somente sem projeto; sessão → revisão/diff → commit → PR; paginação e diagnósticos offline/gap/stale; cancelamento de leituras obsoletas.
- **Verifier independente:** **PASS, 33/33 checks**, perfil light, sobre `.checks/t14-t15.md`, `t18-t19.md`, `t20-t23.md` e `t20-retomada.md`. Relatório e histórico das três rodadas: **`.checks/continuacao.verified.md`**. F1–F16 e a ressalva S1 foram encerrados sem reduzir critérios.
- **Gates:** typecheck/build; **46 unitários, 25 integração e 28 E2E**, sem skips. `full-flow.spec.ts` passou em desktop/mobile, incluindo exportação e backup/restore.
- **Histórico real legado:** período 06/11 13:55–14:05 UTC, **46/46 IDs**, replay zero, zero sinais humanos/arquivo e zero revisões; fonte read-only e store temporário. A medição não representa crescimento diário.
- **UI:** capturas de histórico/cobertura desktop/mobile e confirmação claro/escuro inspecionadas; contraste mínimo dos oito pares de tokens medidos 4,86:1 claro / 4,75:1 escuro, sem overflow.

## O que falta

**Operação Codex mais recente (08/11 22:41 BRT):** dez comandos Worklog revisados e hashes confiados pela API nativa local usada pelo `/hooks`, sem bypass e preservando hooks alheios. Usuário autorizou dois turnos mínimos após o ensaio sem modelo falhar. Ambos os projetos tiveram cinco eventos reais de sessão/turno e associação correta; nenhuma ferramenta. Evidência `artifacts/codex-local-native/verification-live.json`, checklist `.checks/codex-native-trust.md`. Confiança não precisa ser refeita para esses mesmos hashes. **Verificação independente PASS 3/3**, perfil light, em `.checks/codex-native-trust.verified.md`; T12 CLI aceita e T24 continua aberta.

**Extensão T15 mais recente:** v3 `codex-rollout-v3-0.167.0` implementado, **verificação independente PASS 5/5**, perfil light. Chamadas dinâmicas completed/success=true com identidade live e ms explícitos; v1/v2 preservados. Gates completos 158/32/30; provas independentes focadas 104 unitários + 4 integrações e typecheck/build. Relatório `.checks/t15-native-extension.verified.md`. Continuam pendentes MCP, demais ferramentas/linhagens, contrato Claude suficiente e histórico pessoal positivo. Não declarar T15 integralmente concluída.

**Captura pessoal revalidada em 08/11 22:09 BRT (09/11 UTC):** plugin Worklog active e seis tipos de eventos reais persistidos na origem/projeto Worklog corretos. Probe `scripts/verify-opencode-personal-live.mjs` aprovado; checklist `.checks/opencode-personal-live.md`. T13 pessoal não está mais pendente para Worklog. Atividade Posicionadas e piloto prolongado continuam pendentes. A nova tentativa de histórico log v2, inclusive after=0, retornou somente log.synced.

**Preparação pessoal posterior:** usuário escolheu Worklog e `/Users/lucasruon/Developer/Posicionadas`; ambas as raízes habilitadas, projetos distintos. Plugin pessoal atualizado com autorização para 2.2.6, sourceId/store preservados; captura após recarga ainda não comprovada. Coletor launchd rodando. Baseline 128759975 bytes; Worklog continua sem PRs (GET atual), Posicionadas sem remote. Ver `docs/PILOTO.md` e `.checks/piloto-posicionadas.md`. Esta operação substitui apenas a pendência de escolha dos projetos/instalação pessoal, não os aceites reais restantes.

| Task | Pendência | Próxima evidência |
|---|---|---|
| T05 | Perfis Claude locais opcionais sem sessão autenticada comprovada | Sessão curta real após login disponível; o Claude remoto já foi validado |
| T12 | CLI 0.167.0 implementada e captura real mínima validada nos dois projetos | PASS independente 3/3; cinco eventos por sessão, sem ferramentas; uso mais amplo entra em T24 |
| T13 | Instalação pessoal 2.2.6 e captura Worklog confirmadas | Plugin active e eventos reais de sessão/turnos/ferramentas; atividade Posicionadas entra no piloto T24 |
| T14 | Conferência com perfis pessoais | Conferir origem/diagnóstico/captura das contas realmente disponíveis; testes controlados já passaram |
| T15 | Concluída no aceite disponível/comprovado, PASS 4/4 | Limites nativos em FONTES-HISTORICO são evoluções fora do aceite: Claude opaco, demais ferramentas/linhagens Codex, logs v2 indisponíveis ou com lacunas não suportadas |
| T18 | PR real de leitura no piloto | Escolher um PR existente; Worklog retornou zero na consulta anterior, sem consulta pessoal nova nesta rodada |
| T24 | Piloto de um dia e entrega final | Dois projetos reais, fontes locais/remotas, bloqueio/suspensão, SSH offline/backlog, exportação/ajuste e crescimento medido |

O aceite integral M3 depende de captura/compatibilidade reais; M5 ainda tem o aceite de PR real em aberto; M6 depende do piloto T24. Nenhum desses marcos é fechado pela existência de fixtures.

**Operação local posterior:** usuário restringiu instalação Codex a este Mac. Dez hooks instalados e, com autorização posterior, confiados pelo mecanismo nativo, quatro handlers existentes preservados com backup. Não é mais necessária aprovação manual dos mesmos hashes. Usuário confirmou que ainda não há PR; manter esse aceite pendente.

## Estado da árvore e operação

- Implementação anteriormente não commitada consolidada, após autorização, em **`fa121cc`**; prova real de recuperação e aceite T15 em **`b162071`**, seguidos pelo registro documental do PASS. A base antiga `231e046` não representava apenas as alterações desta rodada.
- **Commits locais autorizados; sem push ou deploy externo.** Plugin pessoal OpenCode atualizado e Codex instalado/confiado localmente com autorização específica; HTTP pessoal 4320 iniciado, separado do coletor. Nenhum serviço remoto redeployado nesta rodada.
- Testes usam bases temporárias e portas efêmeras. Restore com serviço ativo e probe de idle usam dependências controladas em processos filhos; não são prova de bloqueio físico ou operação pessoal.
- Migrações existentes preservadas: últimas são `013_adjustments_notes.sql` e `014_operating_config.sql`; T20 não exigiu migração, dependência nem endpoint adicional.
- CLI histórica: processo de prova tem orçamento 30 s/teste 60 s, pois o timeout antigo de 10 s podia interromper a retomada de 1000 registros sob concorrência. Mesmas assertions SIGINT/contagens/replay; não é SLA do produto.
- Temas/CSS existentes preservados. Não instalar/atualizar skills, alterar perfis de ferramentas ou ativar serviços como efeito colateral da retomada.

## Retomar

1. Ler `TASKS.md`, `docs/PROGRESSO.md`, `docs/PILOTO.md` e o header final de `.checks/continuacao.verified.md`.
2. T15 está encerrada no aceite disponível/comprovado; não reabrir cobertura integral automaticamente. Seguir com os aceites pessoais/PR/T24 da tabela. Novos formatos nativos precisam de pedido próprio, contrato e provas; não são pré-requisito retroativo desse fechamento.
3. Se o código/ambiente mudar, repetir os gates documentados. O Verifier já foi executado nesta sessão; o adiamento anterior não precisa ser retomado novamente.
4. Registrar limites reais e só produzir `docs/ENTREGA.md` quando o piloto estiver comprovado.
