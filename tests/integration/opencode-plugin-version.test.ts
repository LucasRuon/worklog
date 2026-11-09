import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fixture } from '../helpers.js';
import { listSources } from '../../src/collectors/source-config.js';

test('CLI detecta a versão OpenCode ao instalar e recusa versão desconhecida', async () => {
  const f = await fixture(); const bin = join(f.directory, 'bin'); await mkdir(bin);
  try {
    for (const version of ['2.2.6', '2.2.7']) {
      await writeFile(join(bin, 'opencode'), `#!${process.execPath}\nconsole.log('opencode v${version}');\n`, { mode: 0o700 });
      const path = join(f.directory, version, 'worklog.js');
      const result = spawnSync(process.execPath, ['dist/cli/index.js', 'automation', 'install', '--data-dir', f.ctx.config.dataDir, '--plugin-path', path], { encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}` } });
      if (version === '2.2.6') {
        assert.equal(result.status, 0, result.stderr);
        const { sourceId } = JSON.parse(result.stdout);
        assert.equal(listSources(f.ctx).find((s) => s.id === sourceId)?.version, '2.2.6');
        assert.match(await readFile(path, 'utf8'), /worklog-managed-opencode-v2/);
      } else {
        assert.equal(result.status, 1); assert.match(result.stderr, /OPENCODE_VERSION_UNSUPPORTED/);
        await assert.rejects(readFile(path), { code: 'ENOENT' });
        assert.equal(listSources(f.ctx).some((s) => s.configPath === path), false);
      }
    }
  } finally { await f.close(); }
});
