# Preparação do piloto Worklog + Posicionadas

Perfil: light. Fontes: conversa (dois projetos e atualização pessoal OpenCode autorizados); TASKS.md T13/T24; docs/AUTOMACAO.md; docs/PILOTO.md.

## Fora do escopo desta preparação

Um dia de uso, confiança nativa Codex, login Claude, cobertura histórica sem contrato e PR inexistente não podem ser substituídos por este cadastro. Não alterar código do Posicionadas nem seus remotes. Commits continuam exigindo pedido explícito conforme TASKS.md.

## Landing

Reutilizar CLI `project add` e `automation install`, com o mesmo store e wrapper pessoal. Cadastrar a raiz exata Posicionadas; não autorizar todo `/Developer` nem substituir workspaces existentes. Sem novo schema/dependência.

## Checks

### S1 — Preparar duas raízes e plugin · 5 arquivos · 32508 bytes · ~8,2k tokens

**C1** — As duas raízes exatas estão habilitadas em projetos distintos, chamados Worklog e Posicionadas.
Proof: `node scripts/verify-pilot-setup.mjs` (assertions de roots/nomes/IDs).

**C2** — O wrapper pessoal mantém sourceId `4c30691f-a389-5098-86a7-12636c8e4e33`, store original e versão registrada igual à versão nativa suportada; fonte habilitada.
Proof: `node scripts/verify-pilot-setup.mjs` (assertions fonte/wrapper/versão).

## Swept

- Validação: CLI valida paths e versões; C1/C2 conferem resultado persistido.
- Falhas: erro de instalação mantém preparação incompleta; não declarar captura pelo cadastro.
- Idempotência/retry: cadastro por device/path e wrapper por identidade existentes.
- Autorização: somente raízes indicadas e atualização pessoal autorizada nesta conversa.
- Concorrência/ordenação: transações SQLite e gravação privada atômica existentes.
- Ciclo de dados: preservar store/identidade/histórico; sem purga.
- Dependências externas: GitHub consultado por GET; zero PRs no Worklog; Posicionadas sem remote.
- Estados: habilitado não significa captura nativa comprovada.
- Observabilidade: prova imprime somente IDs, versão e contagens; sem payloads privados.

## Handoff

S1 ~8,2k tokens, um lote abaixo de 150k. Verificador independente ao final; nenhum handoff de build necessário.
