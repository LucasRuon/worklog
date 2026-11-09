import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp, closeApp } from '../../src/server/index.js';

test('CLI inicia com dados novos, atende HTTP e encerra por SIGTERM sem vazar token', { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-cli-'));
  const dataDir = join(directory, 'dados com espaço');
  const probe = await createApp({ dataDir, port: 0 });
  const { port, origin } = probe.config;
  await closeApp(probe);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'serve', '--data-dir', dataDir, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (bytes: Buffer) => { output += bytes.toString(); });
  child.stderr.on('data', (bytes: Buffer) => { output += bytes.toString(); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(100) })).ok;
        if (ready) break;
      } catch { /* Esperar a inicialização do processo separado. */ }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, output);
    const token = (await readFile(join(dataDir, 'bootstrap.token'), 'utf8')).trim();
    assert.equal(output.includes(token), false);
    child.kill('SIGTERM');
    const [code, signal] = await exit;
    assert.equal(code, 0);
    assert.equal(signal, null);
    await assert.rejects(fetch(`${origin}/api/health`));
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; }
    await rm(directory, { recursive: true, force: true });
  }
});
