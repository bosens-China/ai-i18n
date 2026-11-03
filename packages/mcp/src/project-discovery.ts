import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fail } from './errors.js';

const skipped = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'build',
  'coverage',
  'vendor',
  'i18n',
]);

/** 发现只检查文件名，不 import 任何候选配置。 */
export async function discoverProjects(workspaceDirectory: string) {
  if (!path.isAbsolute(workspaceDirectory))
    fail('WORKSPACE_DIRECTORY_NOT_ABSOLUTE');
  const root = await fs
    .realpath(workspaceDirectory)
    .catch(() => fail('WORKSPACE_NOT_FOUND'));
  const projects: { config_file: string; app_directory: string }[] = [];
  let truncated = false;
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'ai-i18n.config.ts') {
        if (projects.length === 100) {
          truncated = true;
          return;
        }
        projects.push({ config_file: file, app_directory: directory });
      } else if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !skipped.has(entry.name)
      ) {
        await visit(file);
        if (truncated) return;
      }
    }
  }
  await visit(root);
  return { workspace_directory: root, projects, truncated };
}

export async function resolveProject(
  configFile: string,
  command: 'serve' | 'build' = 'serve',
  mode = command === 'build' ? 'production' : 'development',
) {
  if (!path.isAbsolute(configFile)) fail('CONFIG_FILE_NOT_ABSOLUTE');
  const file = await fs
    .realpath(configFile)
    .catch(() => fail('CONFIG_NOT_FOUND', { config_file: configFile }));
  const app = path.dirname(file);
  const require = createRequire(path.join(app, 'package.json'));
  let loaderPath: string;
  try {
    loaderPath = require.resolve('@ai-i18n/vite/config');
  } catch {
    fail('CONFIG_LOADER_UNAVAILABLE', { config_file: file });
  }
  const { loadAiI18nConfig } = (await import(
    pathToFileURL(loaderPath).href
  )) as {
    loadAiI18nConfig(
      file: string,
      env: { command: 'serve' | 'build'; mode: string },
    ): Promise<{
      root: string;
      options: {
        directory: string;
        sourceLang: string;
        locales: { value: string; label: string }[];
        remote?: { load?: unknown; mode?: string };
      };
    }>;
  };
  const { root, options } = await loadAiI18nConfig(file, {
    command,
    mode,
  }).catch(() => fail('CONFIG_INVALID', { config_file: file }));
  return {
    config_file: file,
    app_directory: app,
    vite_root: root,
    i18n_directory: options.directory,
    source_lang: options.sourceLang,
    locales: options.locales.map(({ value, label }) => ({ value, label })),
    command,
    mode,
    translation_source: options.remote?.load
      ? options.remote.mode === 'overlay'
        ? 'overlay'
        : 'remote'
      : 'local',
  };
}
