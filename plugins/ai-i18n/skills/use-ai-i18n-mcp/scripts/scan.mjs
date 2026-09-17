import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    config: { type: 'string' },
    mode: { type: 'string' },
    entry: { type: 'string', multiple: true },
  },
});
const root = path.resolve(values.root);
const require = createRequire(path.join(root, 'package.json'));
try {
  process.chdir(root);
  const { scanProject } = await import(
    pathToFileURL(require.resolve('@ai-i18n/vite/internal/scan')).href
  );
  const result = await scanProject(
    {
      logLevel: 'warn',
      ...(values.config
        ? { configFile: path.resolve(root, values.config) }
        : {}),
      ...(values.mode ? { mode: values.mode } : {}),
    },
    values.entry,
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
