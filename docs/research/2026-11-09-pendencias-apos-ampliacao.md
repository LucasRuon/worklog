---
date: 2026-11-09
researcher: OpenCode
research_question: O que ainda precisa de ajuste, implementação ou validação após f97d2b3?
status: complete
---

# Pendências após a ampliação histórica

## Resumo

Inspeção estática do código, testes e registros do workspace em `f97d2b3`, com trabalho concorrente preservado em TASKS.md/tasks.csv e `.checks/piloto-t14-t24-2026-11-09.md`. Não houve teste/probe pessoal, acesso a transcrições, rede, alteração de implementação ou novo commit. A regressão independente recém-executada permanece a referência: 201 unitários, 33 integração, 30 E2E, typecheck/build aprovados; não foi reexecutada nesta pesquisa.

T15 permanece encerrada no aceite disponível/comprovado. Não foi identificado novo bloqueante comprovado no recorte inspecionado; isto não é auditoria exaustiva de bugs. As pendências se dividem em implementação histórica adicional, provas nativas e fechamento operacional T24.

## Implementação adicional

| Frente | Estado atual e consequência | Referência |
|---|---|---|
| Pai imediato/raiz Codex | Todo agent_id recebe parentSessionId=session_id; a projeção resolve esse pai como main. Correto para o recorte de filho direto, não comprova hierarquia multinível | `src/collectors/codex.ts:23–26`; `src/core/sessions.ts:77–79` |
| Nested/forks/revert/bases externas | v4 recusa history_base não nula; filhos exigem depth1/pai raiz/faixa ordinal. A recusa segura está implementada, a recuperação dessas linhagens não | `src/collectors/codex-history.ts:63–77`; `.checks/history-expansion.verified.md:194–202` |
| Identidade/recibos | O evento anterior é preservado; diferença além de horário é conflito. Enriquecer parentesco não pode consistir em reescrever o mesmo eventId | `src/collectors/codex-receipts.ts:21–24,34–43`; `docs/HISTORICO-CONTRATOS.md:58–60` |
| MCP adicional | v4 depende do par FunctionCall namespaced/ItemCompleted de mesmo call_id, status completed e horários explícitos. Failed/inProgress e code-mode sem identidade continuam excluídos | `src/collectors/codex-history.ts:102–116,127–158`; `tests/collectors/codex-history-mcp.test.ts:80–105` |
| Parsers anteriores | Guard novo de history_base é v4-only; v2/v3 preservam admissão anterior de filhos. Eventual endurecimento exige decisão versionada e provas específicas, não remoção silenciosa de cobertura | `src/collectors/codex-history.ts:63,70`; `docs/HISTORICO-CONTRATOS.md:52` |
| Claude nativo | Não existe seletor de parser nativo. Contratos consultados não estabelecem todas as bordas executadas/relógios/IDs compartilhados com hooks; normalizados/hooks permanecem disponíveis | `src/collectors/history.ts:20,141–142`; `docs/HISTORICO-CONTRATOS.md:62–68` |

Para linhagens, a próxima implementação precisa distinguir raiz, pai imediato e parentesco desconhecido, reconciliar a relação sem alterar eventos/recibos imutáveis e cobrir live/histórico/rebuild/replay. Somente depois disso faz sentido admitir prefixos/segmentos e descendentes adicionais no parser. Essa é uma recomendação de ordem, não um desenho já aprovado.

## Provas que não equivalem a código faltante

- OpenCode2.2.6 com gaps e MCPv4 são capacidades comprovadas por contrato/fixtures, **sem amostra nativa positiva nova** (`docs/HISTORICO-CONTRATOS.md:12–22`). Novos ensaios precisam de sessões próprias autorizadas; chamadas de modelo e amostras pessoais não estão autorizadas por esta pesquisa.
- Log OpenCode só com log.synced continua HISTORY_UNAVAILABLE. Messages/export não preservam a identidade de cada borda durável; não é recuperável por trocar o parser ou inventar duração (`docs/HISTORICO-CONTRATOS.md:28–34`).
- Claude local tem duas provas residuais abertas em `TASKS.md:160–162`; a validação remota anterior existe. Não autenticar/chamar contas pessoais automaticamente.

## Piloto e entrega

O registro mais recente marca T14 conferida para fontes disponíveis e T18 comprovada com PR#1 (`TASKS.md:308,381`; `.checks/piloto-t14-t24-2026-11-09.md:5–16,28–35`). Não foi localizado relatório independente específico dessa nova conferência: o verifier histórico excluiu os arquivos concorrentes de seu escopo (`.checks/history-expansion.verified.md:33–37`). Isso é uma lacuna de comprovação independente, não prova de que a operação falhou nem motivo automático para reabrir T14/T18.

T24 segue aberta (`TASKS.md:479–484`). Início registrado09/11 02:03UTC, janela mínima até10/11 02:03UTC; relógio desta pesquisa09/11 02:30UTC. Portanto ainda não transcorreu o dia. O término da janela sozinho também não prova os cenários.

Faltam evidências reais de:

1. Uso dos dois projetos, agentes simultâneos e atribuição humana sem duplicação.
2. Bloqueio/suspensão físicos e terminal fechado/coleta em segundo plano.
3. SSH indisponível/reconexão com backlog e cursores preservados, em janela autorizada.
4. Cadeia arquivo→revisão/diff→sessão→commit→PR, inclusive ambiguidade rotulada.
5. Exportação de só um projeto/período/máquina, nota/ajuste antes/depois e conferência painel/CSV/PDF.
6. Medição final versus baseline vigente de145.495.130 bytes; backup/restore isolado com fila/recibos, sem duas identidades ativas.
7. Atividade Claude remota nova: sincronização saudável foi observada, mas último evento registrado era07/11.

Referências: `.checks/piloto-t14-t24-2026-11-09.md:11–16,18–35`; `docs/PILOTO.md:53–62`. `docs/ENTREGA.md` não existe; deve depender da comprovação do piloto, não de testes sintéticos. O texto T24 ainda pede Claude local, enquanto perfis locais não autenticados ficaram fora da conferência T14; o recorte de fontes efetivamente exigido na T24 precisa ser explícito antes de fechar o aceite.

## Ajustes documentais

`TASKS.md:46,473,498`, `.checks/PROXIMA-SESSAO.md:37–51` e `docs/PILOTO.md:10–23,33–43` ainda misturam estados superados de PR ausente, confiança Codex pendente e captura OpenCode pós-recarga pendente. A nova conferência/piloto já registrou avanços. Recomenda-se consolidar um resumo vigente sem apagar a cronologia, incorporar f97d2b3/201–33–30 e usar o baseline vigente do piloto, preservando medições anteriores como históricas.

## Ordem recomendada

1. Consolidar documentação vigente e confirmar o escopo do piloto; verificar independentemente a nova conferência T14/T18 sem ações mutantes.
2. Completar T24 com cenários autorizados enquanto decorre a janela; só então produzir entrega final.
3. Para a próxima ampliação de código, tratar primeiro o modelo/reconciliação de linhagem Codex; depois habilitar formatos adicionais comprovados.
4. Promover OpenCode/MCP de fixture a prova nativa em sessões próprias autorizadas.
5. Manter Claude nativo condicionado a contrato suficiente, não a timestamps inferidos.

Nenhum desses itens reabre o aceite anterior T15 nem autoriza push/deploy, novos turnos de modelo ou mudanças no Posicionadas.

## Conferência posterior de atividade real — autorizada pelo usuário

Às02:33–02:34UTC de09/11 (23:33–23:34 de08/11 em São Paulo), usuário pediu expressamente conferir seu trabalho em Worklog e Developer/Posicionadas. Consultado SQLite pessoal com `DatabaseSync(readOnly:true)`, `PRAGMA query_only=ON` e transação de leitura; somente agregações/metadados dos dois projetos. Consultados Git status/log com `--no-optional-locks`, sem mensagens de commit, conteúdo/diffs, hooks ou alterações nos repositórios. Nenhuma transcrição/credencial aberta. Esta seção é posterior à inspeção estática acima e não é uma verificação independente da conferência do piloto.

Período consultado:08/11 00:00BRT até a consulta. Snapshot de atividade02:33:36UTC; revisão de operações/Git02:34:24UTC:

| Evidência | Worklog | Posicionadas |
|---|---|---|
| Mudanças de arquivos capturadas | 305:47 criações +258 edições | 49:1 criação +48 edições |
| Intervalo entre primeira/última mudança observada | 08/11 14:59:09–23:31:37 BRT | 08/11 21:46:21–23:15:23 BRT |
| OpenCode | 16 sessões projetadas sobrepostas ao período; 837 tool.start e837 tool.end no snapshot | Nenhum evento OpenCode atribuído, nem encontrado por cwd desse projeto/subdiretórios |
| Codex | 1 ciclo de turno +1 SessionEnd isolado de tentativa anterior | 1 ciclo de turno/sessão,5 eventos |
| Commits alcançáveis nas refs Git consultadas | 4:fa121cc,b162071,76a6edc,f97d2b3 | 0 no período |
| PR no store | #1 aberto | Nenhum |
| Nota/ajuste persistidos no período | 0/0 | 0/0 |

As sessões Codex de ambos os projetos coincidem com os ensaios mínimos próprios já documentados, não prova nova de uso amplo de ferramentas. Há1000 revisões baseline adicionais de Posicionadas: são inventário inicial, **não1000 edições realizadas pelo usuário**. As305/49 operações são mudanças observadas, não autoria humana comprovada. Intervalo entre primeiro/último evento não é dedicação contínua nem duração de trabalho faturável.

Depois do marco administrativo02:03UTC já há36 mudanças de arquivos Worklog e2 Posicionadas,1 commit Worklog e atividade contínua OpenCode Worklog; o uso anterior ao checklist também é evidência e não deve ser descartado. Em Worklog existem237 vínculos revisão→sessão classificados inferred no período; em Posicionadas nenhum desses vínculos foi encontrado. Não transformar proximidade de horários em autoria comprovada.

Conclusão: uso real e coleta de arquivos dos dois projetos estão comprovados, mas a origem/agente responsável pelas edições de Posicionadas não está estabelecida por estes metadados. Ausência de eventos OpenCode não prova ausência de uso; se a ferramenta foi utilizada, investigar captura/associação nessa raiz antes de declarar o fluxo do agente validado. Exportações são snapshots em memória (`src/reports/query.ts:67–79`); a consulta SQLite não permite afirmar que não houve exportação só porque não existe registro durável. Bloqueio/suspensão/SSH/reconexão e conferência final de exportações/armazenamento continuam sem comprovação por esta leitura.

Correção da interpretação de prazo: TASKS exige “um dia de piloto”, não define por si24horas corridas a partir da criação do checklist. A janela de24h foi o procedimento registrado na conferência, não limitação do software. Pode-se aproveitar a jornada anterior comprovada, mantendo seu período e baseline reais; não retroagir a medição de armazenamento ou declarar cenários não observados como exercitados.

## Diagnóstico posterior — usuário confirmou OpenCode no Posicionadas

Consultas somente GET, após `opencode service status` confirmar serviço disponível; nenhuma instalação/reload/restart, alteração de configuração ou turno de modelo. Conferidos `/api/plugin` com location.directory, `/api/session?directory=...&limit=20` (somente IDs/location/time/parent, sem títulos/mensagens), manifesto capture.json projetado a roots/source habilitadas e contagens read-only do Worklog. Não lidos messages/context/export/log de sessões pessoais.

- A API nativa retornou5 sessões Posicionadas com atividade hoje (3 raízes e2 subagentes); as demais entradas da página eram de datas anteriores. Metadados created/updated/busy/idle dessas5 abrangem09/11 00:25:14–00:39:52UTC, ou08/11 21:25–21:39BRT. Não são prova de duração executada contínua.
- O Worklog tem zero eventos OpenCode atribuídos ao Posicionadas, apesar da existência dessas sessões na origem. Portanto a ausência no painel não significa ausência de uso pelo usuário. A origem preservou ao menos metadados das sessões; não se provou retenção de todas as bordas duráveis nem disponibilidade retroativa dos eventos.
- Fonte2.2.6 e roots de ambos os projetos estão habilitadas no capture.json; realpath das duas raízes coincide com os caminhos cadastrados. Não foi encontrado indício de symlink/raiz pausada nessa conferência.
- Primeira listagem do plugin Posicionadas retornou0 plugins, enquanto Worklog retornou worklog active. Listagem posterior, após consultas de metadados, retornou worklog active também no Posicionadas, a partir do mesmo wrapper global `~/.config/opencode/plugins/worklog.js`. Consultas de Location podem inicializar serviços/plugins; isso não prova estado histórico durante as sessões nem uma correção de captura. Não houve alteração de arquivos de configuração, instalação ou reinício explícito.
- As5 sessões nativas identificadas antecedem o primeiro evento da coleta live atual2.2.6 no dia (Worklog21:45BRT). Isso é compatível com uma lacuna de cobertura antes da ativação comprovada, mas não estabelece sozinho a causa: horários de configuração/ativação históricos e possíveis outros runtimes não foram integralmente rastreados.

Conclusão atualizada: uso OpenCode no Posicionadas comprovado por metadados nativos; falta sua captura no Worklog. Plugin aparece ativo agora, mas captura futura ainda precisa de evento real durante uso normal e conferência de origem/projeto/replay. Não declarar que a integração está corrigida apenas pela presença do plugin. Recuperação histórica pessoal adicional requer autorização própria para a amostra, respeitando os contratos e a possível ausência do log durável.
