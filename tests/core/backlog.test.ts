import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backlogState, checkSources, clearBacklogCache, featureKey, parseTask, parseVerdict, projectBacklogFromRoots } from '../../src/core/backlog.js';
import { fixture } from '../helpers.js';

const task = (title: string, rows: string[] = ['| | | None | |'], summary = '7 criteria in 2 slices · 0 one-way doors · 2 open, 0 block') => `# ${title}

> Build this with **tlc-implement**.

## Intent

Texto.

${summary}

## Criteria

1. Um.
2. Dois.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
${rows.join('\n')}

## Swept

- nada
`;
const check = (title: string, sources: string[]) => `# ${title}\n\nSources:\n\n${sources.map((source) => `- \`${source}\` - fonte`).join('\n')}\n\n## Checks\n\n**C1** - cita .tasks/nao-e-fonte.md fora das fontes\n`;

test('backlog: lê título, critérios e Unresolved por Kind (open, blocks, blocks go-live, respondidas)', () => {
  const parsed = parseTask(task('Anéis animados', [
    '| 1 | open | Como os 4 anéis se arrumam em 320 px? | Assumido: 2×2. |',
    '| 2 | blocks | Qual provedor de pagamento? | Nada a assumir. |',
    '| 3 | blocks go-live | Quem emite a credencial de produção? | Sandbox. |',
    '| 4 | answered (a), 2026-11-02 | Já decidido | - |',
    '| 5 | `open` | Duração da animação? | 900 ms |',
  ]));
  assert.equal(parsed.title, 'Anéis animados');
  assert.equal(parsed.criteria, 7);
  assert.deepEqual(parsed.open.map((item) => item.n), ['1', '5']);
  assert.deepEqual(parsed.blocking, [{ n: '2', question: 'Qual provedor de pagamento?' }]);
  assert.deepEqual(parsed.goLive, [{ n: '3', question: 'Quem emite a credencial de produção?' }]);
  const none = parseTask(task('Sem pendência'));
  assert.deepEqual([none.open, none.blocking, none.goLive], [[], [], []]);
  // Sem a linha de resumo, conta os itens numerados de Criteria; resumo em português também vale.
  assert.equal(parseTask(task('Sem resumo', undefined, '')).criteria, 2);
  assert.equal(parseTask(task('Português', undefined, '9 critérios em 3 fatias · 1 porta de mão única')).criteria, 9);
});

test('backlog: veredito vale a rodada atual, não a primeira linha nem vereditos parciais', () => {
  assert.equal(parseVerdict('# X\n\n**Verdict**: PASS (4 achados menores)\n'), 'PASS');
  assert.equal(parseVerdict('**Veredito: FAIL.** 9 de 10\n'), 'FAIL');
  assert.equal(parseVerdict('**Veredito**: FAIL - rodada 1\n\n...\n\n**Veredito**: PASS - 45/45 na rodada 2\n'), 'PASS');
  assert.equal(parseVerdict('**Verdict**: PASS (rodada 2)\n**Verdict round 1**: FAIL - superado\n'), 'PASS');
  assert.equal(parseVerdict('**Verdict atual**: FAIL\n\n**Verdict**: PASS do C3\n'), 'FAIL');
  assert.equal(parseVerdict('**Verdict**: PASS\n**Veredito do C31**: FAIL\n'), 'PASS');
  assert.equal(parseVerdict('# Sem veredito\n'), null);
});

test('backlog: fontes do checklist e chave da feature', () => {
  assert.deepEqual(checkSources(check('X', ['.tasks/35-cor.md', '.tasks/36-outra.md'])), ['35-cor.md', '36-outra.md']);
  assert.equal(featureKey('48-pulseira-aneis.md'), 'pulseira-aneis');
  assert.equal(featureKey('pulseira-menu.md'), 'pulseira-menu');
});

test('backlog: classifica pendente, em implementação, implementada e reprovada; conta pendências', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worklog-backlog-'));
  try {
    await mkdir(join(root, '.tasks', 'img'), { recursive: true }); await mkdir(join(root, '.checks'));
    await writeFile(join(root, '.tasks', 'img', 'tela.md'), task('Anexo, não é task'));
    await writeFile(join(root, '.tasks', '01-pronta.md'), task('Pronta', ['| 1 | open | Cor? | Azul |']));
    await writeFile(join(root, '.tasks', '02-andamento.md'), task('Em andamento'));
    await writeFile(join(root, '.tasks', '03-reprovada.md'), task('Reprovada'));
    await writeFile(join(root, '.tasks', '04-bloqueada.md'), task('Bloqueada', ['| 1 | blocks | Provedor? | - |', '| 2 | blocks go-live | Credencial? | - |']));
    await writeFile(join(root, '.tasks', '05-junto.md'), task('Entregue junto com a 01'));
    await writeFile(join(root, '.checks', 'pronta.md'), check('Pronta', ['.tasks/01-pronta.md', '.tasks/05-junto.md']));
    await writeFile(join(root, '.checks', 'pronta.verified.md'), '# V\n\n**Verdict**: PASS\n');
    await writeFile(join(root, '.checks', 'nome-diferente.md'), check('Andamento', ['.tasks/02-andamento.md']));
    await writeFile(join(root, '.checks', 'reprovada.md'), check('Reprovada', ['conversation']));
    await writeFile(join(root, '.checks', 'reprovada.verified.md'), '**Veredito**: FAIL (mutante vivo)\n');
    const backlog = projectBacklogFromRoots([{ id: 'r', path: root, enabled: true, local: true }], [], 'p');
    const status = Object.fromEntries(backlog.items.map((item) => [item.file, item.status]));
    assert.deepEqual(status, { '.tasks/01-pronta.md': 'implemented', '.tasks/02-andamento.md': 'in_progress', '.tasks/03-reprovada.md': 'failed', '.tasks/04-bloqueada.md': 'pending', '.tasks/05-junto.md': 'implemented' });
    assert.deepEqual(backlog.counts, { total: 5, implemented: 2, failed: 1, inProgress: 1, pending: 1, withOpen: 1, withBlocking: 1, withGoLive: 1 });
    // Ordem: reprovada, em implementação, pendente, implementadas.
    assert.deepEqual(backlog.items.map((item) => item.status).slice(0, 3), ['failed', 'in_progress', 'pending']);
    assert.equal(backlog.items.find((item) => item.file === '.tasks/02-andamento.md')!.check!.feature, 'nome-diferente');
    // Exclusão configurada e raiz pausada ou remota não leem arquivos.
    assert.equal(projectBacklogFromRoots([{ id: 'r', path: root, enabled: true, local: true }], ['.tasks'], 'p').counts.total, 0);
    assert.equal(projectBacklogFromRoots([{ id: 'r', path: root, enabled: true, local: true }], ['.tasks/04-bloqueada.md'], 'p').counts.total, 4);
    assert.deepEqual(projectBacklogFromRoots([{ id: 'r', path: root, enabled: false, local: true }, { id: 's', path: '/remoto', enabled: true, local: false }], [], 'p').roots.map((r) => r.state), ['paused', 'remote']);
    // Um checklist novo aparece sem reiniciar (cache por mtime/tamanho só evita releitura do que não mudou).
    await writeFile(join(root, '.checks', 'bloqueada.md'), check('Bloqueada', ['.tasks/04-bloqueada.md']));
    assert.equal(projectBacklogFromRoots([{ id: 'r', path: root, enabled: true, local: true }], [], 'p').items.find((item) => item.file === '.tasks/04-bloqueada.md')!.status, 'in_progress');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('backlog: checklist verificado só num worktree conta, identificado pelo worktree; o da raiz prevalece quando tem veredito', async () => {
  const base = await mkdtemp(join(tmpdir(), 'worklog-backlog-git-'));
  const root = join(base, 'repo'); const tree = join(base, 'repo-t1');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'ignore' });
  try {
    await mkdir(join(root, '.tasks'), { recursive: true }); await mkdir(join(root, '.checks'));
    await writeFile(join(root, '.tasks', 'a.md'), task('A')); await writeFile(join(root, '.tasks', 'b.md'), task('B'));
    await writeFile(join(root, '.checks', 'b.md'), check('B', ['.tasks/b.md'])); await writeFile(join(root, '.checks', 'b.verified.md'), '**Verdict**: PASS\n');
    git(root, 'init', '-q'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'init'); git(root, 'worktree', 'add', '-q', tree);
    await writeFile(join(tree, '.checks', 'a.md'), check('A', ['.tasks/a.md'])); await writeFile(join(tree, '.checks', 'a.verified.md'), '**Verdict**: PASS\n');
    // A cópia do worktree é mais nova e reprovada, mas a raiz já tem veredito: vale a raiz.
    await writeFile(join(tree, '.checks', 'b.verified.md'), '**Verdict**: FAIL\n');
    const later = new Date(Date.now() + 60_000); await utimes(join(tree, '.checks', 'b.verified.md'), later, later);
    clearBacklogCache();
    const backlog = projectBacklogFromRoots([{ id: 'r', path: root, enabled: true, local: true }], [], 'p');
    const a = backlog.items.find((item) => item.file === '.tasks/a.md')!; const b = backlog.items.find((item) => item.file === '.tasks/b.md')!;
    assert.equal(a.status, 'implemented'); assert.equal(a.check!.location, 'repo-t1');
    assert.equal(b.status, 'implemented'); assert.equal(b.check!.location, null);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('backlog: estado da API omite projetos sem tasks e filtra por projeto', async () => {
  const f = await fixture();
  try {
    clearBacklogCache();
    assert.deepEqual(backlogState(f.ctx).projects, []);
    await mkdir(join(f.root, '.tasks')); await writeFile(join(f.root, '.tasks', 'x.md'), task('X', ['| 1 | blocks | Provedor? | - |']));
    clearBacklogCache();
    const state = backlogState(f.ctx);
    assert.equal(state.projects.length, 1); assert.equal(state.projects[0]!.projectId, f.projectId);
    assert.deepEqual(state.projects[0]!.items.map((item) => [item.title, item.status, item.blocking.length]), [['X', 'pending', 1]]);
    assert.deepEqual(backlogState(f.ctx, ['00000000-0000-4000-8000-000000000000']).projects, []);
  } finally { clearBacklogCache(); await f.close(); }
});
