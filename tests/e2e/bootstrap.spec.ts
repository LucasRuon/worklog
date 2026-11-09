import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, closeApp } from '../../src/server/index.js';

for (const dev of [false, true]) {
test(`primeiro uso (${dev ? 'desenvolvimento' : 'produção'}): bootstrap, teclado e logout`, async ({ page }, testInfo) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'worklog-browser-'));
  const app = await createApp({ dataDir, port: 0, dev });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(app.config.origin);
    await expect(page.getByRole('heading', { name: 'Conecte este navegador' })).toBeVisible();
    await expect(page.getByText('API e banco disponíveis')).toBeVisible();
    const token = (await readFile(join(dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto('about:blank');
    await page.goto(`${app.config.origin}/#token=${token}`);
    await expect(page.getByRole('heading', { name: 'Seu espaço está pronto para começar.' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    expect(await page.locator('body').innerText()).not.toContain(token);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect(await page.evaluate(() => document.cookie)).not.toContain('worklog_session');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seu espaço está pronto para começar.' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('primeiro-uso.png'), fullPage: true });
    await page.getByRole('button', { name: 'Encerrar sessão neste navegador' }).click();
    await expect(page.getByRole('heading', { name: 'Conecte este navegador' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await rm(dataDir, { recursive: true, force: true }); }
});
}
