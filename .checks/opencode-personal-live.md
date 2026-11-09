# Captura pessoal OpenCode após atualização

Perfil: light. Fontes: conversa (seguir no fechamento; Worklog e Posicionadas autorizados), TASKS.md T13/T14/T24, docs/AUTOMACAO.md e API nativa 2.2.6 GET /api/plugin.

## Limite

Prova somente da captura atual do projeto Worklog. Não comprova atividade Posicionadas, histórico nativo recuperável, confiança Codex, login Claude ou dia de piloto.

## Landing

Reutilizar SQLite em read-only e GET nativo de plugins. Nenhuma alteração de dados pessoais, contrato ou dependência. Probe dedicado imprime metadados agregados, não documentos/payloads.

## Checks

### S1 — Captura pessoal · probe e contratos existentes · ~5k tokens de leitura

**C1** — Plugin `worklog` na localização deste projeto apresenta `state.status=active`.
Proof: `node scripts/verify-opencode-personal-live.mjs` (`plugin.state.status`).

**C2** — Fonte pessoal original 2.2.6 habilitada contém pelo menos um evento de cada tipo `session.start`, `turn.start`, `turn.end`, `tool.start`, `tool.end`, `turn.submit` após `2026-11-09T00:45:00.000Z`, com cwd do Worklog e associação ao projeto Worklog.
Proof: `node scripts/verify-opencode-personal-live.mjs` (loop sobre seis tipos e união events/event_projects/projects/project_roots).

## Swept

- Validação: probe valida plugin, versão/habilitação e tipos antes do resultado.
- Falhas: exceção ou ausência de evidência encerra com código não zero.
- Idempotência/retry: somente SELECT e GET; repetir não escreve dados.
- Autorização: raiz Worklog explicitamente autorizada; sem enumeração de transcrições pessoais.
- Concorrência: contagens podem crescer; prova exige piso de um, não contagem fixa.
- Ciclo dos dados: banco read-only; sem exportar documentos/payloads.
- Dependência externa: CLI nativo com timeout 20 s; falha não vira PASS.
- Estados: plugin active e eventos persistidos são evidências distintas, C1/C2.
- Observabilidade: stdout com contagens, versão, instante e IDs já conhecidos.

## Handoff

Uma fatia operacional de leitura, abaixo do limite 150k; verificação independente junto à extensão T15 ao final da rodada. Sem commits conforme regra do projeto.
