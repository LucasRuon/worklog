# T24 — evidência real e inspeção do PDF (suplemento)

Profile light. Base f97d2b3, sem commits adicionais autorizados. Fonte: TASKS T24, conversa, docs/PILOTO.md, .checks/t24-safe-acceptance.md e autorização posterior de revalidação normal somente leitura em Worklog/Posicionadas. Não altera checks C1–C7 da prova anterior.

## Fronteiras e Landing

Usar somente clone restaurado já criado pela prova segura, nunca store pessoal como destino. Leitura Git restrita a três arquivos conhecidos do Worklog para comparar blob de commit com hash de revisão. Nenhuma escrita nos projetos, transcrição, modelo, credencial, alteração de trust/hook/config/serviço/SSH ou vínculo artificial explícito. inferEvidence/revisionDetail podem preencher relações **inferidas somente no clone**, sem mudar confiança por conveniência. Nenhuma marca-d'água visual adicionada.

`scripts/verify-pilot-evidence.mjs --clone /temp/worklog-pilot-safe-*/restored` valida realpath sob temp aprovado antes de openStore; reutiliza revisionDetail e pullRequestsForCommit. Alternativa rejeitada: afirmar que cadeia não existe apenas porque os vínculos ainda não foram projetados na origem; ou inventar vínculos/autoria para fechar aceite. Conteúdo de arquivo/diff não é impresso. Saída sanitizada `artifacts/t24-safe/evidence-chain.json`.

## Checks

**D1** — Encontrar uma revisão real Worklog cujo hash coincide com o blob de commit já presente no PR#1; detalhe fornece diff, pelo menos um vínculo de sessão e o vínculo de commit. Todos permanecem inferred; se múltiplas sessões, a ambiguidade é explicitamente rotulada. Nada é gravado no store pessoal.
Proof: `node scripts/verify-pilot-evidence.mjs --clone <privateDirectory da prova segura>/restored`; assertions revision-hash/diff/session/commit/pr/ambiguity/clone-path. O argumento é artefato privado real da execução, não fixture fabricada. Relatório deve separar cadeia source-backed em clone de navegação/links persistidos em produção.

**D2** — Inspecionar visualmente os PDFs reais Worklog/Posicionadas e o PDF ajustado só no clone: seleção legível, tempo humano separado de IA, páginas legíveis sem corte/sobreposição grosseiros e sem marcas-d'água sobrepostas. Renderer e parser são distintos; isso não é aceite visual do usuário.
Proof: renderizar todos os PDFs gerados em PNG privado usando pdfjs/@napi-rs/canvas e abrir as imagens (primeiras páginas em resolução1.3; folhas de contato para todas as páginas). Hash do PDF e paths privados registrados; verificador deve abrir as imagens, não herdar relato do autor.

## Swept / Handoff

Validação: guard realpath/clone, hash comparado, D1. Falhas: sem candidato comprovado => exit1, não fabricar cadeia. Idempotência: inferEvidence deduplica relações; só clone. Autorização: leitura normal de política/Git já autorizada. Concorrência: snapshot fechado, sem collector/servidor. Ciclo: evento original/recibos permanecem intactos; somente projeção de relação no clone. Dependências: Git local/pdfjs, sem rede/modelo. Estados: inferred nunca vira explicit; stalePR preservado. Observabilidade: saída redigida. Prova pequena <10k tokens, verificação independente suplementar após conclusão de C1–C7; bloqueio/suspensão/SSH/dedicação real/crescimento diário ainda pendentes.

## Resultados do autor (não veredito independente)

D1 executado em09/11 13:25UTC: `node --check scripts/verify-pilot-evidence.mjs && node scripts/verify-pilot-evidence.mjs --clone /private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-pilot-safe-p5BwL6/restored`. Revisão `84776ad9-d8a4-4c56-9692-ad506329e8d7` de `docs/FONTES-HISTORICO.md` em01:56:38UTC coincide por SHA256 com blob do commit76a6edc em01:56:52UTC, presente no PR#1. Diff disponível;2 sessões candidatas com rótulo ambíguo, sessão/commit inferred. SnapshotPR pode aparecer stale com o tempo: não suprimir. Cadeia navegável materializada por validador normal **apenas no clone**, não prova autoria de uma das sessões, nem links novos persistidos em produção. Nenhum commit/PR/link explícito criado artificialmente.

Tentativa inline anterior consultou helper pullRequestsForCommit com assinatura errada (commitId em vez de repositoryId+sha), retornou nenhum candidato e falhou; não foi defeito do produto. Corrigida após ler assinatura em src/providers/github.ts, novo script usa os três argumentos oficiais, sem mudar assertions para ocultar falta de cadeia.

D2: PDFs do mesmo snapshot renderizados para PNG com pdfjs/@napi-rs/canvas; abertas primeiras páginas em1.3x e folhas de contato das6 páginas Worklog,4 Posicionadas e7 do ajuste em clone. Seleção e medidas legíveis, separação humano/agente clara, ajuste30000ms só no clone, numeração e avisos presentes; sem sobreposição grosseira/corte no conjunto inspecionado ou marca-d'água sobreposta. Isto é inspeção do autor, não aceite do usuário ou revisão exaustiva de cada página em alta resolução.

Diretório privado das imagens/PDFs: `/private/var/folders/cy/q2vjxvld34n4bzy5yyjxp7wh0000gn/T/opencode/worklog-pilot-safe-p5BwL6/reports`. Cada PDF tem imagem `<nome>-first.png` e `<nome>-contact.png` correspondentes. SHA256:

```
69458c2bbd706b4a42a84d948163049ad124579a5d053bb63a24be13df08477c  worklog-before.pdf
3c5b5d978701c1d3076dbbee703953a3f9d5f1e78018b961883f8ed9d81af253  posicionadas-before.pdf
0317a2918af82dba3dddd760bece6ec3d1c66708930c03b295974afde0ef62ab  worklog-after-clone-adjustment.pdf
```
