import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp, closeApp } from '../../src/server/index.js';
import { clearBacklogCache } from '../../src/core/backlog.js';
import { fixture } from '../helpers.js';

test('api: /api/backlog exige sessão e devolve as tasks do projeto com status e pendências', async () => {
  const f = await fixture(); const app = await createApp({ dataDir: f.ctx.config.dataDir, port: 0 });
  const token = (await readFile(join(app.config.dataDir, 'bootstrap.token'), 'utf8')).trim();
  try {
    await mkdir(join(f.root, '.tasks')); await mkdir(join(f.root, '.checks'));
    await writeFile(join(f.root, '.tasks', '01-feita.md'), '# Feita\n\n3 criteria in 1 slice\n\n## Unresolved\n\n| # | Kind | Question | Until answered |\n|---|---|---|---|\n| 1 | blocks go-live | Credencial de produção? | Sandbox |\n');
    await writeFile(join(f.root, '.tasks', '02-nova.md'), '# Nova\n\n## Criteria\n\n1. Um.\n');
    await writeFile(join(f.root, '.checks', 'feita.md'), '# Feita\n\nSources:\n\n- `.tasks/01-feita.md`\n');
    await writeFile(join(f.root, '.checks', 'feita.verified.md'), '**Verdict**: PASS\n');
    clearBacklogCache();
    assert.equal((await fetch(`${app.config.origin}/api/backlog`)).status, 401);
    const response = await fetch(`${app.config.origin}/api/backlog?projectIds=${f.projectId}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const body = await response.json() as { projects: { projectId: string; counts: Record<string, number>; items: { title: string; status: string; criteria: number | null; goLive: unknown[] }[] }[] };
    assert.equal(body.projects[0]!.projectId, f.projectId);
    assert.deepEqual(body.projects[0]!.items.map((item) => [item.title, item.status, item.criteria, item.goLive.length]), [['Nova', 'pending', 1, 0], ['Feita', 'implemented', 3, 1]]);
    assert.equal(body.projects[0]!.counts.withGoLive, 1);
  } finally { clearBacklogCache(); await closeApp(app); await f.close(); }
});
