import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { openStore } from '../src/core/context.js';
import { registerSource } from '../src/collectors/source-config.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { stableId } from '../src/core/policy.js';
import { configureCodexHooks } from '../src/cli/hooks.js';
import { codexHooks, supportedCodexVersions } from '../src/collectors/codex.js';
import { drainQueue } from '../src/collectors/claude.js';

// Native discovery smoke: isolated CODEX_HOME, no auth copied and no model turn.
const directory = await mkdtemp(join(tmpdir(), 'worklog-native-codex-'));
const home = join(directory, 'codex'); await mkdir(home);
const root = join(directory, 'repo'); await mkdir(root);
const ctx = await openStore(join(directory, 'data'));
let child: ReturnType<typeof spawn> | undefined;
let exit: Promise<unknown> | undefined;
try {
  const version = execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 10_000 }).match(/\b\d+\.\d+\.\d+\b/)?.[0];
  assert.ok(version && supportedCodexVersions.includes(version), 'CODEX_VERSION_UNSUPPORTED');
  const configPath = join(home, 'hooks.json');
  const sourceId = stableId(ctx.config.installationId, 'codex', configPath);
  registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, projectName: 'Smoke Codex', path: root });
  registerSource(ctx, { id: sourceId, deviceId: ctx.config.deviceId, installationId: ctx.config.installationId, tool: 'codex', profile: 'smoke', configPath, version, enabled: true });
  await configureCodexHooks(configPath, 'install', { ctx, sourceId });
  child = spawn('codex', ['app-server', '--stdio'], { cwd: root, env: { ...process.env, CODEX_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
  exit = once(child, 'exit');
  // stderr can contain native environment details; consume it without persisting it.
  child.stderr!.resume();
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const reader = createInterface({ input: child.stdout! });
  reader.on('line', (line) => {
    try {
      const value = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
      if (typeof value.id !== 'number') return;
      const request = pending.get(value.id); if (!request) return;
      pending.delete(value.id);
      if (value.error) request.reject(new Error('CODEX_NATIVE_RPC_ERROR')); else request.resolve(value.result);
    } catch { /* Only protocol responses are admitted. */ }
  });
  let id = 0;
  async function request(method: string, params: unknown): Promise<unknown> {
    const key = ++id;
    const response = new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    const timer = setTimeout(() => { pending.get(key)?.reject(new Error('CODEX_NATIVE_TIMEOUT')); pending.delete(key); }, 15_000);
    child!.stdin!.write(`${JSON.stringify({ id: key, method, params })}\n`);
    try { return await response; } finally { clearTimeout(timer); }
  }
  await request('initialize', { clientInfo: { name: 'worklog_smoke', title: 'Worklog smoke', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  child.stdin!.write('{"method":"initialized"}\n');
  const listed = await request('hooks/list', { cwds: [root] }) as { data: { hooks: { eventName: string; command?: string; timeoutSec: number; enabled: boolean; trustStatus: string }[]; errors: unknown[] }[] };
  assert.ok(listed.data.every((entry) => entry.errors.length === 0), 'Native hook config must parse');
  const hooks = listed.data.flatMap((entry) => entry.hooks).filter((hook) => hook.command?.includes(sourceId));
  // app-server enums are lowerCamelCase; hooks.json/stdin use PascalCase.
  assert.deepEqual(hooks.map((hook) => hook.eventName).sort(), codexHooks.map((name) => name[0]!.toLowerCase() + name.slice(1)).sort());
  assert.ok(hooks.every((hook) => hook.timeoutSec === 2 && hook.enabled));
  const trustStatuses = [...new Set(hooks.map((hook) => hook.trustStatus))];
  assert.ok(!trustStatuses.includes('trusted'), 'Fresh hooks must require native trust review');
  const queue = drainQueue(ctx);
  assert.equal(queue.inserted, 0);
  console.log(JSON.stringify({ passed: true, scope: 'native-discovery-and-trust', version, hooksDetected: hooks.length, trustStatuses, eventsObserved: 0, liveCapture: 'pending-native-trust-review', desktopApp: 'not-found-in-inventoried-paths', modelRequests: 0 }, null, 2));
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.stdin?.end(); child.kill('SIGTERM');
    const kill = setTimeout(() => child!.kill('SIGKILL'), 3000);
    try { await exit; } finally { clearTimeout(kill); }
  }
  await ctx.shutdown(); await rm(directory, { recursive: true, force: true });
}
