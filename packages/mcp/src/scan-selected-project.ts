import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveProject } from './project-discovery.js';
import { fail } from './errors.js';

export async function scanSelectedProject(
  configFile: string,
  entries?: readonly string[],
) {
  const selected = await resolveProject(configFile);
  const require = createRequire(
    path.join(selected.app_directory, 'package.json'),
  );
  let scanPath: string;
  try {
    scanPath = require.resolve('@ai-i18n/vite/internal/scan');
  } catch {
    fail('CONFIG_LOADER_UNAVAILABLE', { config_file: selected.config_file });
  }
  const { scanConfiguredProject } = (await import(
    pathToFileURL(scanPath).href
  )) as {
    scanConfiguredProject(
      file: string,
      config?: unknown,
      entries?: readonly string[],
    ): Promise<unknown>;
  };
  return scanConfiguredProject(selected.config_file, {}, entries);
}
