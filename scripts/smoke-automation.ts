import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { defaultDataDir } from '../src/core/context.js';
import { createApp, closeApp } from '../src/server/index.js';
import { serviceStatus } from '../src/cli/service.js';
import { syncHost } from '../src/remote/ssh.js';
import { readPrivate } from '../src/core/private-files.js';

const execute = promisify(execFile);
const root = await mkdtemp(join(dirname(process.cwd()), 'worklog-auto-verificacao-'));
const app = await createApp({ dataDir: process.env.WORKLOG_DATA_DIR ?? defaultDataDir(), port: 0 });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let sessionId: string | undefined;
try {
  const archive = resolve('artifacts/automation/verification-rejected');
  for (const name of await readdir(join(app.config.dataDir, 'queue')).catch(() => [])) {
    if (!name.endsWith('.json.rejected')) continue;
    const path = join(app.config.dataDir, 'queue', name);
    const value = JSON.parse(readPrivate(path)) as { events?: { cwd?: string; tool?: string }[] };
    if (value.events?.length && value.events.every((event) => event.tool === 'opencode' && event.cwd?.startsWith(join(dirname(process.cwd()), 'worklog-auto-verificacao-')))) {
      await mkdir(archive, { recursive: true }); await rename(path, join(archive, name));
    }
  }
  await execute('git', ['init', '-q', root]);
  await execute('git', ['-C', root, 'remote', 'add', 'origin', 'https://github.com/LucasRuon/worklog.git']);
  const response = await execute('opencode', ['api', 'POST', '/api/session', '--data', JSON.stringify({ title: 'Worklog automatic verification', location: { directory: root } })], { timeout: 20_000, maxBuffer: 128 * 1024 });
  const created = JSON.parse(response.stdout) as { data: { id: string } }; sessionId = created.data.id;
  const pluginRoute = `/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(root)}`;
  await execute('opencode', ['api', 'GET', pluginRoute], { timeout: 20_000, maxBuffer: 256 * 1024 });
  let event: { event_id: string; project_id: string; device_id: string } | undefined;
  for (let attempt = 0; attempt < 80; attempt++) {
    event = app.db.get('SELECT e.event_id, p.project_id, e.device_id FROM events e JOIN event_projects p ON p.event_id = e.event_id WHERE json_extract(e.document, ?) = ? AND e.source_id IN (SELECT id FROM sources WHERE version = ?) LIMIT 1', '$.nativeSessionId', sessionId, '2.2.5');
    if (event) break;
    if (attempt > 0 && attempt % 10 === 0) await execute('opencode', ['api', 'GET', pluginRoute], { timeout: 20_000, maxBuffer: 256 * 1024 });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!event) throw new Error('AUTOMATIC_SESSION_NOT_CAPTURED');
  const registered = app.db.get<{ path: string }>('SELECT path FROM project_roots WHERE device_id = ? AND path = ?', app.config.deviceId, root);
  if (!registered || !event.project_id) throw new Error('AUTOMATIC_ROOT_NOT_REGISTERED');
  await syncHost(app, 'macmini');
  const output = resolve('artifacts/automation'); await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  await context.request.post(`${app.config.origin}/api/auth/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });
  const page = await context.newPage();
  await page.goto(`${app.config.origin}/?view=integrations`);
  await page.getByRole('heading', { name: 'Abertura automática' }).waitFor();
  await page.getByText('macmini', { exact: true }).first().waitFor();
  await page.screenshot({ path: join(output, 'integrations-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw new Error('MOBILE_OVERFLOW');
  await page.screenshot({ path: join(output, 'integrations-mobile.png'), fullPage: true });
  const remote = app.db.get<{ host: string; last_sync_at: string; last_error: string | null; clock_skew_ms: number }>('SELECT host, last_sync_at, last_error, clock_skew_ms FROM remote_hosts WHERE host = ?', 'macmini');
  const remoteEvents = app.db.get<{ count: number }>('SELECT count(*) AS count FROM events WHERE device_id IN (SELECT device_id FROM remote_hosts WHERE host = ?)', 'macmini')!.count;
  const localService = await serviceStatus(app.config.dataDir);
  if (!localService.running || !remote || remote.last_error || remoteEvents < 5) throw new Error('AUTOMATION_SERVICES_NOT_HEALTHY');
  const report = { passed: true, at: new Date().toISOString(), automaticSessionId: sessionId, automaticRoot: root, projectId: event.project_id, localService, remote, remoteEvents };
  await writeFile(join(output, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (sessionId) await execute('opencode', ['api', 'PATCH', `/api/session/${sessionId}`, '--data', '{"archived":true}'], { timeout: 10_000, maxBuffer: 64 * 1024 }).catch(() => {});
  try { await browser?.close(); } finally { await closeApp(app); await rm(root, { recursive: true, force: true }); }
}
