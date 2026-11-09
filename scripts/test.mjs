import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [kind, ...selected] = process.argv.slice(2);
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['e2e', 'fixtures'].includes(entry.name) ? [] : discover(path);
    }
    return path.endsWith('.test.ts') && path.startsWith('tests/integration/') === (kind === 'integration') ? [path] : [];
  });
}
const files = selected.length ? selected : discover('tests');
if (files.length === 0) {
  console.log(`Nenhum teste ${kind} implementado nesta etapa.`);
} else {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
