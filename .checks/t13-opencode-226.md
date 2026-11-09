# T13 — compatibilidade OpenCode 2.2.6

Profile: light (padrão; sem AGENTS.md). Alterações locais, sem commit: TASKS.md exige pedido explícito.

Sources:
- `TASKS.md`, T13 e restrições globais — revalidar plugin 2.2.6, preservar privacidade, fila e instalação seletiva.
- `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md`, `.checks/PROXIMA-SESSAO.md` — origem correta, contratos versionados e limites reais.
- https://opencode.ai/docs/build/plugins e /build/plugins/server — setup/cleanup, contexto, event.subscribe e storage.
- OpenAPI do runtime instalado 2.2.6 (`opencode api GET /openapi.json`) — sessão, plugin, eventos e log durável.

## Out of scope
- Atualizar plugins/serviços/perfis pessoais, hooks Codex confiáveis, chamadas de modelo, SSH e deploy.
- Declarar T05/T12/T14/T18/T24 concluídas com fixtures; piloto de um dia e escolhas pessoais continuam necessários.
- Parsers privados T15 sem contrato versionado comprovado; investigação separada não autoriza presumir formato.
- Aceite positivo de histórico v2 sem eventos recuperáveis; smoke sinaliza essa limitação.

## Landing

Reutilizar plugin/projector, entrada `plugin-event`, manifestos, controle de fontes, UI existente e instalação seletiva. Nenhum schema/migração/dependência nova.

| Porta | Forma literal | Alternativa rejeitada |
|---|---|---|
| Compatibilidade live | Allowlist compartilhada `['2.2.5', '2.2.6']`; instalação recebe versão detectada, remoção preserva versão registrada; fonte divergente do runtime não captura | Aceitar todo `2.x` ou continuar registrando 2.2.5 em runtime novo — compatibilidade e proveniência falsas |

Nada mais é irreversível nesta alteração.

## Checks

### S1 — plugin compatível ponta a ponta · 10 arquivos · 72.113 bytes · ~18k tokens

**C1** — Em 2.2.5 e 2.2.6, plugin → CLI compilado → fila importa exatamente sessão/início/fim de ferramenta; replay insere zero; eventos externos e conteúdo `SECRET` não são persistidos.
Proof: `npm run test:unit -- tests/collectors/automation.test.ts`, teste `plugin v2 captura pelo entrypoint compilado e não persiste eventos fora das raízes autorizadas` (subtestes por versão).

**C2** — Runtime desconhecido 2.2.7 não assina stream; health é `unsupported-version`. Runtime 2.2.6 com fonte 2.2.5 não assina stream; health é `source-version-mismatch`.
Proof: mesmo comando, teste `plugin recusa runtime desconhecido e fonte de outra versão antes de assinar eventos`.

**C3** — Atualizar instalação 2.2.5 → 2.2.6 preserva sourceId; repetição mantém wrapper; remoção conserva 2.2.6/histórico e plugin alheio. Instalação 2.2.7 não cria wrapper/fonte.
Proof: mesmo comando, teste `instalador preserva identidade e versão ao atualizar e remover o plugin`.

**C4** — CLI `automation install` com executável controlado 2.2.6 registra 2.2.6; 2.2.7 retorna código 1/`OPENCODE_VERSION_UNSUPPORTED` sem instalar wrapper.
Proof: `npm run test:integration -- tests/integration/opencode-plugin-version.test.ts`, teste `CLI detecta a versão OpenCode ao instalar e recusa versão desconhecida`.

**C5** — API de fontes para wrapper 2.2.6 retorna supported/plugin-v2/no-data sem alegar captura; remoção via HTTP retorna 200, apaga só wrapper próprio, preserva versão/histórico e retorna removed.
Proof: `npm run test:integration -- tests/integration/sources.test.ts`, teste `fontes: plugin 2.2.6 tem diagnóstico e remoção seletiva pela API`.

**C6** — Integrações mostra `Plugin instalado · OpenCode 2.2.6` para fonte local compatível/presente/habilitada, não usa fonte remota nem ausente como plugin instalado local.
Proof: `npm run test:e2e -- tests/e2e/sources.spec.ts`, teste `plugin local mostra a versão registrada sem confundir fonte remota ou ausente` (desktop/mobile).

**C7** — Smoke nativo opt-in 2.2.6 em raiz/store temporários carrega plugin de teste `active`, recebe duas sessões reais distintas com origem/projeto corretos, replay da fila insere zero, não grava sinais humanos/revisões. Somente as sessões criadas pelo smoke são removidas. Não altera wrapper, fontes ou serviços pessoais.
Proof: `npm run smoke:opencode-plugin`, assertions em `scripts/smoke-opencode-plugin.ts`; relatório em `artifacts/opencode-226/verification.json`.

## Swept
- Validation: C2/C3/C4; allowlist não amplia gerações.
- Failure modes: C2; fila/outbox/retry existentes mantidos; não transformar presença em captura (C5/C6).
- Idempotency/retry: C1/C3.
- Authorization: manifesto/raiz/pausa existentes em `allowed`, `prepareCapture` e `controlSource`; C1/C5.
- Concurrency/ordering: loop sequencial/primeiro registro e revisão otimista existentes, sem nova ordem ou estado compartilhado.
- Data lifecycle: IDs/filas/histórico preservados, sem migração; C3/C5.
- External dependency failure: versão incompatível bloqueia antes do stream/instalação; C2/C4. Falha de IPC continua com outbox/retry existentes.
- State transitions: suporte/no-data/removed em C5; não converter instalação em observed.
- Observability: health discriminado C2 e diagnóstico API C5.

## Handoff
S1 ~18k de leitura + smoke ~3k, mesmo fluxo, abaixo de 150k: lote único. Verificador independente após build/gates, sem commit por restrição do repositório. Base anterior preservada em `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-t13-before`; HEAD contém só planejamento anterior e não é a base da implementação desta rodada.

Fechamento: C1–C7 aprovados por verificador independente em `.checks/t13-opencode-226.verified.md`, rodada 2, perfil light; nenhum commit. A rodada 1 detectou narrowing ausente na assertion do smoke; corrigido sem mudar critérios e todas as provas reexecutadas. Instalação pessoal não autorizada nem executada; nenhum esclarecimento do usuário alterou o escopo durante o build. Ensaios nativos iniciais corrigiram a leitura de `Plugin.Info.state.status` e a projeção de projetos antes da contagem; não foram usados como aceites positivos.
