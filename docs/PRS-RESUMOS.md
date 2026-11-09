# PRs e resumos — T18/T19

Implementação de backend em 07/11/2026. **Verificação independente PASS em 08/11**, incluindo contratos de datas, estados desconhecidos e resumos filtrados. T20 retomada: detalhe completo do projeto/navegação implementados; conferência de PR real ainda pendente. T21 incorpora PRs, notas e revisões/diffs ao relatório conforme a seleção; guia em [RELATORIOS-AJUSTES-RECUPERACAO.md](RELATORIOS-AJUSTES-RECUPERACAO.md). Relatório: `.checks/continuacao.verified.md`.

## GitHub somente leitura

`src/providers/github.ts` usa `gh api --method GET --hostname github.com` com a autenticação já disponível no CLI. Não obtém nem armazena token. Comandos são executados com argv separado, timeout, saída limitada e cancelamento no shutdown. Apenas repositórios GitHub canônicos cadastrados com raiz habilitada podem ser consultados.

Os snapshots incluem número, título, autor, branches, draft, datas, SHA da head, merge, revisões, checks e commits explicitamente retornados no PR. **Fechado não é mesclado**, check ausente não é aprovado e chamada de ferramenta concluída não comprova teste aprovado.

- Paginação de lista/enriquecimento até 100 páginas por recurso; limite excedido fica como erro, sem equivalência a resultado completo.
- Páginas da lista são normalizadas antes do cache; ETag/304 reutilizam metadados. Revisões/checks são atualizados separadamente.
- 401/403/offline preservam snapshots e sinalizam stale. Permissão ausente de revisão/check aparece como `unavailable`, não sucesso.
- Intervalo padrão **5 min**. `Retry-After`, reset de quota, rate limit primário/secundário e backoff são respeitados mesmo em solicitação manual. Cache antigo não é apagado em falha.
- Sincronização periódica começa somente após a primeira solicitação explícita de sincronização do repositório. Não há acesso GitHub incidental ao abrir uma base vazia.
- A coleta automática do servidor fica ativa apenas enquanto esse processo estiver em execução; os agentes remotos existentes não foram redeployados nesta entrega.

CLI:

```sh
npm run cli -- prs repositories
npm run cli -- prs sync --repository-id UUID
npm run cli -- prs list --from "2026-11-01T00:00:00.000Z" --to "2026-12-01T00:00:00.000Z"
```

O repositório do piloto respondeu à API real sem erro: **zero PRs disponíveis** na consulta atual. Isso prova transporte/autenticação/leitura da lista vazia; o aceite de conferir um PR real e seus links permanece pendente, sem inventar um PR para concluir T18.

```sh
npm run smoke:github
```

Esse smoke cadastra somente a raiz corrente numa base temporária, usa GET e remove a base ao terminar. Não cria/comenta/aprova/mescla PRs.

## Resumo determinístico

`buildWorkSummary(ctx,filter)` retorna `{text,evidenceIds,ruleVersion}`. A regra atual é **`evidence-summary-v1`**, sem API de IA. Os snapshots são preservados em `work_summaries` com filtro, versão e IDs.

Seções: **Solicitado**, **Realizado**, **Verificado**, **Pendências e limites**. Como o conteúdo dos pedidos não é armazenado, essa ausência é explícita. Fatos verificáveis levam `[evidência: UUID]` e apontam para evento, revisão, commit ou snapshot de PR. Checks são apresentados como último resultado do provedor, sem inferir que o trabalho terminou. Lacunas e interrupções continuam visíveis.

O resumo usa os mesmos filtros por projeto, período, máquina, ferramenta e fonte. Fontes sem comprovação de autoria não recebem commits/arquivos/PRs por aproximação temporal. Limites: 500 eventos e 100 arquivos/commits/PRs por seção, com aviso de resumo parcial; texto acima de 1 MiB é recusado.

O ponto de extensão é o resultado tipado e a função isolada do gerador. Uma síntese futura pode consumir evidências sem tornar IA externa uma dependência do produto inicial.

## Endpoints implementados

| Método | Rota | Contrato |
|---|---|---|
| GET | `/api/prs` | Lista autenticada com `ReportFilter`, cursor/limit≤100, snapshots e estado dos repositórios selecionados |
| POST | `/api/prs/sync` | `{repositoryId}`; solicita leitura e retorna contagem/stale/diagnóstico/retry |
| GET | `/api/work-summary` | Resumo e IDs para `ReportFilter`; separado de `/api/summary`, que continua retornando tempos |

## Provas e pendências

- `tests/providers/github.test.ts`: páginas, draft/open/closed/merged, revisão/check sem permissão, falha de check, ETag/304, 401/403/offline/rate limit, cancelamento seguro e GET exclusivo.
- `tests/integration/pull-requests.test.ts`: autenticação, filtro, repo cadastrado, cache stale e estado persistido.
- `tests/core/summaries.test.ts`: falhas/interrupções, PR aberto e check falho, ausência de pedido, referência por alegação, determinismo e persistência.
- Smoke histórico real também gerou resumo das 46 evidências do Worklog; não foram lidos prompts ou fabricados resultados de verificação.
- T20: retomar na outra sessão o rascunho do detalhe/navegação, conforme adiamento expresso. T21 já integra PRs/notas/revisões/diffs ao relatório. T12: captura Codex real ainda depende da revisão nativa em `/hooks`.
