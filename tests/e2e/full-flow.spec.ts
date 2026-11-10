import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { projectFixture } from '../project-fixture.js';
import { createApp, closeApp } from '../../src/server/index.js';
import { registerProjectRoot } from '../../src/core/projects.js';
import { openStore } from '../../src/core/context.js';
import { saveNote } from '../../src/core/adjustments.js';
import { deriveTime } from '../../src/core/time.js';
import { dateInZone, nextDate, startOfDay, toLocalInput } from '../../src/core/dates.js';

test('fluxo completo controlado: seleção → evidências → ajuste → PDF/CSV → backup/restore', async ({ page }) => {
  const f = await projectFixture(); const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
  const other = registerProjectRoot(f.ctx, { deviceId: f.ctx.config.deviceId, path: otherRoot, projectName: 'Projeto fora da seleção' });
  saveNote(f.ctx, other, 'OTHER_ONLY_DO_NOT_EXPORT', { revision: 0 });
  const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 }); let closed = false;
  const start = new Date(Math.floor((Date.now() - 180000) / 1000) * 1000).toISOString(); const end = new Date(Date.parse(start) + 60000).toISOString(); const day = dateInZone(new Date(start), 'America/Sao_Paulo');
  async function navigate(name: string) { const link = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name, exact: true }); if (!(await link.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click(); await link.click(); }
  try {
    const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
    await page.goto(`${app.config.origin}/?view=projects#token=${token}`); await page.getByRole('button', { name: 'Abrir projeto Projeto teste', exact: true }).click();
    await page.getByLabel('De', { exact: true }).fill(day);
    await page.getByLabel('Texto da nota', { exact: true }).fill('Nota diária com evidência'); await page.getByRole('button', { name: 'Salvar nota', exact: true }).click();
    await expect(page.getByText('Nota salva com versão auditável.', { exact: true })).toBeVisible();
    await page.getByLabel('Início do ajuste (horário de Brasília)').fill(toLocalInput(start)); await page.getByLabel('Fim do ajuste (horário de Brasília)').fill(toLocalInput(end)); await page.getByLabel('Dedicação corrigida (minutos)').fill('0.5'); await page.getByLabel('Motivo do ajuste', { exact: true }).fill('Atribuição explícita no ensaio'); await page.getByRole('button', { name: 'Registrar ajuste', exact: true }).click();
    await expect(page.getByText('Ajuste registrado. Estimativa original preservada.', { exact: true })).toBeVisible();
    await navigate('Exportação'); await page.getByLabel('Notas do usuário', { exact: true }).check(); await page.getByLabel('Pull requests', { exact: true }).check(); await page.getByLabel('Diffs completos elegíveis', { exact: true }).check(); await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Prévia do relatório' })).toBeVisible();
    const csvWait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click(); const csv = await readFile((await (await csvWait).path())!, 'utf8');
    expect(csv).toContain('Nota diária com evidência'); expect(csv).toContain('Revisão 1'); expect(csv).toContain('+depois'); expect(csv).toContain('30000'); expect(csv).not.toContain('OTHER_ONLY_DO_NOT_EXPORT'); expect(csv).not.toContain('Projeto fora da seleção');
    const pdfWait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar PDF', exact: true }).click(); const pdf = await readFile((await (await pdfWait).path())!);
    const task = getDocument({ data: new Uint8Array(pdf) });
    try { const doc = await task.promise; let text = ''; for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => 'str' in i ? i.str : '').join(' '); expect(text).toContain('Nota diária com evidência'); expect(text).toContain('30000 ms'); expect(text).not.toContain('OTHER_ONLY_DO_NOT_EXPORT'); } finally { await task.destroy(); }
    const filter = { projectIds: [f.projectId], from: startOfDay(day, 'America/Sao_Paulo'), to: startOfDay(nextDate(dateInZone(new Date(), 'America/Sao_Paulo')), 'America/Sao_Paulo'), timezone: 'America/Sao_Paulo' };
    const before = deriveTime(f.ctx, filter); await closeApp(app); closed = true;
    const backup = join(f.directory, 'backup completo'); const target = join(f.directory, 'restored completo');
    const command = (...args: string[]) => JSON.parse(execFileSync(process.execPath, ['dist/cli/index.js', 'maintenance', ...args], { encoding: 'utf8', timeout: 10000 }));
    expect(command('backup', '--data-dir', f.ctx.config.dataDir, '--output', backup).code).toBe('BACKUP_OK');
    expect(command('restore', '--data-dir', target, '--input', backup).code).toBe('RESTORE_OK');
    const restored = await openStore(target); try { expect(deriveTime(restored, filter)).toEqual(before); expect(restored.db.get<{ n: number }>('SELECT count(*) n FROM note_versions')!.n).toBe(2); } finally { await restored.shutdown(); }
  } finally { if (!closed) await closeApp(app); await f.close(); }
});
