# T15 — fechamento do histórico disponível e comprovado

Profile: light. Base: `fa121cc`. Fontes: TASKS.md T15, docs/FONTES-HISTORICO.md, conversa e decisão explícita do usuário **Disponível e comprovado**. Commit local autorizado; sem push/deploy.

## Aceite acordado e limite

Importar o histórico disponível com contratos comprovados, período, proveniência, retomada e IDs estáveis; fonte/input sem dados recuperáveis recebe diagnóstico explícito. Não prometer cobertura nativa integral de todos os formatos Claude/Codex. O usuário aceitou encerrar esse escopo com limitações documentadas; formatos sem contrato ficam fora do aceite, não viram suporte presumido.

Não ler/varrer transcrições pessoais. Amostra Codex limitada às duas sessões de teste próprias já autorizadas: `01a1bdf7-4e0e-7122-bbf6-f2726fdf393e` e `01a1bdf7-5f22-7e41-966a-3960abe637ce`. Coleta original permanece read-only; importação em store temporário isolado, sem instalar serviço ou instrumentação da identidade restaurada.

## Landing

Reutilizar importHistory, recibos filtrados e normalizados reais, registerInstallation e projeções existentes. Não alterar schemas, parser antigo ou remover warnings. Copiar apenas dez recibos referenciados pelos IDs da amostra para o store temporário, preservando eventos/sourceId/installationId/horários originais, sem remapear identidades para esconder duplicação.

## Checks

### S1 — Prova real de recuperação Codex · leitor/projeções existentes · ~18k tokens

**C1** — Os dez eventos das duas sessões reais são recuperados pelo parser `codex-receipts-v1` em store vazio com os IDs e documentos normalizados originais; replay após reabertura insere zero.
Proof: `npm exec -- tsx scripts/smoke-codex-recovery.ts`, assertions dos dez IDs/documentos e contagens 10/0.

**C2** — As duas sessões recuperadas ficam associadas aos projetos Worklog/Posicionadas corretos, proveniência imported, zero dedicação estimada e zero revisões/eventos humanos/arquivos.
Proof: mesmo comando, assertions por sessão e deriveTime.

**C3** — A seleção restrita a um dos projetos e período [from,to) não inclui a outra sessão; a recuperação não altera os dez recibos originais (hash antes/depois) nem usa conexão de escrita no banco pessoal.
Proof: mesmo comando, assertions de filtro e hashes; DatabaseSync readOnly=true.

### S2 — Regressão dos contratos e limitações · suites existentes · ~25k tokens

**C4** — Importação das três ferramentas preserva replay/live/proveniência, formato inválido/truncamento e cancelamento/retomada; logs v2 sem eventos não são sucesso fictício.
Proof: `npm run test:unit -- tests/collectors/history.test.ts tests/collectors/opencode-history.test.ts`, testes `histórico: três fontes, período, replay/live e proveniência`, `histórico: truncamento, formato, timestamp e retomada`, `histórico: cancelamento e escopo autorizado`, `log v2: identidade, autorização e formatos desconhecidos`.

## Swept

- Validação: versão Codex e cinco tipos por sessão exatos antes de copiar recibos; contrato validateEvent existente.
- Falhas: falta/alteração de recibo recusa ensaio; nenhuma simulação substitui prova real.
- Idempotência/retry: C1, reabertura e replay.
- Autorização: somente dois IDs nativos próprios e roots escolhidas; sem descoberta de conversas.
- Concorrência/ordenação: banco origem read-only; recibos individuais imutáveis; C3 hashes.
- Ciclo de dados: identidade preservada apenas no store isolado; cleanup somente desse diretório criado pelo ensaio.
- Dependências externas: ensaio de recibos offline, sem modelo/API de IA. Indisponibilidade dos logs nativos continua explícita.
- Estados: C2 distingue importado de observado e não fabrica atenção humana, revisões ou lifecycle ausente.
- Observabilidade: relatório com IDs/contagens/avisos fixos, sem payload bruto; erros sanitizados.

## Handoff

S1+S2 ~43k de leitura, um lote abaixo de 150k. Verificador independente após último commit. Decisão humana registrada acima substitui obrigação de cobertura integral sem enfraquecer provas dos parsers existentes.

## Resultados do autor

- C1–C3: `npm exec -- tsx scripts/smoke-codex-recovery.ts` PASS: import10/replay0 após reabrir, documentos/IDs iguais à origem, duas sessões imported, seleção1, zero dedicação/revisões. Somente recibos próprios lidos por readPrivate, origem SQLite read-only.
- C4: oito testes unitários do comando declarado passaram, sem skips.
- Prova adicional nativa já existente: `npm run smoke:history -- --database /Users/lucasruon/.local/share/opencode/opencode.db --root /Users/lucasruon/Downloads/Sistemas/Worklog --from 2026-11-06T13:55:00.000Z --to 2026-11-06T14:05:00.000Z`: 46 IDs/importações, replay0, resumo46, zero humano/revisões. Não é amostra Codex rollout nem log OpenCode v2.
- Typecheck aprovado. Antes do commit base fa121cc, regressão completa 158 unitários/32 integração/30 E2E e build aprovados; nenhum código do produto foi alterado depois dessa base, apenas prova operacional/documentação.
- Pesquisa read-only independente fundamentou disponibilidade de logs migrados só com watermark e a limitação atual a logs contíguos. Esta limitação foi acrescentada explicitamente em FONTES-HISTORICO; não se alega suporte integral nem se mudam testes antigos.

Verificador fresco ainda deve executar C1–C4 antes de declarar T15 concluída no aceite negociado.
