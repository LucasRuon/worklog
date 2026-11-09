import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { listProjects, registerProjectRoot } from '../../src/core/projects.js';
import { reconcileRoot } from '../../src/collectors/files.js';
import { scanCommits } from '../../src/collectors/git.js';
import { projectFixture } from '../project-fixture.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { registerSource } from '../../src/collectors/source-config.js';
import { importBatch, registerInstallation } from '../../src/core/events.js';
import { syncPullRequests } from '../../src/providers/github.js';
import { dateInZone, nextDate } from '../../src/core/dates.js';

function remoteFixture(f: Awaited<ReturnType<typeof projectFixture>>) {
  const source = { ...f.source, id: randomUUID(), deviceId: randomUUID(), installationId: randomUUID(), tool: 'opencode' as const, profile: 'remoto', version: '2.2.5' };
  registerInstallation(f.ctx, { deviceId: source.deviceId, installationId: source.installationId, name: 'Máquina remota', os: 'linux', timezone: 'UTC' });
  registerSource(f.ctx, source);
  registerProjectRoot(f.ctx, { projectId: f.projectId, projectName: 'Projeto teste', deviceId: source.deviceId, path: '/remote/repository' });
  const at = new Date().toISOString();
  importBatch(f.ctx, { schemaVersion: 1, installationId: source.installationId, nextCursor: { installationId: source.installationId, seq: 1 }, hasMore: false, events: [{ schemaVersion: 1, eventId: randomUUID(), sourceId: source.id, deviceId: source.deviceId, installationId: source.installationId, tool: source.tool, nativeSessionId: 'remote-session', cwd: '/remote/repository', type: 'session.start', payload: { reason: 'startup' }, occurredAt: at, receivedAt: at, originSeq: 1 }] });
  f.ctx.db.run('INSERT INTO remote_hosts(host, node_path, app_path, data_dir, device_id, installation_id, last_sync_at, last_error, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', 'offline-test', '/node', '/app', '/data', source.deviceId, source.installationId, new Date(Date.now() - 120000).toISOString(), 'SSH_UNAVAILABLE');
  return source;
}

test('sessão → revisão → diff → commit, associação explícita e renome observado', async ({ page }, testInfo) => {
  const f = await fixture(); execFileSync('git', ['init', '-q', f.root]);
  registerProjectRoot(f.ctx, { path: f.root, projectName: 'Projeto teste', deviceId: f.ctx.config.deviceId });
  const root = listProjects(f.ctx)[0]!.roots[0]!;
  await writeFile(join(f.root, 'arquivo á.txt'), 'linha inicial\n'); await reconcileRoot(f.ctx, root);
  const now = Date.now(); f.emit('session.start', new Date(now - 60_000).toISOString(), { reason: 'startup' }, { nativeSessionId: 'file-session' });
  f.emit('tool.start', new Date(now - 1000).toISOString(), { toolName: 'Edit', toolUseId: 'edit-1' }, { nativeSessionId: 'file-session' });
  await writeFile(join(f.root, 'arquivo á.txt'), 'linha alterada\n<script>window.SHOULD_NOT_EXECUTE = true</script>\n'); await reconcileRoot(f.ctx, root, 'watch');
  execFileSync('git', ['-C', f.root, 'add', '.']);
  execFileSync('git', ['-C', f.root, '-c', 'user.name=Author', '-c', 'user.email=author@example.test', 'commit', '-qm', 'Commit da revisão'], { env: { ...process.env, GIT_AUTHOR_DATE: new Date(now + 2000).toISOString(), GIT_COMMITTER_DATE: new Date(now + 2000).toISOString() } });
  await scanCommits(f.ctx, root);
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 }); const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/#token=${token}`);
    await page.getByRole('button', { name: 'Abrir sessão file-session', exact: true }).click();
    const session = page.getByRole('dialog', { name: 'Detalhes da sessão' });
    await expect(session.getByRole('heading', { name: 'Arquivos relacionados' })).toBeVisible();
    await expect(session.getByText(/Inferência temporal/)).toBeVisible();
    await session.getByRole('button', { name: 'arquivo á.txt', exact: true }).click();
    const revision = page.getByRole('dialog', { name: 'Revisão do arquivo' });
    await expect(revision.getByLabel('Diff da revisão')).toContainText('-linha inicial');
    await expect(revision.getByLabel('Diff da revisão')).toContainText('+linha alterada');
    await expect(revision.getByText('Inferência', { exact: true }).first()).toBeVisible();
    await revision.getByRole('combobox', { name: 'Sessão para associação' }).selectOption({ label: 'claude · file-session' });
    await revision.getByRole('button', { name: 'Associar sessão', exact: true }).click();
    await expect(revision.getByText('Associação explícita', { exact: true })).toBeVisible();
    await revision.evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath('revision-diff.png'), fullPage: true });
    await revision.getByRole('button', { name: /Abrir commit/ }).click();
    const commit = page.getByRole('dialog', { name: 'Commit relacionado' });
    await expect(commit.getByRole('heading', { name: 'Commit da revisão' })).toBeVisible();
    await commit.getByRole('button', { name: 'Voltar à revisão' }).click();
    await revision.getByRole('button', { name: /Abrir sessão file-session/ }).click();
    await expect(session.getByText(/Associação explícita/)).toBeVisible();
    await page.getByRole('button', { name: 'Fechar detalhes' }).click();
    await rename(join(f.root, 'arquivo á.txt'), join(f.root, 'renomeado á.txt')); await reconcileRoot(f.ctx, root);
    await page.getByRole('button', { name: 'Atualizar arquivos' }).click();
    await expect(page.getByRole('button', { name: 'Abrir revisão de renomeado á.txt' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Abrir revisão de renomeado á.txt' }).first().click();
    await expect(revision.getByText(/Renome comprovado/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Fechar revisão' }).click();
    expect(await page.evaluate(() => Object.hasOwn(window, 'SHOULD_NOT_EXECUTE'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: testInfo.outputPath('files-history.png'), fullPage: true });
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('opencode');
    await expect(page.getByRole('heading', { name: 'Nenhuma revisão para estes filtros.' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await f.close(); }
});

test('projeto completo: resumo e navegação sessão → arquivo → commit → PR', async ({ page }, info) => {
  const f = await projectFixture(); const remote = remoteFixture(f);
  const otherRoot = join(f.directory, 'concurrent'); await mkdir(otherRoot); execFileSync('git', ['init', '-q', otherRoot]); execFileSync('git', ['-C', otherRoot, 'remote', 'add', 'origin', 'https://github.com/owner/other.git']);
  const otherId = registerProjectRoot(f.ctx, { path: otherRoot, projectName: 'Projeto concorrente', deviceId: f.ctx.config.deviceId });
  const other = listProjects(f.ctx).find((p) => p.id === otherId)!.roots[0]!;
  f.emit('tool.end', new Date().toISOString(), { toolName: 'OtherOnlyTool', toolUseId: 'other', outcome: 'completed' }, { cwd: otherRoot, nativeSessionId: 'other-session' });
  await writeFile(join(otherRoot, 'other-only.txt'), 'OTHER_ONLY_FILE'); await reconcileRoot(f.ctx, other);
  execFileSync('git', ['-C', otherRoot, 'add', '.']); execFileSync('git', ['-C', otherRoot, '-c', 'user.name=Author', '-c', 'user.email=author@example.test', 'commit', '-qm', 'OTHER_ONLY_COMMIT']); await scanCommits(f.ctx, other);
  await syncPullRequests(f.ctx, other.repositoryId!, { request: async ({ path }) => ({ status: 200, headers: {}, body: path.includes('/pulls?') ? [{ number: 7, title: 'OTHER_ONLY_PR', state: 'open', draft: false, user: { login: 'owner' }, head: { ref: 'feature', sha: 'a'.repeat(40) }, base: { ref: 'main' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), merged_at: null }] : path.includes('/check-runs') ? { check_runs: [] } : [] }) });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects#token=${token}`);
    await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Histórico do projeto', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resumo com evidências', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir PR #1', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Origens e lacunas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão other-session', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'other-only.txt', exact: true })).toHaveCount(0);
    expect(await page.locator('.work-summary').innerText()).not.toContain('OtherOnlyTool');
    expect(await page.locator('main').innerText()).not.toContain('OTHER_ONLY');
    await page.screenshot({ path: info.outputPath('project-populated.png'), fullPage: true });
    await page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true }).click();
    const session = page.getByRole('dialog', { name: 'Detalhes da sessão' }); await session.getByRole('button', { name: 'evidence.txt', exact: true }).click();
    const revision = page.getByRole('dialog', { name: 'Revisão do arquivo' }); await expect(revision.getByLabel('Diff da revisão')).toContainText('+depois');
    await revision.getByRole('button', { name: /Abrir commit/ }).click();
    await page.getByRole('dialog', { name: 'Commit relacionado' }).getByRole('button', { name: 'Abrir PR #1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PR #1 · Revisão 1', exact: true })).toBeVisible();
    await expect(page.getByText('Sem checks registrados.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar revisão', exact: true }).click();
    const projectsLink = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Projetos', exact: true });
    if (!(await projectsLink.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await projectsLink.click();
    await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click();
    await page.getByRole('combobox', { name: 'Máquina', exact: true }).selectOption(remote.deviceId);
    await expect(page.getByRole('button', { name: 'Abrir sessão remote-session', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toHaveCount(0);
    await expect(page.getByText('Nenhuma revisão para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum commit para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum PR para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.locator('.work-summary')).toContainText('remote-session');
    await expect(page.locator('.work-summary')).not.toContainText('complete-session');
    await page.getByRole('combobox', { name: 'Fonte / perfil', exact: true }).selectOption(f.source.id);
    await expect(page.getByRole('heading', { name: 'Nenhuma sessão neste período.', exact: true })).toBeVisible();
    await expect(page.locator('.work-summary')).not.toContainText('remote-session');
    await page.getByRole('combobox', { name: 'Máquina', exact: true }).selectOption('');
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toBeVisible();
    await expect(page.locator('.work-summary')).toContainText('complete-session');
    await expect(page.getByText('Nenhuma revisão para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum commit para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum PR para estes filtros.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Fonte / perfil', exact: true }).selectOption('');
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('codex');
    await expect(page.getByRole('heading', { name: 'Nenhuma sessão neste período.', exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum PR para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhuma revisão para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum commit para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.locator('.work-summary')).not.toContainText('complete-session');
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('');
    const tomorrow = nextDate(dateInZone(new Date(), 'America/Sao_Paulo'));
    await page.getByLabel('Até (inclusive)', { exact: true }).fill(tomorrow); await page.getByLabel('De', { exact: true }).fill(tomorrow);
    await expect(page.getByRole('heading', { name: 'Nenhuma sessão neste período.', exact: true })).toBeVisible();
    await expect(page.getByText('Nenhuma revisão para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum commit para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByText('Nenhum PR para estes filtros.', { exact: true })).toBeVisible();
    await expect(page.locator('.work-summary')).not.toContainText('complete-session');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('project-detail.png'), fullPage: true });
  } finally { await closeApp(app); await f.close(); }
});

test('filtros: seleção múltipla e contexto do projeto permanecem coerentes', async ({ page }) => {
  const f = await projectFixture();
  const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
  registerProjectRoot(f.ctx, { path: otherRoot, projectName: 'Projeto segundo', client: 'Cliente B', deviceId: f.ctx.config.deviceId });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects#token=${token}`);
    const filters = page.getByRole('region', { name: 'Filtros do histórico' });
    await expect(page.getByRole('button', { name: 'Abrir projeto Projeto segundo', exact: true })).toBeVisible();
    await filters.locator('summary').click();
    await filters.getByRole('checkbox', { name: 'Projeto teste', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Abrir projeto Projeto segundo', exact: true })).toHaveCount(0);
    await filters.getByRole('checkbox', { name: 'Projeto segundo', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Abrir projeto Projeto segundo', exact: true })).toBeVisible();
    await filters.locator('summary').click();
    await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click();
    await filters.locator('summary').click();
    await expect(filters.getByRole('checkbox', { name: 'Projeto teste', exact: true })).toBeChecked();
    await expect(filters.getByRole('checkbox', { name: 'Projeto segundo', exact: true })).not.toBeChecked();
    await filters.getByRole('checkbox', { name: 'Projeto segundo', exact: true }).check();
    await expect(page.getByRole('heading', { name: 'Histórico do projeto', exact: true })).toHaveCount(0);
    await filters.locator('summary').click();
    await page.getByLabel('Buscar projeto ou cliente', { exact: true }).fill('Cliente B');
    await expect(page.getByRole('button', { name: 'Abrir projeto Projeto segundo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true })).toHaveCount(0);
  } finally { await closeApp(app); await f.close(); }
});

test('filtros: origem e atividades sem projeto com retorno ao histórico', async ({ page }) => {
  const f = await projectFixture(); const remote = remoteFixture(f);
  f.emit('session.start', new Date().toISOString(), { reason: 'startup' }, { cwd: undefined, nativeSessionId: 'unassigned-only' });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=activity#token=${token}`);
    await page.getByRole('combobox', { name: 'Máquina', exact: true }).selectOption(remote.deviceId);
    await expect(page.getByRole('button', { name: 'Abrir sessão remote-session', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toHaveCount(0);
    await page.getByLabel('Fonte / perfil', { exact: true }).selectOption(f.source.id);
    await expect(page.getByRole('heading', { name: 'Nenhuma sessão neste período.', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Máquina', exact: true }).selectOption('');
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('codex');
    await expect(page.getByRole('heading', { name: 'Nenhuma sessão neste período.', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('');
    await page.getByRole('checkbox', { name: 'Somente sem projeto', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Abrir sessão unassigned-only', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toHaveCount(0);
    const events = page.getByRole('region', { name: 'Eventos observados' });
    await expect(events.getByText('Sessão unassigned-only', { exact: true })).toBeVisible();
    await expect(events.getByText('Sessão complete-session', { exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Somente sem projeto', exact: true }).uncheck();
    await expect(page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão unassigned-only', exact: true })).toHaveCount(0);
  } finally { await closeApp(app); await f.close(); }
});

test('projeto: paginação, lacunas e recuperação de erro nas evidências', async ({ page }, info) => {
  const f = await projectFixture(); remoteFixture(f);
  const first = JSON.parse(f.ctx.db.get<{ document: string }>('SELECT document FROM pull_requests WHERE number = 1')!.document);
  for (let number = 3; number <= 21; number++) {
    const item = { ...first, id: randomUUID(), number, title: `Revisão ${number}` };
    f.ctx.db.run('INSERT INTO pull_requests VALUES (?, ?, ?, ?, ?)', item.id, item.repositoryId, number, item.updatedAt, JSON.stringify(item));
  }
  f.ctx.db.run("UPDATE pr_sync SET error = 'GITHUB_OFFLINE'");
  f.ctx.db.run('UPDATE file_scans SET last_gap_at = ? WHERE root_id = ?', new Date().toISOString(), f.rootRecord.id!);
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects&project=${f.projectId}#token=${token}`);
    await expect(page.getByText('Fonte offline; histórico preservado.', { exact: true })).toBeVisible();
    await expect(page.getByText('Sincronização atrasada.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Última lacuna registrada em/).first()).toBeVisible();
    await expect(page.getByText('Snapshot desatualizado', { exact: true }).first()).toBeVisible();
    const more = page.getByRole('button', { name: 'Carregar mais PRs', exact: true });
    await expect(more).toBeVisible();
    const initialCount = await page.getByRole('button', { name: /^Abrir PR #/ }).count(); expect(initialCount).toBe(20);
    await more.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^Abrir PR #/ })).toHaveCount(21);
    const open = page.getByRole('button', { name: 'Abrir PR #21', exact: true }); await open.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'PR #21 · Revisão 21', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(open).toBeFocused();
    await page.route('**/api/work-summary?**', (route) => route.abort());
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'As evidências abaixo podem estar desatualizadas.' })).toBeVisible();
    await expect(page.locator('.work-summary')).toContainText('complete-session');
    await expect(page.getByRole('button', { name: 'Abrir PR #21', exact: true })).toBeVisible();
    f.emit('tool.end', new Date().toISOString(), { toolName: 'RecoveredEvidence', toolUseId: 'recovered', outcome: 'completed' }, { nativeSessionId: 'complete-session' });
    await expect(page.locator('.work-summary')).not.toContainText('RecoveredEvidence');
    await page.unroute('**/api/work-summary?**');
    const response = page.waitForResponse((response) => response.url().includes('/api/work-summary?') && response.status() === 200);
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await response;
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.work-summary')).toContainText('RecoveredEvidence');
    await expect(page.locator('.work-summary')).toContainText('complete-session');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('project-coverage.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await f.close(); }
});

test('detalhes: fechar leitura atrasada preserva a evidência aberta depois', async ({ page }) => {
  const f = await projectFixture(); remoteFixture(f); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  let releaseSession!: () => void; const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
  let sessionStarted!: () => void; const sessionReady = new Promise<void>((resolve) => { sessionStarted = resolve; });
  let sessionFinished!: () => void; const sessionDone = new Promise<void>((resolve) => { sessionFinished = resolve; });
  let releaseCommit!: () => void; const commitGate = new Promise<void>((resolve) => { releaseCommit = resolve; });
  let commitStarted!: () => void; const commitReady = new Promise<void>((resolve) => { commitStarted = resolve; });
  let commitFinished!: () => void; const commitDone = new Promise<void>((resolve) => { commitFinished = resolve; });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects&project=${f.projectId}#token=${token}`);
    await page.route('**/api/sessions/*', async (route) => {
      const response = await route.fetch(); const body = await response.json();
      if (body.session.nativeSessionId === 'complete-session') {
        sessionStarted(); await sessionGate;
        try { await route.fulfill({ response }); } catch { /* Cliente cancelou a requisição. */ } finally { sessionFinished(); }
      } else await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Abrir sessão complete-session', exact: true }).click(); await sessionReady;
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Abrir sessão remote-session', exact: true }).click();
    const session = page.getByRole('dialog', { name: 'Detalhes da sessão', exact: true });
    await expect(session.getByText('remote-session', { exact: true })).toBeVisible();
    releaseSession(); await sessionDone;
    await expect(session.getByText('remote-session', { exact: true })).toBeVisible();
    await expect(session.getByText('complete-session', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.route(`**/api/commits/${f.commit.id}`, async (route) => {
      const response = await route.fetch(); commitStarted(); await commitGate;
      try { await route.fulfill({ response }); } catch { /* Cliente cancelou a requisição. */ } finally { commitFinished(); }
    });
    await page.getByRole('button', { name: `Abrir commit ${f.commit.sha.slice(0, 12)}`, exact: true }).click(); await commitReady;
    await expect(page.getByRole('dialog', { name: 'Commit do projeto', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Abrir PR #2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PR #2 · Revisão 2', exact: true })).toBeVisible();
    releaseCommit(); await commitDone;
    await expect(page.getByRole('heading', { name: 'PR #2 · Revisão 2', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Commit do projeto', exact: true })).toHaveCount(0);
  } finally { releaseSession(); releaseCommit(); await closeApp(app); await f.close(); }
});
