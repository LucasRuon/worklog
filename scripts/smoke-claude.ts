import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { openStore } from '../src/core/context.js';
import { registerProjectRoot } from '../src/core/projects.js';
import { configureClaudeHooks } from '../src/cli/hooks.js';
import { drainQueue } from '../src/collectors/claude.js';

const directory = await mkdtemp(join(tmpdir(), 'worklog-live-claude-'));
const root = join(directory, 'repository'); await mkdir(root);
const dataDir = join(directory, 'data');
let ctx = await openStore(dataDir);
try {
  await promisify(execFile)('git', ['init', '-q', root]);
  const projectId = registerProjectRoot(ctx, { deviceId: ctx.config.deviceId, projectName: 'Smoke isolado', path: root });
  const configPath = join(directory, 'profile', 'settings.json');
  await configureClaudeHooks(configPath, 'install', { ctx });
  await ctx.shutdown();
  let cliSucceeded = true;
  let failure: { code: string | number | null; categories: string[]; diagnostic: string } | null = null;
  try {
    await promisify(execFile)('claude', ['-p', 'Responda apenas OK.', '--settings', configPath, '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '', '--permission-mode', 'dontAsk', '--max-budget-usd', '0.10', '--no-session-persistence', '--output-format', 'json', '--no-chrome'], { cwd: root, timeout: 90_000, maxBuffer: 64 * 1024 });
  } catch (error) {
    cliSucceeded = false;
    const details = error as { code?: string | number; stderr?: string; stdout?: string };
    const text = `${details.stderr ?? ''} ${details.stdout ?? ''}`;
    let diagnostic = (details.stderr ?? '').split('\n').filter((line) => /error|invalid|unknown|not |must |requires/i.test(line)).slice(0, 2).join(' ');
    try {
      const result = JSON.parse(details.stdout ?? '') as { error?: unknown; errors?: unknown; result?: unknown };
      diagnostic ||= JSON.stringify(result.error ?? result.errors ?? result.result ?? 'CLI sem diagnóstico estruturado');
    } catch { diagnostic ||= (details.stdout ?? '').split('\n')[0] ?? ''; }
    for (const [key, value] of Object.entries(process.env)) if (/TOKEN|SECRET|PASSWORD|API_KEY/i.test(key) && value && value.length > 5) diagnostic = diagnostic.replaceAll(value, '[redacted]');
    failure = { code: details.code ?? null, categories: ['nested', 'authentication', 'login', 'API', 'unknown option', 'budget', 'model', 'settings', 'session', 'permission', 'Credit balance', 'rate limit'].filter((term) => text.toLowerCase().includes(term.toLowerCase())), diagnostic: diagnostic.slice(0, 300) };
  }
  ctx = await openStore(dataDir);
  const queue = drainQueue(ctx);
  const types = ctx.db.all<{ type: string; count: number }>('SELECT type, count(*) AS count FROM events GROUP BY type ORDER BY type');
  const observed = ['session.start', 'session.end', 'turn.submit', 'turn.start', 'turn.end'].every((type) => types.some((row) => row.type === type));
  console.log(JSON.stringify({ cliSucceeded, failure, projectId, queue, types, passed: cliSucceeded && observed }, null, 2));
  if (!cliSucceeded || !observed) process.exitCode = 1;
} finally { await ctx.shutdown(); await rm(directory, { recursive: true, force: true }); }
