# Automação local e no macmini

Implementada e instalada em 06/11/2026, após autorização explícita dos workspaces pelo usuário.

**Revalidação em 08/11:** binário/servidor OpenCode **2.2.6**. Este código agora suporta **2.2.5 e 2.2.6** em setup, IPC, instalação/remoção e diagnóstico. Smoke nativo isolado confirmou plugin active e duas sessões recebidas, incluindo evento do stream após ativação, sem modelos. **A instalação pessoal de 2.2.5 não foi atualizada**; fonte/runtime divergentes são bloqueados para preservar proveniência. Artefato `artifacts/opencode-226/verification.json`; critérios `.checks/t13-opencode-226.md`. Histórico offline continua separado em [FONTES-HISTORICO.md](FONTES-HISTORICO.md).

Quando autorizar a atualização pessoal, executar `npm run build` e `npm run cli -- automation install` usando o mesmo diretório de dados e caminho de plugin anteriores. Isso registra a versão detectada e preserva sourceId/histórico. OpenCode observa mudanças de configuração; `/reload` força recarga, sem reiniciar seu serviço. Confirmar novos eventos no painel antes de declarar captura pessoal revalidada. Não mudar apenas o campo de versão da fonte.

## Uso diário

**Atualização pessoal posterior em 08/11:** após autorização do usuário, `automation install` atualizou o wrapper original para **2.2.6**, preservando sourceId e store. Posicionadas (`/Users/lucasruon/Developer/Posicionadas`) foi cadastrado como raiz explícita, junto ao Worklog, sem ampliar a descoberta para toda a pasta Developer. Prova de instalação: `node scripts/verify-pilot-setup.mjs`. Captura pessoal após recarga ainda pendente; o registro inicial acima descreve o estado anterior a essa autorização.

| Máquina | Pasta autorizada | Ação do usuário |
|---|---|---|
| Mac | `/Users/lucasruon/Downloads/Sistemas` | Abrir `opencode` dentro do projeto |
| `ssh macmini` | `/home/lucas/projetos` | Abrir `claude` dentro do projeto |

O cadastro de novas raízes acontece automaticamente. A identidade Git normalizada associa clones e worktrees ao projeto existente; nomes de pasta, isoladamente, não unem projetos. Pastas sem Git usam a raiz filha do workspace, com identidade própria e associação manual disponível depois.

O plugin e os hooks aplicam escopo e exclusões antes de persistir. Pastas fora dos workspaces/raízes autorizados não entram na coleta. Raízes já cadastradas e explicitamente pausadas têm precedência sobre a descoberta automática.

**Sessões já abertas antes da instalação:** configuração OpenCode é recarregada automaticamente; `/reload` força a recarga quando necessário. O teste 2.2.6 desta rodada usou localização própria temporária, não confirmou ativação pessoal. No Claude, abra uma sessão nova para usar os hooks instalados. Depois disso, o uso cotidiano é apenas iniciar a ferramenta.

## OpenCode local

- Versão pessoal originalmente instalada/validada: **2.2.5**. Runtime atual **2.2.6**, suporte técnico e captura de sessões nativas confirmados em instalação temporária; atualização pessoal opt-in pendente. M1 usava 1.19.5.
- Plugin global gerenciado: `~/.config/opencode/plugins/worklog.js`.
- Usa o contrato v2: definição com `id/setup`, stream `ctx.event.subscribe`, dados em `event.data` e registro de tempo `event.created`. Não reutiliza os callbacks do plugin v1.
- Sem dependência npm adicional: a definição é um objeto, equivalente ao retorno de `Plugin.define` no SDK 2.2.5, cuja implementação oficial é identidade. As estruturas usadas foram confrontadas com a documentação e o schema da versão.
- Primeiro projeta somente IDs, tipos, diretório, parentesco e tempos; argumentos, prompts, resultados, texto/reasoning e credenciais não chegam ao IPC ou ao outbox.
- Envia os metadados por argv/stdin a um Node absoluto. A fila é privada, durável e independe do painel. Falhas transitórias mantêm outbox no armazenamento do plugin para retry.
- Outbox limitado a 1000 pacotes por instância lógica. Overflow e desconexões são sinalizados por `worklog.health`; o stream é reinscrito. O stream público é volátil e não promete recuperar eventos nunca recebidos. Reconciliação ampla de histórico permanece T15.
- Bootstrap de metadados reconhece sessões recentes/ativas quando a sessão foi criada antes da ativação do plugin. É registrada como retomada observada, sem inventar tempo anterior ou atenção humana.
- O modo manual por banco 1.19.5 permanece para histórico/compatibilidade e foi pausado nesta máquina ao ativar v2. Seu histórico não foi apagado.

Outros plugins foram preservados. O plugin existente `herdr-agent-state.js` foi reportado pelo próprio OpenCode como definição v1 incompatível com v2; não foi alterado. O Worklog aparece separadamente como `active`.

## Claude no macmini

- Host revalidado: Linux x86_64, usuário `lucas`.
- Node: `/home/lucas/.nvm/versions/node/v24.21.0/bin/node`.
- Claude validado: **2.1.319**, conta `claude.ai` funcional no host. Nenhuma credencial foi copiada para o Mac ou para o Worklog.
- Settings: `/home/lucas/.claude/settings.json`.
- Existiam **21 hooks**; a instalação preservou esses 21 e adicionou **11 handlers Worklog**, totalizando 32. Backup privado criado antes da alteração. Reinstalações substituem apenas handlers gerenciados da mesma fonte, inclusive entre releases.
- Hooks em exec form, com Node e script absolutos, timeout de 2 s e `onFailure: continue`. O entrypoint é silencioso e fail-open.
- Diretório de dados: `/home/lucas/.local/share/worklog/data`.
- Código remoto: releases privados em `/home/lucas/.local/share/worklog/releases/<digest>`. O bundle contém JS compilado e migrações; sem UI, dependências npm ou cópia do banco ativo.

## Sincronização

O coletor local busca dados pelo alias SSH existente, com BatchMode e verificação estrita de host. Não abre porta remota nem copia chaves privadas.

O protocolo inclui identidade de máquina/instalação, fontes e raízes sem credenciais, horário da resposta e lote de até 500 eventos. Valida schema, limites, IDs, origem e versão antes de importar. Cursor e eventos são confirmados em uma transação; uma falha após persistência permite replay sem duplicação.

Cadência normal: 15 s. Em falhas: backoff de 15 s até 5 min. Backlog pode antecipar nova rodada. Mudança de instalação abre um cursor novo, mantendo o histórico anterior.

Desvio de relógio acima de 60 s é sinalizado; qualidade não confiável fica vinculada ao evento na mesma transação da importação. Sinais humanos remotos com esse marcador não geram dedicação, mesmo após o relógio voltar ao normal.

## Serviços e limites

- Mac: launchd de usuário, label `com.worklog.collector`, agente central sem porta HTTP.
- Linux: systemd de usuário, `worklog-agent.service`, reinício após falha e **linger habilitado**, confirmado no host.
- Coleta e sincronização continuam com o painel/terminal fechados. O painel HTTP continua separado; use `npm run dev` e `npm run cli -- open` quando quiser consultá-lo.
- No Mac, launchd acompanha a sessão do usuário: logout/desligamento encerra o serviço. No Linux, linger mantém o gerenciador após fechar SSH e permite iniciar no boot; o host precisa estar ligado.
- Logs próprios com mensagens/códigos fixos, sem payloads. `agent.log` rotaciona ao atingir 1 MiB para `agent.log.1`.
- Overflow, retenção geral, orçamento e recuperação abrangente continuam em T23. Nenhum backlog não sincronizado é purgado automaticamente.

## Verificação real

**Revalidação pessoal posterior em 08/11, 22:09 BRT:** plugin global `worklog` active e eventos reais de sessão, submissão, turnos e ferramentas recebidos pela fonte original 2.2.6 e associados ao Worklog. Prova read-only `node scripts/verify-opencode-personal-live.mjs`, critérios `.checks/opencode-personal-live.md`. Isso atualiza as notas históricas de captura pessoal pendente acima; Posicionadas ainda aguarda atividade própria e T24 segue aberto.

1. Plugin Worklog confirmado `active` na API do OpenCode v2, sem remover o plugin existente.
2. Sessão vazia criada pelo OpenCode em raiz nova dentro de Sistemas: raiz reconhecida automaticamente e associada ao Worklog pelo remote Git, sem comando `connect`.
3. Sessão Claude real em repositório temporário no workspace remoto, com settings temporários contendo apenas os handlers Worklog: os cinco eventos de início/pedido/execução/fim chegaram ao Mac. O serviço central já os havia importado; sincronização seguinte encontrou cinco duplicados.
4. `SIGKILL` direcionado exclusivamente ao serviço Worklog em ambos os hosts: launchd e systemd reiniciaram com PID novo.
5. Nova conexão SSH confirmou o coletor ativo e `Linger=yes`. Após atualização, cursor remoto permaneceu em 5 e o histórico foi preservado.
6. Rodada final de 06/11: **32 testes aprovados** (19 unitários, 7 de integração, 6 E2E), typecheck e build passando; auditoria sem vulnerabilidades.

Corrigidos nos smokes: espera pela remoção efetiva do job launchd antes do bootstrap; cancelamento de SSH por shutdown não é erro de rede; identidade da raiz é capturada junto à fila para preservar associação quando uma pasta/worktree temporária desaparece antes do consumo.

Evidências geradas em `artifacts/automation/`: `verification.json`, `integrations-desktop.png`, `integrations-mobile.png`. Artefatos de verificações antigas rejeitadas por remoção precoce da pasta foram separados em `verification-rejected/`; nenhum arquivo de usuário foi descartado.

Comandos históricos de teste nativo da instalação pessoal 2.2.5 (alteram a base de uso; não executar como regressão isolada 2.2.6):

```sh
npm run smoke:automation
npm run smoke:remote -- --host macmini
```

Smoke isolado da compatibilidade 2.2.6: `npm run smoke:opencode-plugin`. Cria/remove apenas duas sessões próprias e root/store/wrapper temporários; não chama modelo nem altera a instrumentação pessoal. Testes controlados cobrem início/fim de ferramentas e replay nas duas versões; o smoke nativo cobre sessão/setup/stream/IPC, não uma execução completa de modelo.

O smoke remoto faz um pedido sintético mínimo ao Claude com ferramentas desabilitadas e orçamento máximo configurado em US$ 0,10; não faz parte da suíte automática de CI.
