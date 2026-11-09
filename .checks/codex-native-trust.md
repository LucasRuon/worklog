# Codex — revisão nativa local e sessões reais

Profile: light. Fontes: conversa (usuário autorizou fazer a revisão/sessão; instalação somente local), TASKS.md T12/T24, docs/CODEX.md, contrato oficial Codex 0.167.0.

## Contrato

Fontes versionadas no commit `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`, consultadas antes da implementação:
- `codex-rs/tui/src/hooks_rpc.rs`: `/hooks` usa hooks/list e config/batchWrite, keyPath=hooks.state, mergeStrategy=upsert, trusted_hash=current_hash, reloadUserConfig=true.
- `app-server-protocol/schema/typescript/v2/HookMetadata.ts`, `HooksListParams.ts`, `ConfigBatchWriteParams.ts`, `ConfigEdit.ts`, `ThreadStartParams.ts`: formato JSON lowerCamelCase e identidade/hash nativos.
- https://developers.openai.com/codex/hooks: confiança por definição exata, flags de bypass não necessárias.

## Fora do escopo

Não aprovar hooks alheios, alterar login/política, usar bypass ou ler transcrições. Após o primeiro ensaio sem modelo, o usuário autorizou explicitamente um turno mínimo por projeto ("Responda apenas OK, sem ferramentas nem alterações"). Usar sandbox read-only para essas sessões novas, sem alterar o default pessoal. Não comprova ferramentas/subagentes reais nem encerra todo o piloto T24 ou T15. Não commitar por regra TASKS.md.

## Landing

Usar app-server stdio nativo existente e SQLite read-only. Script opt-in exige `--approve` para escrever confiança; padrão só inventaria. Aprovar somente as dez definições de comando exatamente iguais ao instalador local e conferir inventário antes/depois. Não escrever TOML diretamente nem mudar o formato do instalador.

## Checks

### S1 — Aprovar definições exatas e iniciar sessões · ~8k tokens de leitura

**C1** — Gate admite exatamente os dez eventos do Worklog, comandos locais esperados, source=user, enabled=true, isManaged=false, timeout2 e matcher ausente. Recusa alteração de comando, hash ausente, fonte externa, duplicatas e hook desabilitado antes de qualquer escrita.
Proof: `node scripts/codex-native-review.mjs --self-test`, teste `exact-worklog-definitions`.

**C2** — Aprovação usa hashes nativos por hooks.state via config/batchWrite; após releitura os dez hooks estão trusted e todos os hooks alheios mantêm hash, estado/enabled. Arquivo hooks.json permanece byte-idêntico.
Proof: `node scripts/codex-native-review.mjs --approve`, assertions pós-revisão e relatório `artifacts/codex-local-native/verification.json`.

**C3 (renegociado explicitamente com o usuário)** — Um turno mínimo concluído por sessão nativa nova nas raízes Worklog e Posicionadas; cada ID tem session.start, turn.submit, turn.start, turn.end e session.end da fonte Codex local e associação exata ao projeto esperado no SQLite Worklog. Zero tool.start/tool.end e nenhuma edição solicitada.
Proof: `node scripts/codex-native-review.mjs --approve --live-turns`, assertions SELECT por ID nativo/fonte/cwd/projeto/tipo, notificações turn/completed nativas, sem fallback sintético.

## Swept

- Validação: C1; versão nativa exatamente 0.167.0; fonte local do caminho esperado habilitada.
- Falhas: timeout/RPC/assertion encerra em erro, não marca captura presumida.
- Idempotência/retry: confiança por hash atual; repetição cria sessões novas, preserva dados anteriores.
- Autorização: aprovação explícita nesta conversa, restrita a dez comandos locais; C2 protege alheios.
- Concorrência: reler hooks antes da escrita e comparar metadados; não usar hash fabricado. Mudanças posteriores voltam a exigir confiança nativa.
- Ciclo de dados: nenhuma exclusão; confiança local persistida pelo mecanismo nativo, sessões sem modelo e metadados Worklog preservados.
- Dependência externa: app-server local, timeout e encerramento próprio; não renovar login. Duas submissões de prompt mínimo ao modelo autenticado autorizadas pelo usuário; não confundir execução local da instrumentação com inferência local do modelo.
- Estados: C2 distingue trusted de observado; C3 comprova sessão/turno mínimo, não cobertura de ferramentas/subagentes.
- Observabilidade: relatório só contagens, hashes e IDs de sessões próprias; sem stdout de hooks/transcrições/configuração bruta.

## Handoff

Lote único abaixo de 150k; verificador fresco após as provas. Este lote é operacional e não amplia parser/adapter.

## Ensaio inicial e decisão do usuário

`--self-test` PASS; inventário nativo inicial: dez Worklog untrusted. `--approve` gravou confiança pela mesma API de /hooks, releitura: dez trusted, alheios intactos e hooks.json byte-idêntico. Sessão sem modelo `01a1bdf4-6a66-7000-9872-05c6af14b78f` não produziu session.start no prazo, e C3 inicial falhou; após shutdown recebeu session.end real. Falha preservada em `artifacts/codex-local-native/verification.json` inicial e documentada aqui. Nada foi marcado como captura completa.

Perguntado antes de prosseguir, o usuário escolheu **Executar os dois turnos**, autorizando expressamente uma chamada mínima por projeto. C3 passou a exigir ciclo real de turno e sessão em vez de enfraquecer a prova para o único session.end observado. Fontes adicionais: schemas oficiais versionados TurnStartParams.ts, UserInput.ts, TurnInterruptParams.ts e ThreadArchiveParams.ts.
