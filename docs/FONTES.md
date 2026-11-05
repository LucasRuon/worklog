# Fontes e notas de compatibilidade

Consultadas em 05/11/2026. Conferir novamente a versão instalada antes de desenvolver adapters. A existência de uma API na documentação não comprova que está habilitada em todas as superfícies e instalações.

- [Hooks do Claude Code](https://code.claude.com/docs/en/hooks): base para observar o ciclo de vida e as chamadas de ferramentas. Preservar a configuração do usuário e testar hooks no runtime real.
- [Hooks do Codex — documentação oficial da OpenAI](https://learn.chatgpt.com/docs/hooks): metadados de sessão e diretório permitem associação; formato de transcrição não é contrato estável. Validar separadamente CLI e aplicativo local.
- [Plugins do OpenCode](https://opencode.ai/docs/plugins/): mecanismo de eventos para sessions/tools; verificar a geração e versão do OpenCode antes de escolher nomes e formato dos hooks.
- [Git status](https://git-scm.com/docs/git-status): usar formato estável porcelain com separadores NUL para tratar nomes de arquivos sem parsing ambíguo.
- [GitHub REST — pull requests](https://docs.github.com/en/rest/pulls/pulls): listagem e dados dos PRs. Paginação, permissões e falhas são parte da implementação. Revisões e checks exigem consultas complementares.
- [Node.js 24 — SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html): `node:sqlite` é classificado como release candidate na documentação consultada; manter isolamento do driver e testar abertura, migração, transação e backup nos ambientes de destino.

## Observações do ambiente

- Node local observado: `v24.19.0`. Não instalar automaticamente uma versão diferente ao executar o plano sem verificar o projeto e o patch suportado.
- Host `macmini` acessível no teste anterior; kernel Linux, arquitetura x86_64. Foi encontrada uma instalação do Claude Code em `/home/lucas/.local/bin/claude`.
- O shell remoto não interativo não resolveu `claude` pelo PATH naquele teste. O serviço/hook precisa usar executável validado ou ambiente explícito; não concluir ausência da ferramenta só porque `command -v` falhou.
- Não foi confirmada instalação remota de Codex ou OpenCode.
- Não foram inspecionados conteúdos privados de sessões nem remotes dos projetos para este planejamento. O provedor GitHub e a lista de contas permanecem decisões técnicas a validar em T01.
