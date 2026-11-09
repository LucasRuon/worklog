# Primeiro uso — fluxo automático

A automação local e remota já foi instalada nesta máquina. Contratos e evidências em [AUTOMACAO.md](AUTOMACAO.md); comandos administrativos em [OPERACAO.md](OPERACAO.md).

## 1. Trabalhar normalmente

No Mac, abra **OpenCode 2.2.5** dentro do projeto sob:

```text
/Users/lucasruon/Downloads/Sistemas
```

No `ssh macmini`, abra **Claude 2.1.319** dentro do projeto sob:

```text
/home/lucas/projetos
```

No dia a dia, os comandos são apenas `opencode` ou `claude`, dentro da pasta desejada. Novas sessões e raízes são detectadas; você não precisa informar um ID de sessão ou cadastrar cada repositório manualmente.

Para janelas antigas, feche e abra a ferramenta uma vez após a instalação. O plugin OpenCode já foi confirmado ativo no runtime atual e os hooks remotos foram validados com uma sessão Claude real.

## 2. Abrir o painel

No diretório Worklog:

```sh
npm run dev
```

Em outro terminal:

```sh
npm run cli -- open
```

O painel abre em `http://127.0.0.1:4320` com autenticação local. Se já estava executando durante a atualização, reinicie o servidor uma vez para carregar os endpoints novos.

Os agentes de coleta são independentes do servidor HTTP: continuam processando e sincronizando com navegador/terminal fechados. O Mac usa launchd de usuário; o macmini usa systemd de usuário com linger habilitado.

## 3. Consultar os dados

- **Visão geral:** projeto, sessões, execução acumulada de agentes, união de relógio e dedicação estimada.
- **Atividade:** eventos observados com ferramenta, perfil, máquina e período.
- **Detalhes da sessão:** clique no projeto na linha da sessão para ver início/última evidência e pares de execução disponíveis.
- **Integrações:** pastas autorizadas, serviço local, fontes recebidas e sincronização SSH. O filtro de máquina identifica `macmini` pelo alias.
- **Projetos:** raízes descobertas aparecem no projeto correspondente. Remote Git normalizado unifica clones/worktrees; o nome da pasta sozinho não unifica identidades. Associação manual permanece disponível para projetos com múltiplos repositórios ou sem Git.
- **Commits:** histórico Git com mensagem, autoria, arquivos elegíveis e refs observados. Use **Reindexar Git** para antecipar a coleta e amplie o período para commits antigos. A ferramenta precisa estar em Todas ou Git.
- **Arquivos:** revisões observadas entre commits, conteúdo elegível e diff para a revisão anterior. No detalhe da sessão, **Arquivos relacionados** leva às revisões; nelas, você pode abrir sessões/commits e fazer associação explícita. Veja limites e lacunas em [ARQUIVOS.md](ARQUIVOS.md).
- **Exportação:** marque os projetos no seletor, escolha período/máquina/ferramenta, clique em **Gerar prévia** e depois **Baixar CSV** ou **Baixar PDF**. A prévia congela os dados por até 15 min. Uso e limites em [GIT-EXPORTACAO.md](GIT-EXPORTACAO.md).

As datas da UI incluem o dia final; as consultas usam `[from,to)` em UTC com corte em `America/Sao_Paulo`.

## 4. Sinalizar dedicação

Execução de IA não comprova dedicação humana. Use **Registrar dedicação** e escolha o projeto local quando quiser iniciar uma janela estimada; o padrão é 5 min. Novo sinal renova a janela ou troca o projeto; **Pausar** encerra o trecho.

Sinais mínimos disponíveis de inatividade/bloqueio e lacunas de observação também encerram janelas. A UI informa a disponibilidade. Em Integrações, a janela pode ser configurada entre 1 e 60 min, reprocessando os sinais preservados.

O adapter não copia prompts, respostas, comandos nem resultados para o Worklog. Trechos humanos ambíguos ficam não atribuídos; tempos humanos e de agentes não são somados.

## 5. Recuperar e diagnosticar

```sh
npm run cli -- service status
npm run cli -- remote status
npm run cli -- remote service --host macmini --action status
npm run cli -- collect
```

Em queda SSH, o backlog remoto permanece no host e é retomado depois. A importação confirma cursor e eventos juntos e aceita replay sem duplicação.

## Configuração em uma instalação nova

Esta instalação já está pronta. Para reproduzir em outra, compile e autorize as pastas conscientemente:

```sh
nvm use
npm ci
npm run build
npm run cli -- automation install --workspace "/pasta/dos/projetos"
npm run cli -- service install --central
```

A instalação do coletor remoto e seus caminhos de runtime estão documentados em [OPERACAO.md](OPERACAO.md). A conta Claude deve funcionar no próprio host; o Worklog não recebe sua credencial.

O leitor manual OpenCode 1.19.5 foi usado no M1 original e ficou como legado; o fluxo atual usa o plugin v2 e dispensa `opencode connect`.

## Dados

Mac: `~/Library/Application Support/Worklog`. Na instalação atual do macmini: `/home/lucas/.local/share/worklog/data`. Banco, manifesto e fila ficam privados e fora dos projetos monitorados.

Para um diretório alternativo, repita `--data-dir` em todos os comandos Worklog ou defina `WORKLOG_DATA_DIR`. Para porta alternativa, repita `--port` em `serve`/`dev` e `open`. Parar processamento e remover instrumentação são ações distintas, explicadas em [OPERACAO.md](OPERACAO.md).
