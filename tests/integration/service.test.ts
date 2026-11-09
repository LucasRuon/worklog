import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { serviceDefinition, writeService, removeServiceFile } from '../../src/cli/service.js';

test('serviços: argv com espaços/unicode, escaping, instalação repetida e arquivo alheio preservado', async () => {
  const home = await mkdtemp(join(tmpdir(), 'worklog-service-'));
  try {
    const options = { home, dataDir: '/dados/com espaço & dólar$', central: true, os: 'darwin', nodePath: '/runtime/node', cliPath: '/app com espaço/dist/cli/index.js' };
    const mac = await writeService(options);
    assert.throws(() => serviceDefinition({ ...options, dataDir: '/tmp/invalid\nInjected=value' }), /SERVICE_ARGUMENT_INVALID/);
    assert.match(mac.content, /com espaço &amp; dólar/);
    assert.match(mac.content, /<string>--central<\/string>/);
    await writeService(options); assert.equal(await readFile(mac.path, 'utf8'), mac.content);
    const linux = serviceDefinition({ ...options, os: 'linux', central: false });
    assert.match(linux.content, /"d?\/app com espaço\/dist\/cli\/index.js"/);
    assert.match(linux.content, /Restart=on-failure/);
    assert.equal(linux.content.includes('--central'), false);
    await mkdir(dirname(linux.path), { recursive: true }); await writeFile(linux.path, 'existing user service');
    await assert.rejects(writeService({ ...options, os: 'linux' }), /SERVICE_NOT_OWNED/);
    await assert.rejects(removeServiceFile({ ...options, os: 'linux' }), /SERVICE_NOT_OWNED/);
    assert.equal(await readFile(linux.path, 'utf8'), 'existing user service');
    await removeServiceFile(options);
    await assert.rejects(readFile(mac.path), { code: 'ENOENT' });
    await removeServiceFile(options);
  } finally { await rm(home, { recursive: true, force: true }); }
});
