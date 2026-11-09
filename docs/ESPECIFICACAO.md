# Especificação do Worklog

Data: 05/11/2026. Origem: requisitos discutidos com Lucas. Nome de trabalho: Worklog.

## Objetivo

Consultar o que foi trabalhado em cada projeto, como o trabalho avançou e quanto tempo foi dedicado, reunindo Claude Code, Codex, OpenCode, Git e PRs. Incluir atividade local e no host acessado por `ssh macmini`, com exportação dos projetos selecionados.

O sistema começa pessoal, local e com armazenamento SQLite. O layout do mockup foi aprovado; a paleta verde pastel foi rejeitada e substituída por grafite e neutros frios. O mockup copiado em `referencias/mockup/` é referência visual, não código de produção nem fonte de dados reais.

**Atualização de aceite em 06/11/2026:** por orientação do usuário, o primeiro marco é validado com a sessão local do OpenCode, sem depender de conta Claude. A integração mínima de observação do OpenCode foi antecipada da T13; o restante do backlog e a validação específica do Claude permanecem rastreados separadamente. Evidências em `M1.md`.

## Acordado com o usuário

- Coleta automática em segundo plano, por projeto e ferramenta.
- Painel próprio com visão geral, projetos, atividades e exportação.
- Sessões, descrição do trabalho, abordagem, verificações registradas e pendências.
- Dedicação estimada separada da execução de IA; não duplicar horas humanas em trabalhos paralelos.
- Registro de origem por máquina e integração do trabalho feito no Mac mini por SSH.
- Git: commits, autores, datas, branches, hashes e arquivos envolvidos.
- PRs: abertos, rascunhos, fechados, mesclados, revisões e verificações disponíveis no provedor.
- Histórico dos arquivos criados, editados, renomeados ou excluídos, inclusive antes do commit.
- Diffs e associação entre projeto, sessão, arquivo, commit e PR quando houver evidência.
- Seleção de vários projetos e período para exportar relatórios.
- Interface em português, usando a direção visual da skill impeccable, sem estética decorativa de IA.

## Decisões técnicas propostas neste planejamento

Estas decisões permitem executar o backlog; são recomendações do agente, não preferências declaradas pelo usuário.

- Node.js 24 LTS, TypeScript, SQLite e frontend React com Vite. Aplicação única com módulos por responsabilidade, sem microserviços ou plataforma de filas.
- Driver SQLite nativo `node:sqlite`, isolado em um módulo. A documentação consultada classifica a API como release candidate; T01 valida o runtime nos dois sistemas antes da implantação remota. Não usar APIs que exijam patch mais novo que o runtime fixado.
- GitHub como primeiro provedor de PRs. T01 identifica os remotes realmente usados; se forem de outro provedor, adaptar T18 ao provedor observado antes de implementá-la.
- CSV e PDF no primeiro produto completo. CSV abre no Excel/Sheets; arquivo XLSX nativo fica fora da primeira versão.
- Resumos determinísticos com evidências no início. Síntese por LLM é evolução opcional e não exige contratar ou configurar uma API para iniciar o projeto.
- Dedicação é uma estimativa pessoal revisável. O produto inicial não transforma esse número automaticamente em horas faturáveis.

## Fluxo principal

1. Cadastrar os projetos e suas pastas/repositórios; autorizar apenas essas raízes para coleta.
2. Registrar as fontes disponíveis e suas contas, distinguindo local e Mac mini.
3. Trabalhar normalmente nas ferramentas.
4. Receber eventos duráveis do coletor, reconstruir sessões e projetar o histórico.
5. Consultar tempo, contexto, arquivos, commits e PRs no projeto.
6. Revisar notas, classificações e ajustes de dedicação.
7. Selecionar projetos, período, formato e conteúdo do relatório.

## Identidade dos projetos e fontes

Um projeto pode conter vários repositórios e pastas, em várias máquinas. Worktrees do mesmo repositório compartilham sua identidade; manter a worktree de origem na atividade. Dois clones podem ser unificados pelo remote normalizado ou por associação explícita. Nunca usar apenas o nome da pasta como identidade global.

Cada fonte tem máquina, instalação, ferramenta e perfil/conta. Várias instalações ou contas de Claude Code podem coexistir. Eventos sem projeto ficam numa área de revisão para associação posterior, sem descarte silencioso.

## Regras de tempo

- **Duração da sessão:** intervalo observado entre começo e fim; pode conter pausas e não representa dedicação.
- **Execução de IA:** união dos intervalos em que aquela sessão/agente está executando. No total, podem ser exibidas horas acumuladas de agentes e tempo de relógio ocupado; os rótulos devem distinguir ambos.
- **Dedicação estimada:** intervalos estimados a partir de interação humana e, quando disponível, atribuição confiável da janela/sessão em foco. Não inferir dedicação contínua pelo volume de eventos da IA.
- Somar união de intervalos, não duração bruta de sessões, para o tempo humano global.
- Havendo disputa entre projetos, usar ajuste explícito do usuário; depois foco comprovado; sem evidência suficiente, manter o trecho como não atribuído. Nunca repartir arbitrariamente para preencher o total.
- Sem foco confiável, a proposta inicial usa janelas de até 5 minutos após interação humana, interrompidas pelo próximo projeto, pausa, bloqueio ou ajuste. Essa regra deve ser visível e configurável; o relatório marca a medida como estimativa.
- Não registrar teclas, conteúdo da área de transferência ou capturas de tela para medir atividade.
- Ociosidade, bloqueio e suspensão interrompem janelas de dedicação. Execução remota pode continuar.
- Um agente no Mac mini pode executar enquanto o usuário trabalha em outro projeto local. Contar a execução remota sem fabricar dedicação remota.
- Guardar UTC e fuso na origem. Períodos da interface usam `America/Sao_Paulo` por padrão; início inclusivo e fim exclusivo. Testar virada do dia e horário de verão em outros fusos.
- Ajustes são auditáveis e não alteram os eventos originais.

## Histórico e evidências

O Git recupera versões commitadas. O histórico entre commits começa com o monitoramento e depende do que foi observado; não existe promessa de preservar cada tecla ou estado intermediário.

Monitorar eventos de gravação e reconciliar o estado periodicamente. Registrar arquivo, operação, horário observado, máquina, worktree e origem quando conhecida. Para texto elegível, armazenar revisões e diffs com limites. Binários e arquivos grandes recebem metadados, sem tentativa de diff textual.

Proposta inicial de limites: debounce de 500 ms, reconciliação a cada 30 s, conteúdo textual até 2 MiB por revisão e retenção das revisões intermediárias por 30 dias. Explicitar quando um limite impediu preservar conteúdo. A operação de renomear pode aparecer como criação/exclusão quando o sistema não fornecer identidade suficiente; informar a confiança.

Excluir `.git`, dependências, builds e arquivos ignorados pelo Git por padrão. Negar conteúdo de `.env*`, chaves privadas e credenciais. Exceções seguras de arquivos de exemplo devem ser explícitas. Não seguir symlinks para fora das raízes autorizadas. Não armazenar prompts, resultados completos de comandos e transcrições brutas por padrão; extrair apenas informações necessárias e filtradas.

Associação explícita tem precedência sobre inferência por janela temporal/arquivos. Várias sessões podem disputar a mesma mudança; nesse caso, marcar como ambígua ou não vinculada. Um commit existente em duas máquinas deve aparecer uma vez por repositório. Commits antigos não comprovam horas trabalhadas nem autoria por IA.

## PRs

Coleta de leitura: repositório, número, título, autor, URL, branches, estado, rascunho, datas, SHA da head e merge. Revisões e checks são entidades complementares; ausência de permissão ou dado não significa aprovado.

O painel diferencia rascunho, aberto, fechado sem merge e mesclado. Exibir instante da última atualização e dado desatualizado em caso de falha/offline. Não criar, comentar, aprovar ou mesclar PRs pelo monitor.

## Sincronização com o Mac mini

Um coletor independente registra eventos no host remoto e continua ativo com SSH fechado ou sessão em tmux. O Mac principal busca lotes pelo SSH já configurado; não abrir servidor remoto para a internet.

Cada instalação tem identificador persistente e sequência crescente. Cursor só avança após persistência do lote. Repetir um lote não duplica eventos. Não copiar um banco SQLite em uso como mecanismo de sincronização. Em desconexão, mostrar atraso e recuperar o backlog na próxima conexão.

Na verificação anterior, `macmini` respondeu como Linux x86_64 e foi encontrada uma instalação de Claude Code. Isso é observação, não garantia permanente; T01 revalida sistema, runtime e fontes. Codex/OpenCode remotos só aparecem ativos se realmente instalados e testados.

## Painel

- Visão geral: período, dedicação, execução de IA, sessões, distribuição por projeto/ferramenta e atividade recente.
- Projetos: busca, agrupamento por cliente, detalhes, notas, contexto e seleção múltipla.
- Atividades: busca e filtros por projeto, ferramenta, conta, máquina e período.
- Projeto: sessões, resumo, arquivos/revisões, commits, PRs e próximos passos.
- Integrações: capacidade detectada, conectado/desconectado, última atividade e erro recuperável.
- Área sem projeto: associar eventos sem inventar correspondência.
- Estados vazios e falhas reais; nenhum número ilustrativo na aplicação final.
- Desktop e celular; navegação por teclado e contraste AA.

## Relatórios

Selecionar projetos + período + máquinas + ferramentas, reutilizando os filtros de consulta. Escolher inclusão de sessões, resumos, notas, arquivos, commits, PRs e diffs completos opcionais.

CSV deve abrir corretamente com acentos, tratar quebra de linha e neutralizar fórmulas de planilha. PDF deve conter somente a seleção e paginação legível. Diferenciar dedicação estimada e ajustada, execução de IA e trechos não atribuídos; não apresentar estimativa histórica como tempo observado.

## Operação

Aplicação pessoal ligada em loopback; autenticar ingestão e ações mutáveis para impedir acesso de páginas arbitrárias. Segredos em armazenamento local apropriado, nunca nos eventos, no frontend ou na exportação.

Coleta pausável, sem travar as ferramentas de desenvolvimento. Filas locais preservam eventos com o painel fechado; falhas de hook não interrompem o agente. Serviço inicia na sessão do usuário, com status e diagnóstico simples. Backup e restauração devem ser testados.

## Fora da primeira versão

Times/múltiplos usuários, cobrança e emissão de notas, keylogging, gravação de tela, publicação em nuvem, edição de PRs, suporte automático a todos os provedores de Git e qualquer promessa de medir atenção humana com precisão absoluta.

## Conclusão do produto inicial

Três ferramentas locais com compatibilidade comprovada, coleta remota do Claude Code no Mac mini, projetos unificados, tempo sem duplicação humana, Git/PRs/arquivos consultáveis e exportações selecionadas. Indisponibilidade de uma fonte deve ficar visível e justificar sua limitação, não ser ocultada para declarar o produto completo.
