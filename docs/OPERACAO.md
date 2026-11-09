# Operação do coletor automático

**Atualização T21/T22/T23 (08/11):** relatórios completos, ajustes/notas e procedimentos de configuração, retenção, backup e restauração estão em [RELATORIOS-AJUSTES-RECUPERACAO.md](RELATORIOS-AJUSTES-RECUPERACAO.md). Há novos comandos `maintenance`; restauração é somente em destino novo. T20 retomada e verificação independente concluída com PASS, 33/33 checks. Código/provas não significam redeploy dos serviços pessoais; piloto prolongado permanece T24.

Estado e evidências da instalação atual: [AUTOMACAO.md](AUTOMACAO.md).

## Consultar o painel

No diretório Worklog:

```sh
npm run dev
```

Em outro terminal:

```sh
npm run cli -- open
```

O servidor HTTP é independente dos agentes de fundo. Se já estava aberto durante a atualização, reinicie `npm run dev` uma vez para carregar os endpoints novos. A coleta continua pelo serviço.

## Status e sincronização

```sh
npm run cli -- service status
npm run cli -- remote status
npm run cli -- remote service --host macmini --action status
npm run cli -- remote sync --host macmini
npm run cli -- collect
```

Integrações mostra os workspaces, o serviço local, as fontes e o estado de sincronização. Falha SSH não avança o cursor. Relógio divergente aparece explicitamente. Arquivos `.json.rejected` ficam no diretório de fila para diagnóstico; não são tratados como importados.

**Arquivos** mostra a cobertura das revisões por raiz, incluindo importação parcial, pasta indisponível e última lacuna. Eventos, Git e revisões têm cursores independentes. A carga inicial de projetos grandes continua em lotes. Pastas temporárias de verificações antigas já removidas permanecem cadastradas com diagnóstico; removê-las/pausá-las pela gestão completa de configuração é T23.

`agent git` e `agent files` exportam dados persistidos; a varredura pertence ao serviço ou a `collect`. Cada família tem orçamento de 10 s entre páginas, além do timeout da requisição em andamento. Durante atualização, o instalador espera o encerramento do serviço Linux por até 120 s; isso permite concluir uma rodada em andamento antes de trocar o processo. O release remoto só precisa do Node e dos arquivos distribuídos, sem pacotes npm de geração de PDF/diff.

## Parar ou reiniciar processamento

```sh
npm run cli -- service stop
npm run cli -- service start
npm run cli -- remote service --host macmini --action stop
npm run cli -- remote service --host macmini --action start
```

Parar o agente interrompe processamento de fundo, não desinstala a instrumentação: plugins/hooks ainda podem enfileirar metadados privados. O SSH export também pode consumir a fila remota. Para desligar a instrumentação, use a remoção abaixo.

## Remover instrumentação e serviços

Local:

```sh
npm run cli -- automation remove
npm run cli -- service remove
```

Remoto, a partir do Mac:

```sh
npm run cli -- remote remove --host macmini
```

O comando remoto remove somente os handlers Claude gerenciados pelo Worklog, desinstala seu serviço de usuário e desabilita a sincronização desse host. Hooks alheios e histórico permanecem. Releases e bancos ficam preservados para recuperação; restauração/purga de dados é T23. Linger não é revertido automaticamente porque é uma configuração compartilhada do usuário Linux.

## Instalar ou atualizar

Compile antes de testes que executam o entrypoint distribuído:

```sh
npm ci
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

Atualize a instrumentação e reinicie os agentes gerenciados:

```sh
npm run cli -- automation install --workspace "/Users/lucasruon/Downloads/Sistemas"
npm run cli -- service install --central
npm run cli -- remote install --host macmini --node "/home/lucas/.nvm/versions/node/v24.21.0/bin/node" --workspace "/home/lucas/projetos" --config "/home/lucas/.claude/settings.json"
```

Instalações são por merge/arquivos gerenciados: arquivos alheios não são substituídos. Dados e identidade de instalação ficam fora dos releases; cursor e histórico sobrevivem à atualização. Os handlers antigos da mesma fonte são substituídos para evitar execução em dobro.

As versões medidas nesta instalação são OpenCode 2.2.5 e Claude remoto 2.1.319. Uma versão não suportada deve ser validada antes de alterar o contrato. O leitor de banco OpenCode 1.19.5 permanece como legado, não como instrução diária da automação atual.

## Autorizações

Configure uma ou mais pastas-pai, passando `--workspace` repetidamente:

```sh
npm run cli -- automation configure --workspace "/pasta/projetos" --workspace "/outra/pasta"
```

A lista substitui as autorizações de descoberta de novos projetos. Raízes já cadastradas continuam com seus estados; uma raiz explicitamente pausada tem precedência. Configuração completa de pausa/exclusões pela UI segue em T23.

No ambiente atual, o usuário autorizou Sistemas no Mac e `/home/lucas/projetos` no macmini. Não autorize o diretório de dados nem uma pasta que o contenha.
