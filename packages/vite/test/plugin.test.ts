import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TranslationResult, Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin, ResolvedConfig } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src/index';

const tempDirs: string[] = [];
let unitDirectoryIndex = 0;
const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('@ai-i18n/vite plugin', () => {
  it('injects a stable register import after shebang and directives', async () => {
    const { plugin, transform } = setupPlugin();
    const code = `#!/usr/bin/env node\n'use strict';\nimport { t as tr } from 'virtual:ai-i18n';\nconsole.log(tr('保存', '按钮'));`;
    const result = await transform(code, '/workspace/src/main.ts');

    expect(result?.code).toMatch(
      /^#!\/usr\/bin\/env node\n'use strict';\nimport \{ t as tr \} from 'virtual:ai-i18n';\nimport "virtual:ai-i18n\/register\?module=src%2Fmain.ts";/,
    );
    expect(result?.map).toMatchObject({
      sources: ['/workspace/src/main.ts'],
      sourcesContent: [code],
    });

    const registerId = 'virtual:ai-i18n/register?module=src%2Fmain.ts';
    const resolved = callHook<string | undefined>(plugin.resolveId, registerId);
    expect(resolved).toBe(`\0${registerId}`);
    const registration = await callHook<Promise<string>>(
      plugin.load,
      resolved!,
    );
    expect(registration).toContain('"zh-CN":{"保存#按钮":"保存"}');
    expect(registration).toContain('"en-US":{"保存#按钮":null}');
    expect(registration).toContain('import.meta.hot.dispose');
  });

  it('translates in the background and sends a targeted runtime update', async () => {
    let finish!: () => void;
    const translator: Translator = vi.fn<Translator>(
      (requests) =>
        new Promise<TranslationResult[]>((resolve) => {
          finish = () =>
            resolve(
              requests.map((request) => ({
                messageId: request.messageId,
                locale: request.locale,
                value: 'Save',
              })),
            );
        }),
    );
    const { plugin, transform, hotSend, directory } = setupPlugin(
      [],
      undefined,
      { ...options, translator, provider: { batchLength: 1 } },
    );

    const transformed = await transform(
      "import { t } from 'virtual:ai-i18n'; t('保存')",
      '/workspace/src/provider.ts',
    );
    expect(transformed?.code).toContain('register?module=src%2Fprovider.ts');
    expect(translator).toHaveBeenCalledTimes(1);

    const registerId = '\0virtual:ai-i18n/register?module=src%2Fprovider.ts';
    const before = await callHook<Promise<string>>(plugin.load, registerId);
    expect(before).toContain('"en-US":{"保存":null}');

    finish();
    await vi.waitFor(() => {
      expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
        moduleId: 'src/provider.ts',
        messages: {
          'zh-CN': { 保存: '保存' },
          'en-US': { 保存: 'Save' },
        },
      });
    });
    expect(
      await readJson(path.join(directory, 'locales/en-US.json')),
    ).toMatchObject({
      messages: { 保存: 'Save' },
    });

    const extractedFile = path.join(
      directory,
      'extracted/src/provider.ts.json',
    );
    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'update';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);
    const generated = await fs.readFile(extractedFile, 'utf8');
    hotSend.mockClear();
    await expect(
      hotUpdate.call(
        { environment: { name: 'client' } },
        {
          type: 'update',
          file: extractedFile,
          timestamp: 2,
          modules: [],
          read: async () => generated,
        },
      ),
    ).resolves.toEqual([]);
    expect(hotSend).not.toHaveBeenCalled();

    const edited = JSON.parse(generated) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    edited.messages[0]!.translations['en-US'] = 'Store';
    const editedContent = `${JSON.stringify(edited, null, 2)}\n`;
    await fs.writeFile(extractedFile, editedContent);
    await hotUpdate.call(
      { environment: { name: 'client' } },
      {
        type: 'update',
        file: extractedFile,
        timestamp: 3,
        modules: [],
        read: async () => editedContent,
      },
    );
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/provider.ts',
      messages: {
        'zh-CN': { 保存: '保存' },
        'en-US': { 保存: 'Store' },
      },
    });
    expect(await readJson(path.join(directory, 'cache.json'))).toMatchObject({
      messages: { 保存: { translations: { 'en-US': 'Store' } } },
    });
  });

  it('does not change modules without an imported t call', async () => {
    const { transform } = setupPlugin();
    expect(
      await transform(
        'const t = (value) => value; t("ignored")',
        '/workspace/src/plain.ts',
      ),
    ).toBeNull();
  });

  it('auto-imports the Vanilla runtime without changing local bindings', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'unplugin-auto-import' },
    ]);
    const result = await transform(
      "t('自动导入'); setLang('en-US')",
      '/workspace/src/main.ts',
    );

    expect(result?.code).toContain(
      'import { t, setLang } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('register?module=src%2Fmain.ts');
  });

  it('keeps auto import disabled when the host plugin is absent', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform("t('需要显式导入')", '/workspace/src/main.ts'),
    ).resolves.toBeNull();
  });

  it('allows auto import detection to be forced in either direction', async () => {
    const forcedOn = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    expect(
      await forcedOn.transform("t('强制开启')", '/workspace/src/forced-on.ts'),
    ).not.toBeNull();

    const forcedOff = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: false },
      [{ name: 'unplugin-auto-import' }],
    );
    await expect(
      forcedOff.transform("t('强制关闭')", '/workspace/src/forced-off.ts'),
    ).resolves.toBeNull();
  });

  it('does not treat JSX as Vanilla source', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform(
        "export const view = <p>{t('JSX 文案')}</p>",
        '/workspace/src/View.jsx',
      ),
    ).resolves.toBeNull();
  });

  it('detects Vue JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, loading: { strategy: 'locale' } },
      [
        { name: 'vite:vue' },
        { name: 'vite:vue-jsx' },
        { name: 'unplugin-auto-import' },
      ],
    );
    const vue = await transform(
      `const { t } = useI18n()
export const View = () => <p>{t('Vue JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(vue?.code).toContain('import { useI18n } from "virtual:ai-i18n";');
    expect(vue?.code).toContain('register?module=src%2FView.tsx');
  });

  it('keeps the explicit Hook import when auto import is disabled', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);
    const vue = await transform(
      `import { useI18n } from 'virtual:ai-i18n'
const { t } = useI18n()
export const label = t('显式 Hook')`,
      '/workspace/src/useLabel.ts',
    );

    expect(vue?.code).toContain("import { useI18n } from 'virtual:ai-i18n'");
    expect(vue?.code).not.toContain(
      'import { useI18n } from "virtual:ai-i18n";',
    );
    expect(vue?.code).toContain('register?module=src%2FuseLabel.ts');
  });

  it('detects React JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, loading: { strategy: 'locale' } },
      [{ name: 'vite:react-babel' }, { name: 'unplugin-auto-import' }],
    );
    const react = await transform(
      `const { t } = useI18n()
export const View = () => <p>{t('React JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(react?.code).toContain('import { useI18n } from "virtual:ai-i18n";');
    expect(react?.code).toContain('register?module=src%2FView.tsx');
  });

  it('reports dynamic arguments with source locations', async () => {
    const warnings: unknown[] = [];
    const { transform } = setupPlugin(warnings, undefined, options, [
      { name: 'unplugin-auto-import' },
    ]);
    const result = await transform(
      't(props.label)',
      '/workspace/src/dynamic.ts',
    );
    expect(result?.code).toContain('import { t } from "virtual:ai-i18n";');
    expect(warnings).toMatchObject([
      { id: '/workspace/src/dynamic.ts', loc: { line: 1, column: 0 } },
    ]);
  });

  it('invalidates the current environment register module on hot update', async () => {
    const { plugin, transform } = setupPlugin();
    await transform(
      "import { t } from 'virtual:ai-i18n'; t('before')",
      '/workspace/src/hot.ts',
    );
    const register = { id: '\0virtual:ai-i18n/register?module=src%2Fhot.ts' };
    const invalidateModule = vi.fn();
    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'update';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);
    const result = await hotUpdate.call(
      {
        environment: {
          name: 'client',
          moduleGraph: {
            getModuleById: () => register,
            invalidateModule,
          },
        },
      },
      {
        type: 'update',
        file: '/workspace/src/hot.ts',
        timestamp: 1,
        modules: [],
        read: async () => "import { t } from 'virtual:ai-i18n'; t('after')",
      },
    );

    expect(invalidateModule).toHaveBeenCalledWith(
      register,
      expect.any(Set),
      1,
      true,
    );
    expect(result).toEqual([register]);
  });

  it('invalidates importer registration when an imported constant changes', async () => {
    const { plugin, transform } = setupPlugin(
      [],
      async (specifier, importer) =>
        specifier === './texts' && importer === '/workspace/src/main.ts'
          ? { id: '/workspace/src/texts.ts' }
          : null,
    );
    await transform("export const LABEL = 'before'", '/workspace/src/texts.ts');
    await transform(
      "import { t } from 'virtual:ai-i18n'; import { LABEL } from './texts'; t(LABEL)",
      '/workspace/src/main.ts',
    );

    const register = { id: '\0virtual:ai-i18n/register?module=src%2Fmain.ts' };
    const invalidateModule = vi.fn();
    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'update';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);
    const result = await hotUpdate.call(
      {
        environment: {
          name: 'client',
          moduleGraph: {
            getModuleById: (id: string) =>
              id === register.id ? register : undefined,
            invalidateModule,
          },
        },
      },
      {
        type: 'update',
        file: '/workspace/src/texts.ts',
        timestamp: 2,
        modules: [],
        read: async () => "export const LABEL = 'after'",
      },
    );

    expect(invalidateModule).toHaveBeenCalledWith(
      register,
      expect.any(Set),
      2,
      true,
    );
    expect(result).toEqual([register]);
  });

  it('sends locale-only HMR updates without requesting an unloaded locale', async () => {
    const { plugin, transform, hotSend, directory } = setupPlugin(
      [],
      undefined,
      {
        ...options,
        defaultLang: 'zh-CN',
        loading: { strategy: 'locale' },
      },
    );
    await transform(
      "import { t } from 'virtual:ai-i18n'; t('保存')",
      '/workspace/src/lazy-hot.ts',
    );
    const extractedFile = path.join(
      directory,
      'extracted/src/lazy-hot.ts.json',
    );
    const edited = (await readJson(extractedFile)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    edited.messages[0]!.translations['en-US'] = 'Save';
    const editedContent = `${JSON.stringify(edited, null, 2)}\n`;
    await fs.writeFile(extractedFile, editedContent);
    hotSend.mockClear();

    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'update';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);
    await hotUpdate.call(
      { environment: { name: 'client' } },
      {
        type: 'update',
        file: extractedFile,
        timestamp: 4,
        modules: [],
        read: async () => editedContent,
      },
    );

    expect(hotSend).toHaveBeenCalledWith('ai-i18n:locale-update', {
      locale: 'en-US',
      messages: { 保存: 'Save' },
    });
    expect(hotSend).not.toHaveBeenCalledWith(
      'ai-i18n:update',
      expect.anything(),
    );
  });

  it('generates a static Dev locale manifest and locale HMR listener', async () => {
    const { plugin } = setupPlugin([], undefined, {
      ...options,
      defaultLang: 'zh-CN',
      loading: { strategy: 'locale' },
    });
    const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
    const code = await callHook<Promise<string>>(plugin.load, runtimeId);

    expect(code).toContain(
      '"en-US": () => import("/@ai-i18n/locale/en-US.js")',
    );
    expect(code).toContain('ai-i18n:locale-update');
    expect(code).toContain('runtime.replaceLocale(locale, messages)');
  });

  it('returns a stateless stub and skips transforms for SSR', async () => {
    const warnings: unknown[] = [];
    const { plugin, transform } = setupPlugin(warnings);
    await expect(
      transform(
        "import { t } from 'virtual:ai-i18n'; t('服务端')",
        '/workspace/src/ssr.ts',
        { ssr: true },
      ),
    ).resolves.toBeNull();

    const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
    const load = objectHandler<
      (this: unknown, id: string, options: { ssr: boolean }) => Promise<string>
    >(plugin.load);
    const stub = await load.call(
      {
        environment: { name: 'ssr' },
        warn: (value: unknown) => warnings.push(value),
      },
      runtimeId,
      { ssr: true },
    );

    expect(stub).toContain('export const t = (source) => source');
    expect(stub).not.toContain('createI18nRuntime');
    expect(warnings).toHaveLength(1);
  });
});

function setupPlugin(
  warnings: unknown[] = [],
  resolve: (
    specifier: string,
    importer: string,
  ) => Promise<{ id: string; external?: boolean } | null> = async () => null,
  pluginOptions: AiI18nOptions = options,
  vitePlugins: Plugin[] = [],
) {
  const directory = path.join(
    os.tmpdir(),
    `ai-i18n-vite-unit-${process.pid}-${unitDirectoryIndex++}`,
  );
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
    root: '/workspace',
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
  const hotSend = vi.fn();
  const context = {
    environment: { name: 'client', hot: { send: hotSend } },
    warn: (warning: unknown) => warnings.push(warning),
    resolve,
    addWatchFile: () => {},
  };
  return {
    plugin,
    directory,
    hotSend,
    transform: (code: string, id: string, options?: { ssr?: boolean }) =>
      handler.call(context, code, id, options),
  };
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}

function objectHandler<T>(hook: unknown): T {
  if (typeof hook === 'function') return hook as T;
  return (hook as { handler: T }).handler;
}

function callHook<T>(hook: unknown, ...args: unknown[]): T {
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
