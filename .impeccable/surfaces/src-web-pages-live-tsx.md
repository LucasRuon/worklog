---
version: 1
slug: "src-web-pages-live-tsx"
primary_target: "src/web/pages/Live.tsx"
related_targets: []
---

# Painel ao vivo (`?view=live`)

Escopo: superfície de monitor ao lado da mesa (~1 m), sem cliques, atualização automática. Modo: Operate.
Usuário: o operador único acompanhando o que os agentes executam agora e o acumulado de hoje.
Restrições: dados reais apenas; dedicação (estimativa) e IA nunca somadas; títulos de tasks só com opt-in.

## Direction contract

THESIS: Hoje como um fluxo vivo: o que acontece agora entra no topo da coluna Agora e empurra o resto; recusa o mural de cartões de BI genérico.
OWN-WORLD: grafite #121519/#181b20, tinta #e6e9ed, linhas de 1 px #2a2f36; dedicação em aço #8eaacb, IA em grafite claro #6b7785, estado ativo #5cbf92, aguardando #e3c48f; algarismos tabulares grandes, sem cartões arredondados.
STORY: num olhar, quantas horas de dedicação e de IA hoje, quais projetos (por cliente) avançaram, e o que cada agente está fazendo neste segundo, incluindo a task quando capturada.
FIRST VIEWPORT: barra fina (marca, agentes ativos, relógio); faixa de 4 totais a 52 px; abaixo, 2 colunas: projetos por cliente com barras pareadas (esquerda, flexível) e coluna Agora de ~520 px com sessões ativas fixas no topo e eventos recentes abaixo.
FORM: Fluxo ao vivo, posição 5 da lista ordenada; seed key af693fc3. Raise do quadro de partidas: linha que muda de estado mantém destaque até a próxima atualização.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
