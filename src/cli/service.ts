import { execFile } from 'node:child_process';
import { homedir, platform, userInfo } from 'node:os';
import { mkdir, readFile, unlink, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { atomicPrivate } from '../core/private-files.js';
import { DomainError } from '../core/contracts.js';

const execute = promisify(execFile);
const label = 'com.worklog.collector';
const marker = 'worklog-managed-service-v1';
export interface ServiceOptions { dataDir: string; central: boolean; home?: string; os?: string; nodePath?: string; cliPath?: string }
function xml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function unitArgument(value: string) { return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$')}"`; }
export function serviceDefinition(options: ServiceOptions) {
  const os = options.os ?? platform(); const home = options.home ?? homedir();
  const cli = options.cliPath ?? fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
  const argv = [options.nodePath ?? process.execPath, cli, 'agent', 'run', '--data-dir', options.dataDir, ...(options.central ? ['--central'] : [])];
  if ([home, ...argv].some((value) => /[\x00-\x1f]/.test(value))) throw new DomainError('SERVICE_ARGUMENT_INVALID');
  if (os === 'darwin') return { path: join(home, 'Library/LaunchAgents', `${label}.plist`), content: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${marker} -->\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${argv.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string></dict></plist>\n` };
  if (os === 'linux') return { path: join(home, '.config/systemd/user/worklog-agent.service'), content: `# ${marker}\n[Unit]\nDescription=Worklog durable collector\n\n[Service]\nType=simple\nExecStart=${argv.map(unitArgument).join(' ')}\nRestart=on-failure\nRestartSec=15\nUMask=0077\n\n[Install]\nWantedBy=default.target\n` };
  throw new DomainError('SERVICE_OS_UNSUPPORTED');
}
export async function writeService(options: ServiceOptions) {
  const definition = serviceDefinition(options);
  await mkdir(dirname(definition.path), { recursive: true, mode: 0o700 });
  try {
    if (!(await lstat(definition.path)).isFile() || !(await readFile(definition.path, 'utf8')).includes(marker)) throw new DomainError('SERVICE_NOT_OWNED');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  atomicPrivate(definition.path, definition.content);
  return definition;
}
export async function removeServiceFile(options: ServiceOptions) {
  const definition = serviceDefinition(options);
  try {
    if (!(await lstat(definition.path)).isFile() || !(await readFile(definition.path, 'utf8')).includes(marker)) throw new DomainError('SERVICE_NOT_OWNED');
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  await unlink(definition.path);
}
export async function serviceStatus(dataDir?: string) {
  let matches = true;
  if (dataDir) {
    try {
      const unit = await readFile(serviceDefinition({ dataDir, central: platform() === 'darwin' }).path, 'utf8');
      matches = unit.includes(marker) && (platform() === 'darwin' ? unit.includes(`<string>--data-dir</string><string>${xml(dataDir)}</string>`) : unit.includes(`${unitArgument('--data-dir')} ${unitArgument(dataDir)}`));
    } catch { matches = false; }
  }
  if (platform() === 'darwin') {
    try {
      const { stdout } = await execute('/bin/launchctl', ['print', `gui/${process.getuid!()}/${label}`], { timeout: 5000, maxBuffer: 64 * 1024 });
      return { installed: matches, running: matches && /state = running/.test(stdout), pid: matches ? Number(stdout.match(/\bpid = (\d+)/)?.[1] ?? 0) : 0, manager: 'launchd' };
    } catch { return { installed: false, running: false, pid: 0, manager: 'launchd' }; }
  }
  if (platform() === 'linux') {
    try {
      const { stdout } = await execute('systemctl', ['--user', 'show', 'worklog-agent.service', '--property=ActiveState,MainPID'], { timeout: 5000, maxBuffer: 4096 });
      const linger = await execute('loginctl', ['show-user', String(process.getuid!()), '-p', 'Linger'], { timeout: 5000, maxBuffer: 4096 }).catch(() => ({ stdout: '' }));
      return { installed: matches, running: matches && stdout.includes('ActiveState=active'), pid: matches ? Number(stdout.match(/MainPID=(\d+)/)?.[1] ?? 0) : 0, manager: 'systemd-user', linger: linger.stdout.includes('Linger=yes') };
    } catch { return { installed: false, running: false, pid: 0, manager: 'systemd-user', linger: false }; }
  }
  throw new DomainError('SERVICE_OS_UNSUPPORTED');
}
export async function manageService(action: 'install' | 'start' | 'stop' | 'status' | 'remove', options: ServiceOptions) {
  if (action === 'status') return serviceStatus(options.dataDir);
  const definition = action === 'install' ? await writeService(options) : serviceDefinition(options);
  if (action !== 'install') {
    try { if (!(await readFile(definition.path, 'utf8')).includes(marker)) throw new DomainError('SERVICE_NOT_OWNED'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && action === 'remove') return serviceStatus(); throw error; }
  }
  if (platform() === 'darwin') {
    const domain = `gui/${process.getuid!()}`;
    if (['install', 'stop', 'remove'].includes(action)) {
      await execute('/bin/launchctl', ['bootout', `${domain}/${label}`], { timeout: 10_000 }).catch(() => {});
      for (let attempt = 0; attempt < 50; attempt++) {
        const present = await execute('/bin/launchctl', ['print', `${domain}/${label}`], { timeout: 2000, maxBuffer: 64 * 1024 }).then(() => true, () => false);
        if (!present) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (['install', 'start'].includes(action)) await execute('/bin/launchctl', ['bootstrap', domain, definition.path], { timeout: 10_000 });
  } else if (platform() === 'linux') {
    await execute('systemctl', ['--user', 'daemon-reload'], { timeout: 10_000 });
    if (action === 'install') {
      await execute('loginctl', ['--no-ask-password', 'enable-linger', userInfo().username], { timeout: 10_000 }).catch(() => {});
      await execute('systemctl', ['--user', 'enable', '--now', 'worklog-agent.service'], { timeout: 15_000 });
      await execute('systemctl', ['--user', 'restart', 'worklog-agent.service'], { timeout: 120_000 });
    } else await execute('systemctl', ['--user', action === 'remove' ? 'disable' : action, ...(action === 'remove' ? ['--now'] : []), 'worklog-agent.service'], { timeout: 15_000 });
  } else throw new DomainError('SERVICE_OS_UNSUPPORTED');
  if (action === 'remove') { await removeServiceFile(options); if (platform() === 'linux') await execute('systemctl', ['--user', 'daemon-reload']); }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return serviceStatus(options.dataDir);
}
