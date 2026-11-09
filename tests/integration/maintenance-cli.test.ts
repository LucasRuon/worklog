import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { openStore } from '../../src/core/context.js';
import { saveNote } from '../../src/core/adjustments.js';
import { operatingConfig } from '../../src/core/configuration.js';

test('manutenção CLI: configuração, backup e restore em processos separados', { timeout: 60000 }, async () => {
  const f = await fixture(); const backup = join(f.directory, 'backup com espaço'); const target = join(f.directory, 'restored com espaço');
  const run = (dataDir: string, ...args: string[]) => spawnSync(process.execPath, ['dist/cli/index.js', 'maintenance', ...args, '--data-dir', dataDir], { encoding: 'utf8', timeout: 30000 });
  try {
    saveNote(f.ctx, f.projectId, 'Nota preservada pelo CLI', { revision: 0 });
    const config = run(f.ctx.config.dataDir, 'config', '--config', JSON.stringify({ revision: 0, idleMs: 60000 })); assert.equal(config.status, 0, config.stderr); assert.equal(JSON.parse(config.stdout).config.idleMs, 60000);
    const saved = run(f.ctx.config.dataDir, 'backup', '--output', backup); assert.equal(saved.status, 0, saved.stderr); assert.equal(JSON.parse(saved.stdout).code, 'BACKUP_OK');
    const restored = run(target, 'restore', '--input', backup); assert.equal(restored.status, 0, restored.stderr); assert.equal(JSON.parse(restored.stdout).code, 'RESTORE_OK');
    const ctx = await openStore(target); try { assert.equal(operatingConfig(ctx).idleMs, 60000); assert.equal(ctx.db.get<{ n: number }>('SELECT count(*) n FROM note_versions')!.n, 1); } finally { await ctx.shutdown(); }
    const invalid = run(f.ctx.config.dataDir, 'config', '--config', '{"private":"PRIVATE_TOKEN" broken'); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /INVALID_CONFIGURATION/); assert.equal(`${invalid.stderr}${invalid.stdout}`.includes('PRIVATE_TOKEN'), false);
  } finally { await f.close(); }
});
