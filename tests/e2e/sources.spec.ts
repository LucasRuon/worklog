import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, closeApp } from '../../src/server/index.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { listSources } from '../../src/collectors/source-config.js';
import { queueClaude } from '../../src/collectors/claude.js';
import { registerSource } from '../../src/collectors/source-config.js';
import { randomUUID } from 'node:crypto';
import { configureOpenCodePlugin } from '../../src/cli/automation.js';
import { registerInstallation } from '../../src/core/events.js';

test('fontes: cadastro, pausa e filtro por perfil', async ({ page }, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-sources-ui-')); const root = join(directory, 'repo'); await mkdir(root);
  const app = await createApp({ dataDir: join(directory, 'data'), port: 0 });
  registerProjectRoot(app, { deviceId: app.config.deviceId, projectName: 'Fontes E2E', path: root });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${app.config.origin}/?view=integrations#token=${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Integrações' })).toBeVisible();
    await page.getByLabel('Perfil da fonte').fill('conta-e2e');
    await page.getByLabel('Arquivo de configuração local').fill(join(directory, 'settings.json'));
    await page.getByLabel('Versão instalada').fill('2.1.318');
    await page.getByRole('button', { name: 'Cadastrar fonte', exact: true }).click();
    await expect(page.getByText('Fonte cadastrada.', { exact: false })).toBeVisible();
    const row = page.locator('tr').filter({ hasText: 'conta-e2e' });
    await expect(row.getByText('Sem dados', { exact: true })).toBeVisible();
    await expect(row.getByText('conta-e2e · Local', { exact: true })).toBeVisible();
    await expect(row.getByText('Contrato suportado', { exact: true })).toBeVisible();
    await expect(row.getByText('Configuração ausente · histórico preservado')).toBeVisible();
    const pause = row.getByRole('button', { name: 'Pausar fonte conta-e2e' }); await pause.focus(); await page.keyboard.press('Enter');
    await expect(row.getByText('Pausada', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Habilitar fonte conta-e2e' }).focus(); await page.keyboard.press('Enter');
    await expect(row.getByRole('button', { name: 'Pausar fonte conta-e2e' })).toBeVisible();
    const source = listSources(app).find((source) => source.profile === 'conta-e2e')!;
    const other = { ...source, id: randomUUID(), profile: 'outra-conta', configPath: join(directory, 'other-settings.json') }; registerSource(app, other);
    queueClaude(app.config.dataDir, other.id, { cwd: root, session_id: 'other-profile-session', hook_event_name: 'SessionStart', source: 'startup' });
    queueClaude(app.config.dataDir, source.id, { cwd: root, session_id: 'profile-session', hook_event_name: 'SessionStart', source: 'startup' });
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(row.getByText('Eventos recebidos', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('integrations.png'), fullPage: true });
    const link = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Atividade', exact: true });
    if (!(await link.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click(); await link.click();
    await expect(page.getByRole('button', { name: 'Abrir sessão other-profile-session', exact: true })).toBeVisible();
    await page.getByLabel('Fonte / perfil', { exact: true }).selectOption(source.id);
    await expect(page.getByRole('button', { name: 'Abrir sessão profile-session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão other-profile-session', exact: true })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain(join(directory, 'settings.json'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await rm(directory, { recursive: true, force: true }); }
});

test('plugin local mostra a versão registrada sem confundir fonte remota ou ausente', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-plugin-ui-'));
  const app = await createApp({ dataDir: join(directory, 'data'), port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    const deviceId = randomUUID(), installationId = randomUUID();
    registerInstallation(app, { deviceId, installationId, name: 'Remote', os: 'linux', timezone: 'UTC' });
    registerSource(app, { id: randomUUID(), deviceId, installationId, tool: 'opencode', profile: 'remote', configPath: '/remote/worklog.js', version: '2.2.5', enabled: true });
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Abertura automática' }) });
    await page.goto(`${app.config.origin}/?view=integrations#token=${token}`);
    await expect(panel.getByText('Configuração inicial', { exact: true })).toBeVisible();
    const path = join(directory, 'plugins/worklog.js'); await configureOpenCodePlugin(app, path, 'install', '2.2.6');
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(panel.getByText('Plugin instalado · OpenCode 2.2.6', { exact: true })).toBeVisible();
    await rm(path); await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(panel.getByText('Configuração inicial', { exact: true })).toBeVisible();
    await writeFile(path, 'present');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await closeApp(app); await rm(directory, { recursive: true, force: true }); }
});
