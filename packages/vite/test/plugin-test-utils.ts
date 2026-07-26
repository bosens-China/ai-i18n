import { mkdtempSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import type { Plugin, ResolvedConfig } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src/index';

const tempDirs: string[] = [];

export const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

export function setupPlugin(
  warnings: unknown[] = [],
  resolve: (
    specifier: string,
    importer: string,
  ) => Promise<{ id: string; external?: boolean } | null> = async () => null,
  pluginOptions: AiI18nOptions = options,
  vitePlugins: Plugin[] = [],
  root = '/workspace',
) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-vite-unit-'));
  tempDirs.push(directory);
  const plugin = aiI18n({
    ...pluginOptions,
    dts: false,
    directory,
    cleanup: {
      ...pluginOptions.cleanup,
      missingSourceFiles: false,
    },
  });
  callHook<void>(plugin.configResolved, {
    root,
    command: 'serve',
    plugins: vitePlugins,
  } as unknown as ResolvedConfig);
  const handler = objectHandler<
    (
      this: unknown,
      code: string,
      id: string,
      options?: { ssr?: boolean },
    ) => Promise<{ code: string; map: unknown } | null>
  >(plugin.transform);
  const hotSend = vi.fn<(event: string, payload: unknown) => void>();
  const dependencyLoad = vi.fn<(...args: unknown[]) => Promise<null>>(
    async () => null,
  );
  const context = {
    environment: { name: 'client', hot: { send: hotSend } },
    warn: (warning: unknown) => warnings.push(warning),
    resolve,
    addWatchFile: () => {},
    load: dependencyLoad,
  };
  return {
    plugin,
    directory,
    hotSend,
    dependencyLoad,
    transform: (code: string, id: string, options?: { ssr?: boolean }) =>
      handler.call(context, code, id, options),
  };
}

export async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}

export function objectHandler<T>(hook: unknown): T {
  if (typeof hook === 'function') return hook as T;
  return (hook as { handler: T }).handler;
}

export function callHook<T>(hook: unknown, ...args: unknown[]): T {
  const handler =
    typeof hook === 'function'
      ? hook
      : objectHandler<(...values: unknown[]) => T>(hook);
  return handler.apply(
    {
      environment: { name: 'client' },
      warn: () => {},
      addWatchFile: () => {},
      load: async () => null,
    },
    args,
  ) as T;
}
