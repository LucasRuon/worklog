import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';

test('configuração persistida e pausa de raiz sem perder cadastro', async ({ page }, info) => {
  const f = await fixture(); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=integrations#token=${token}`);
    await page.getByLabel('Retenção de revisões (dias)').fill('45');
    await page.getByLabel('Exclusões relativas às raízes', { exact: true }).fill('private');
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await expect(page.getByText('Configuração persistida. Prévias antigas foram invalidadas.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausar raiz', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Habilitar raiz', exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('Retenção de revisões (dias)')).toHaveValue('45');
    await expect(page.getByLabel('Exclusões relativas às raízes', { exact: true })).toHaveValue('private');
    await expect(page.getByRole('button', { name: 'Habilitar raiz', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('configuration.png'), fullPage: true });
  } finally { await closeApp(app); await f.close(); }
});
