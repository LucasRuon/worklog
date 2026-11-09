import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, closeApp } from '../../src/server/index.js';
import { configureClaudeHooks } from '../../src/cli/hooks.js';
import { listSources } from '../../src/collectors/source-config.js';
import { dateInZone } from '../../src/core/dates.js';

test('primeiro marco: raiz → hook CLI offline → fila → sessão → painel filtrado', async ({ page }, testInfo) => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-first-use-'));
  const dataDir = join(directory, 'data'); const root = join(directory, 'projeto com espaço á'); await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  let app = await createApp({ dataDir, port: 0 });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  async function authenticate() {
    const token = (await readFile(join(dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto('about:blank'); await page.goto(`${app.config.origin}/#token=${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
  }
  async function navigate(name: string) {
    const link = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name, exact: true });
    if (!(await link.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await link.click();
  }
  try {
    await authenticate();
    await navigate('Projetos');
    await page.getByLabel('Nome do projeto', { exact: true }).fill('Projeto piloto E2E');
    await page.getByLabel('Pasta raiz autorizada').fill(root);
    await page.getByRole('button', { name: 'Cadastrar raiz', exact: true }).click();
    await expect(page.getByText('Raiz cadastrada. A coleta se limita às pastas autorizadas.')).toBeVisible();
    await expect(page.locator('tbody').getByText('Projeto piloto E2E', { exact: true })).toBeVisible();
    const configPath = join(directory, 'profile', 'settings.json');
    await configureClaudeHooks(configPath, 'install', { ctx: app });
    const source = listSources(app).find((source) => source.configPath === configPath)!;
    const port = app.config.port;
    await closeApp(app);
    const fixture = JSON.parse(await readFile(new URL('../fixtures/claude/lifecycle.json', import.meta.url), 'utf8')) as (Record<string, unknown> & { atMs: number })[];
    const base = Date.now() - 4 * 60_000;
    for (const event of fixture) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['dist/cli/index.js', 'hook', '--worklog-hook-v1', '--data-dir', dataDir, '--source-id', source.id], { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', (chunk: Buffer) => { output += String(chunk); }); child.stderr.on('data', (chunk: Buffer) => { output += String(chunk); });
        child.on('error', reject); child.on('exit', (code) => { try { expect(code).toBe(0); expect(output).toBe(''); resolve(); } catch (error) { reject(error); } });
        child.stdin.end(JSON.stringify({ ...event, session_id: 'e2e-session', cwd: root, timestamp: new Date(base + event.atMs).toISOString() }));
      });
    }
    app = await createApp({ dataDir, port });
    await authenticate();
    const baseDate = dateInZone(new Date(base), 'America/Sao_Paulo');
    await page.getByLabel('De', { exact: true }).fill(baseDate);
    await expect(page.getByText('7 eventos no período', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sessão e2e-session', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('before-detail.png'), fullPage: true });
    await page.getByRole('button', { name: 'Abrir sessão e2e-session', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Detalhes da sessão' });
    await expect(detail.getByText('e2e-session', { exact: true })).toBeVisible();
    await expect(detail.getByText('Encerrada', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar detalhes' }).click();
    await page.getByRole('button', { name: 'Registrar dedicação', exact: true }).click();
    await expect(page.getByText('Sinal registrado. A janela termina por limite, pausa ou troca de projeto.')).toBeVisible();
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.getByText('Dedicação pausada nesta máquina.')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
    await navigate('Atividade');
    await expect(page.getByRole('heading', { name: 'Eventos observados' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('DO_NOT_PERSIST');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('activity.png'), fullPage: true });
    await page.route('**/api/summary?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test"}' }));
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.unroute('**/api/summary?**');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('De', { exact: true }).fill('2099-01-01');
    await page.getByLabel('Até (inclusive)').fill('2099-01-01');
    await expect(page.getByRole('heading', { name: 'Nenhuma atividade para estes filtros.' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await rm(directory, { recursive: true, force: true }); }
});
