# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Lucas (usuário principal e único operador):** desenvolvedor que trabalha em vários projetos ao mesmo tempo, localmente no Mac e remotamente no `macmini` via SSH, com agentes de IA (Claude Code, Codex, OpenCode). Usa o painel ao longo do dia para consultas rápidas, em paralelo ao trabalho, e periodicamente (fim do dia/semana) para revisar o que avançou e preparar relatórios.
- **Clientes (leitores indiretos):** não acessam o painel, mas recebem os relatórios exportados (CSV/PDF). Os relatórios precisam ser apresentáveis e confiáveis para terceiros, com estimativas claramente rotuladas como estimativas.

## Product Purpose

Consultar o que foi trabalhado em cada projeto, como o trabalho avançou e quanto tempo foi dedicado, reunindo Claude Code, Codex, OpenCode, Git, arquivos e PRs em um histórico único, com exportação dos projetos selecionados. Sucesso: responder "o que fiz, onde e quanto tempo" sem precisar lembrar ou reconstruir manualmente, e entregar a um cliente um relatório que se sustenta pelas evidências.

## Positioning

Rastreabilidade honesta: dedicação humana estimada, execução de IA acumulada e execução de IA no relógio são medidas separadas e nunca somadas; cada número mostra origem e natureza; inferências temporais são marcadas como inferências e a associação explícita prevalece. Tudo roda localmente, sem nuvem, sem keylogging e sem gravar prompts ou transcrições brutas.

## Operating Context

- Coleta automática em segundo plano por hooks/plugins das ferramentas, serviços de usuário no Mac e no host remoto, e sincronização por SSH; o painel pode ficar fechado.
- Painel web local em loopback (`127.0.0.1:4320`), autenticado por `npm run cli -- open`.
- Fuso padrão `America/Sao_Paulo`; períodos com início inclusivo e fim exclusivo.
- Fluxo: cadastrar raízes de projeto → registrar fontes → trabalhar normalmente → consultar visão geral, atividade, arquivos e commits → exportar relatório.

## Capabilities and Constraints

- Telas: Visão geral, Projetos, Atividade, Arquivos, Commits, Exportação, Integrações; detalhe de sessão e de revisão em diálogos.
- Exportação CSV e PDF apenas dos projetos explicitamente selecionados.
- Stack existente: Node 24, TypeScript, React 19 + Vite, SQLite (`node:sqlite`); CSP restrita a `'self'` (sem fontes ou scripts externos).
- Interface em português do Brasil.
- Fora do escopo: múltiplos usuários, cobrança/notas fiscais, gravação de tela, publicação em nuvem, edição de PRs.
- Detalhe de projeto: sessões, resumo, revisões/diffs, commits, PRs e diagnósticos; snapshots de PRs são somente leitura, com indisponibilidade explícita. Conferência de PR real no piloto ainda pendente.

## Brand Commitments

- Nome: **Worklog**, monograma `w.`.
- Layout do mockup aprovado pelo usuário; a paleta verde pastel foi rejeitada e substituída por grafite e neutros frios. O formato atual da interface (sidebar, topbar, painéis) é aprovado e deve ser preservado.
- Sem estética decorativa de IA.
- Voz: factual, precisa, sem exagero; rótulos distinguem estimativa, observação e inferência.

## Evidence on Hand

- Dados reais vêm apenas da coleta; a aplicação não exibe números ilustrativos nem dados de demonstração.
- Mockup de referência em `referencias/mockup/` (referência visual, não fonte de dados).
- Não há depoimentos, clientes nomeados ou métricas de uso para citar.

## Product Principles

1. Nunca fabricar tempo: sem evidência suficiente, o trecho fica não atribuído.
2. Toda medida declara sua natureza (estimativa, observação, inferência) e origem.
3. Privacidade por padrão: coletar só metadados filtrados das raízes autorizadas.
4. Falhas e lacunas ficam visíveis, nunca ocultadas.
5. Funcionar sem atrito no trabalho diário: coleta silenciosa, consulta rápida.

## Accessibility & Inclusion

Desktop e celular; navegação completa por teclado; contraste WCAG AA nos dois temas (claro e escuro); respeitar `prefers-reduced-motion`.
