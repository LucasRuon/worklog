import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fixture } from '../helpers.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { dateInZone, toLocalInput } from '../../src/core/dates.js';

test('nota e ajuste auditável no relatório', async ({ page }, info) => {
  const f = await fixture(); const start = new Date(Math.floor((Date.now() - 600000) / 1000) * 1000).toISOString(); const end = new Date(Date.parse(start) + 300000).toISOString();
  f.emit('human.interaction', start, { kind: 'explicit' });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  async function navigate(name: string) { const link = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name, exact: true }); if (!(await link.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click(); await link.click(); }
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects#token=${token}`); await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click();
    await page.getByLabel('De', { exact: true }).fill(dateInZone(new Date(start), app.config.timezone));
    await page.getByLabel('Texto da nota', { exact: true }).fill('  =SOMA(1,2)\nNota explícita á');
    await page.getByRole('button', { name: 'Salvar nota', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Nota salva com versão auditável.', { exact: true })).toBeVisible();
    await page.getByLabel('Início do ajuste (horário de Brasília)').fill(toLocalInput(start)); await page.getByLabel('Fim do ajuste (horário de Brasília)').fill(toLocalInput(end)); await page.getByLabel('Dedicação corrigida (minutos)').fill('2'); await page.getByLabel('Motivo do ajuste', { exact: true }).fill('Correção consciente');
    await page.getByRole('button', { name: 'Registrar ajuste', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Ajuste registrado. Estimativa original preservada.', { exact: true })).toBeVisible();
    await navigate('Exportação'); await page.getByLabel('Notas do usuário', { exact: true }).check(); await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
    const total = page.getByRole('row').filter({ hasText: 'Total da seleção' }); await expect(total.getByRole('cell').nth(1)).toHaveText('0 min'); await expect(total.getByRole('cell').nth(4)).toHaveText('2 min');
    const csvWait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click(); const csv = await readFile((await (await csvWait).path())!, 'utf8'); expect(csv).toContain("'  =SOMA(1,2)"); expect(csv).toContain('120000');
    const pdfWait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar PDF', exact: true }).click(); const pdf = await readFile((await (await pdfWait).path())!); const task = getDocument({ data: new Uint8Array(pdf) });
    try { const document = await task.promise; let text = ''; for (let p = 1; p <= document.numPages; p++) text += (await (await document.getPage(p)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' '); expect(text).toContain('120000 ms'); expect(text).toContain('Nota explícita á'); } finally { await task.destroy(); }
    await page.screenshot({ path: info.outputPath('adjustment-report.png'), fullPage: true });
    await navigate('Projetos'); await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click(); await expect(page.getByLabel('Texto da nota', { exact: true })).toHaveValue('  =SOMA(1,2)\nNota explícita á');
    await page.getByLabel('Motivo para desfazer').fill('Retornar à estimativa'); await page.getByRole('button', { name: /Desfazer ajuste/ }).click();
    await expect(page.getByText('Ajuste desfeito por registro compensatório.', { exact: true })).toBeVisible();
  } finally { await closeApp(app); await f.close(); }
});
