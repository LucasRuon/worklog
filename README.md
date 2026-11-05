# Worklog

Planejamento inicial do sistema pessoal de acompanhamento de projetos, trabalho com agentes e tempo. Criado em 05/11/2026.

**Situação:** escopo documentado e tarefas preparadas. A implementação e a instalação dos coletores ainda não começaram. Todos os itens do backlog estão pendentes.

## Por onde começar

1. Ler [Especificação](docs/ESPECIFICACAO.md).
2. Ler as decisões propostas e os contratos em [Arquitetura](docs/ARQUITETURA.md).
3. Executar [T01 a T08](TASKS.md), em ordem: esse é o primeiro marco utilizável, com coleta local do Claude Code e painel com dados reais.
4. Prosseguir com Git, arquivos, outras ferramentas, Mac mini, PRs e exportação conforme as dependências.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [TASKS.md](TASKS.md) | 24 tarefas com prioridade, dependências, arquivos propostos e critérios verificáveis. |
| [tasks.csv](tasks.csv) | Mesmo backlog em formato tabular, para importar em um gerenciador de tarefas. |
| [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) | Requisitos acordados, limites e comportamento esperado. |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Stack proposta, fluxo de dados, modelo e interfaces. |
| [docs/FONTES.md](docs/FONTES.md) | Documentação técnica consultada e verificações de compatibilidade necessárias. |
| [referencias/mockup/index.html](referencias/mockup/index.html) | Cópia independente do mockup navegável em grafite. Abrir no navegador. |
| [referencias/mockup/DESIGN.md](referencias/mockup/DESIGN.md) | Referência visual do mockup. |
| [referencias/capturas/desktop.png](referencias/capturas/desktop.png) | Prévia visual desktop. |
| [referencias/capturas/mobile.png](referencias/capturas/mobile.png) | Prévia visual mobile. |

## Marcos

| Marco | Tarefas | Resultado |
|---|---|---|
| M1 — Primeiro uso local | T01–T08 | Claude Code → sessões → dedicação estimada → painel local. |
| M2 — Evidências do trabalho | T09–T11 | Commits, alterações de arquivos, versões e associações com sessões. |
| M3 — Três ferramentas | T12–T15 | Codex, OpenCode, múltiplas contas e importação histórica. |
| M4 — Trabalho remoto | T16–T17 | Coleta no Mac mini e sincronização por SSH. |
| M5 — Histórico completo | T18–T20 | PRs, resumos e telas completas por projeto. |
| M6 — Uso cotidiano | T21–T24 | Exportações, ajustes de tempo, operação e piloto real. |

## Convenções

- P0: primeiro marco local. P1: escopo principal após a base. P2: fechamento operacional do produto; não significa dispensável.
- Ordem sugerida: numeração das tarefas; dependências são obrigatórias. Não iniciar frentes simultâneas sem necessidade.
- Marcar uma tarefa concluída somente com seus critérios de aceite e evidências de validação.
- Tempo humano estimado, execução de agentes e duração da sessão são medidas distintas.
- O mockup contém dados ilustrativos; o aplicativo real deve começar vazio.
- Valores de configuração e stack que não foram escolhidos pelo usuário estão identificados como propostas técnicas nos documentos.

O pedido desta etapa é gerar as tarefas. Estes arquivos não iniciam serviços, não alteram configurações de Claude/Codex/OpenCode, não instalam nada no Mac mini e não criam tarefas em serviços externos.
