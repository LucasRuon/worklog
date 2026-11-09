import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { registerProjectRoot } from '../../src/core/projects.js';

test('commits e exportação: navegação, paginação, seleção 2/4 e downloads CSV/PDF', async ({ page }, testInfo) => {
  const f = await fixture(); const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  execFileSync('git', ['init', '-q', f.root]);
  const git = (...args: string[]) => execFileSync('git', ['-C', f.root, '-c', 'user.name=Autora Á', '-c', 'user.email=test@example.test', ...args], { stdio: 'pipe' });
  await writeFile(join(f.root, 'ação.txt'), 'texto'); await writeFile(join(f.root, '.env'), 'PRIVATE=DO_NOT_EXPORT');
  git('add', '.'); git('commit', '-qm', 'Entrega com acentos á');
  for (let i = 0; i < 27; i++) git('commit', '--allow-empty', '-qm', `Paginação ${i}`);
  registerProjectRoot(f.ctx, { projectName: 'Projeto teste', path: f.root, deviceId: f.ctx.config.deviceId });
  for (let i = 1; i <= 3; i++) {
    const root = join(f.directory, `project-${i}`); await mkdir(root);
    registerProjectRoot(f.ctx, { projectName: i === 1 ? 'Segundo selecionado' : `Fora da seleção ${i}`, path: root, deviceId: f.ctx.config.deviceId });
    f.emit('session.start', new Date(Date.now() - 60_000).toISOString(), { reason: 'startup' }, { cwd: root, nativeSessionId: `project-${i}` });
    f.emit('session.end', new Date(Date.now() - 30_000).toISOString(), { reason: 'other' }, { cwd: root, nativeSessionId: `project-${i}` });
  }
  for (let i = 0; i < 30; i++) {
    const base = Date.now(); const extra = { nativeSessionId: `session-${i}` };
    f.emit('session.start', new Date(base - 60_000).toISOString(), { reason: 'startup' }, extra);
    if (i === 0) {
      f.emit('turn.start', new Date(base - 55_000).toISOString(), {}, extra);
      f.emit('turn.end', new Date(base - 35_000).toISOString(), { outcome: 'completed' }, extra);
    }
    f.emit('session.end', new Date(base - 30_000).toISOString(), { reason: 'other' }, extra);
  }
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  async function navigate(name: string) {
    const link = page.getByRole('navigation').getByRole('link', { name, exact: true });
    if (!await link.isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await link.click();
  }
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/#token=${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    await navigate('Commits');
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await page.getByRole('button', { name: 'Carregar mais commits' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(28);
    const commit = page.locator('tr').filter({ hasText: 'Entrega com acentos á' });
    await commit.locator('summary').click(); await expect(commit.getByText('ação.txt', { exact: true })).toBeVisible();
    expect(await commit.innerText()).not.toContain('.env');
    await page.getByRole('button', { name: 'Reindexar Git' }).click();
    await expect(page.getByRole('button', { name: 'Reindexar Git' })).toBeEnabled();
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('opencode');
    await expect(page.getByRole('heading', { name: 'Nenhum commit para estes filtros.' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ferramenta', exact: true }).selectOption('');
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: testInfo.outputPath('commits.png'), fullPage: true });
    await navigate('Exportação');
    await expect(page.getByRole('button', { name: 'Gerar prévia', exact: true })).toBeDisabled();
    await page.locator('.project-filter summary').click();
    await page.getByLabel('Projeto teste', { exact: true }).check();
    await page.getByLabel('Segundo selecionado', { exact: true }).check();
    await page.locator('.project-filter summary').click();
    await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Prévia do relatório' })).toBeVisible();
    await expect(page.getByText('31 sessão(ões) incluída(s) · 28 commit(s) incluído(s)')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Total da seleção' }).getByRole('cell').nth(2)).toHaveText('<1 min');
    const csvDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click();
    const csv = await csvDownload; const csvBytes = await readFile((await csv.path())!); const csvText = csvBytes.toString('utf8');
    expect([...csvBytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(csvText).toContain('Segundo selecionado'); expect(csvText).toContain('ação.txt'); expect(csvText).not.toContain('Fora da seleção'); expect(csvText).not.toContain('DO_NOT_EXPORT');
    expect(csvText).toContain('"20000","ms"');
    const pdfDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar PDF', exact: true }).click();
    const pdf = await pdfDownload; const pdfPath = (await pdf.path())!; const pdfBytes = new Uint8Array(await readFile(pdfPath));
    const task = getDocument({ data: pdfBytes }); const document = await task.promise;
    try {
      expect(document.numPages).toBeGreaterThan(3);
      let contents = '';
      for (let i = 1; i <= document.numPages; i++) contents += (await (await document.getPage(i)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
      expect(contents).toContain('Entrega com acentos á'); expect(contents).toContain('ação.txt'); expect(contents).not.toContain('Fora da seleção');
      expect(contents).toContain('20000 ms');
      for (const number of [1, document.numPages]) {
        const pdfPage = await document.getPage(number); const viewport = pdfPage.getViewport({ scale: 1.2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pdfPage.render({ canvas: null, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
        await writeFile(testInfo.outputPath(`pdf-page-${number}.png`), canvas.toBuffer('image/png'));
      }
    } finally { await task.destroy(); }
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: testInfo.outputPath('export-preview.png'), fullPage: true });
    await page.getByLabel('Sessões observadas', { exact: true }).uncheck();
    await expect(page.getByRole('button', { name: 'Baixar CSV', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
    await expect(page.getByText('0 sessão(ões) incluída(s) · 28 commit(s) incluído(s)')).toBeVisible();
    await page.route('**/api/reports/*.csv', (route) => route.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"REPORT_EXPIRED"}' }));
    await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('A prévia expirou');
    await page.getByLabel('De', { exact: true }).fill('2020-01-01');
    await expect(page.getByRole('heading', { name: 'Prévia do relatório' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await closeApp(app); await f.close(); }
});
