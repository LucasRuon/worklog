# T20 — retomada do painel completo

Sources:
- Pedido de 08/11/2026: conferir pendências e continuar com `/tlc-implement`; retoma a T20 reservada para outra sessão e sua verificação independente.
- `TASKS.md`, T20: filtros, seleção, contexto, navegação, estados e provas desktop/mobile.
- `docs/ESPECIFICACAO.md`: identidade, evidências honestas, painel e limites locais.
- `docs/ARQUITETURA.md`: `ReportFilter`, APIs e paginação existentes.
- `.checks/t20-t23.md`: C1/C2 herdados, rascunho S1 preservado; C3–C10 das entregas anteriores continuam válidos.
- `PRODUCT.md`, `src/web/styles.css`, `src/web/Shell.tsx`: identidade grafite, dois temas e shell existentes preservados. Profile light; não há novo desenho vinculante.

## Out of scope

- Login/confiança pessoal Claude/Codex, instalação de serviços, redeploy e PR real: dependem de operação pessoal.
- Parsers históricos nativos adicionais: exigem contratos próprios; T15 mantém limites explícitos.
- Piloto real de um dia T24: o full-flow controlado não substitui uso prolongado.
- Commits/push: somente mediante solicitação explícita, conforme regra do repositório.

## Landing

Reusar Workspace/ReportFilter, APIs existentes, diálogos de sessão/revisão/commit/PR e CSS atual. Nenhuma migração, dependência ou nova API; mudanças de estado de navegação são reversíveis.

| Door | Literal shape | Alternative rejected |
|---|---|---|
| Seleção no detalhe | `projectTarget` corresponde a um único projeto selecionado; alterar seleção sai do detalhe e retorna ao catálogo filtrado | mostrar controles de seleção cujo valor é ignorado pelo detalhe |
| Paginação de evidências | cursores existentes por bloco, preservar páginas expandidas até Atualizar; PRs também têm continuação no projeto | limitar a 20 PRs sem caminho para acessar o restante |

## Checks

### S1 — T20 completa · 14 arquivos · 137735 bytes / 4 ≈ 35k tokens

**C1** — Projeto → sessão → revisão/diff → commit → PR usa os vínculos existentes, com inferência e checks ausentes identificados.
Proof: `npm run test:e2e -- tests/e2e/project-history.spec.ts` — `projeto completo: resumo e navegação sessão → arquivo → commit → PR`.

**C2** — Apenas PR com SHA explicitamente listado é relacionado ao commit; consulta sem autenticação retorna 401 e raiz pausada retorna 404.
Proof: `npm run test:integration -- tests/integration/project-detail.test.ts` — `projeto: evidências e PR por SHA respeitam escopo`.

**C3** — Seleção de dois projetos no catálogo, seguida da troca de seleção dentro do detalhe, mostra os projetos selecionados; busca por cliente permanece disponível.
Proof: `npm run test:e2e -- tests/e2e/project-history.spec.ts` — `filtros: seleção múltipla e contexto do projeto permanecem coerentes`.

**C4** — Filtros máquina/ferramenta/fonte limitam sessões; área Somente sem projeto mostra só eventos/sessões sem projeto e pode retornar ao histórico atribuído.
Proof: `npm run test:e2e -- tests/e2e/project-history.spec.ts` — `filtros: origem e atividades sem projeto com retorno ao histórico`.

**C5** — Detalhe permite carregar o 21º PR por cursor, abrindo-o por teclado; snapshot desatualizado, origem offline/atrasada e lacuna do observador ficam visíveis.
Proof: `npm run test:e2e -- tests/e2e/project-history.spec.ts` — `projeto: paginação, lacunas e recuperação de erro nas evidências`.

**C6** — Falha na atualização das evidências identifica os dados preservados como desatualizados; Tentar novamente recupera a consulta.
Proof: mesmo teste de C5.

**C7** — O fluxo integrado exporta somente o projeto selecionado, com nota, PR, diff e ajuste de 30000 ms; backup/restore conserva totais.
Proof: `npm run test:e2e -- tests/e2e/full-flow.spec.ts` — `fluxo completo controlado: seleção → evidências → ajuste → PDF/CSV → backup/restore`.

## Swept

- validation: filtros/UUID/período e limites já validados em `filters.ts`, `routes.ts`; C2/C4 atravessam API/UI.
- failure modes: C5/C6, erro recuperável e indicação de snapshot preservado.
- idempotency/retry: GETs e cursores existentes; C6 não grava evidências novas.
- authorization: guard existente em `server/auth.ts`; C2 confirma 401; sem novas mutações.
- concurrency/ordering: abortar leitura obsoleta na troca de filtro/desmontagem/fechamento; páginas expandidas não são substituídas pelo polling. Prova adicional `project-history.spec.ts` — `detalhes: fechar leitura atrasada preserva a evidência aberta depois`.
- data lifecycle: sem persistência nova; política/retenção e proveniência existentes permanecem.
- external dependency failure: estado offline/remoto e PR stale exibidos; testes usam provedor controlado.
- state transitions: detalhe ↔ catálogo, atribuído ↔ sem projeto e erro → retry (C3–C6).
- observability: timestamps/origem e gaps no projeto (C5); sem transcrições/payload em logs.

## Handoff

S1 ≈35k tokens de leitura, abaixo do orçamento 150k: um batch completo no agente principal. Verifier fresco recebe este checklist inteiro e os checks anteriores pendentes, após build verde. Árvore inicial contém implementação não commitada anterior a esta sessão; `231e046..working tree` não é exclusivamente desta entrega.

## Build — 08/11

- Red confirmado: seleção ignorada no detalhe e ausência dos avisos offline; filtro exclusivo sem projeto não existia na UI. Corrigidos locators do teste de máquina para usar o nome acessível do combobox; expectativas não foram reduzidas.
- Green: typecheck/build; 46 unitários, 23 integração e 26 E2E (desktop/mobile), sem skips. Full-flow controlado executado pela primeira vez nesta retomada.
- Capturas de projeto preenchido/cobertura desktop/mobile inspecionadas em uma rodada; identidade/CSS preservados. Detector Impeccable retornou `[]` nos quatro módulos UI alterados.
- APIs existentes atendem a entrega; nenhum endpoint novo necessário. Commit e instalação pessoal não executados.

### Correções após a rodada independente 1

O Verifier registrou 16 lacunas de prova e uma ressalva de concorrência. Assertions foram acrescentadas, sem reduzir os critérios: HTTP 409/410, recusa de target de nota, revogação real por política, cancelamento SIGINT da CLI/retomada de 1000 eventos, mismatch/substituição/schema do archive, datas/estados desconhecidos de PR, filtro de projeto no resumo, corte/cursor de retenção, serviço ativo controlado, persistência/efeito de idle/sync, exclusão/pausa nas revisões e teclado/origem/compatibilidade de fontes.

- Reproduzida a corrida de sessão: resposta atrasada sobrescrevia a sessão aberta depois. Session/commit agora cancelam no fechamento e ignoram resposta abortada; prova `detalhes: fechar leitura atrasada preserva a evidência aberta depois` passou em desktop/mobile.
- Red reproduzido para review/check desconhecidos: eram apresentados como recurso disponível. Agora o recurso desconhecido fica `unavailable`, preservando o PR. Catálogo consultado na documentação REST oficial GitHub de checks/reviews em 08/11; sem mudança de versão da API nem escrita no provedor.
- Gates do autor após correções: typecheck/build; **46 unitários + 25 integração + 28 E2E**, todos verdes, sem skips. O smoke passou a assertar também zero `file_revisions`; sua nova execução fica com o Verifier.
- Testes de serviço ativo e probe usam mocks nativos Node em processos filhos isolados, sem iniciar/parar serviço pessoal; inatividade física permanece T24.
- Rodada 2 independente: 32/33 checks; somente a retomada CLI de 1000 registros atingiu intermitentemente o timeout de 10 s sob execução concorrente (SIGTERM do runner tratado como cancelamento 130). Orçamento do processo de prova ampliado para 30 s e limite do teste para 60 s; volume, SIGINT explícito, contagens e replay continuam iguais. Coleta de stdout agora espera fechamento dos pipes e diagnóstico inclui o erro de timeout do subprocesso.

## Encerramento

**Rodada 3 independente: PASS, 33/33 checks** dos quatro checklists; todos F1–F16 e S1 encerrados. Typecheck/build, 46 unitários, 25 integração e 28 E2E aprovados. Smoke real 46/46 IDs, replay zero e zero revisões/sinais fabricados. Relatório: `continuacao.verified.md`.

Confirmação visual final (autor): oito pares de tokens medidos por tema e viewport, mínimos 4,86:1 claro e 4,75:1 escuro, sem overflow. Capturas `test-results/t20-{desktop,mobile}-{light,dark}.png` inspecionadas; nenhuma alteração de CSS necessária. Esse registro complementa o profile light; não é auditoria independente do profile ui.

Backlog/README/PROGRESSO/PILOTO atualizados após o PASS. Pendências e estado não commitado preservados em `PROXIMA-SESSAO.md`.
