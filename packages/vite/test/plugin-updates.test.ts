import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranslationResult, Translator } from '@ai-i18n/core';
import { describe, expect, it, vi } from 'vitest';
import {
  callHook,
  objectHandler,
  options,
  readJson,
  setupPlugin,
} from './plugin-test-utils';

describe('@ai-i18n/vite plugin updates', () => {
  it('translates in the background and sends a targeted runtime update', async () => {
    let finish!: () => void;
    const translator: Translator = vi.fn<Translator>(
      ({ messages }) =>
        new Promise<TranslationResult[]>((resolve) => {
          finish = () =>
            resolve(
              messages.map(() => ({
                'en-US': 'Save',
              })),
            );
        }),
    );
    const { plugin, transform, hotSend, directory } = setupPlugin(
      [],
      undefined,
      { ...options, provider: { translator, batchLength: 1 } },
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
      'extracted/src_provider.ts.json',
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

    const memoryFile = path.join(directory, 'translations.json');
    const edited = (await readJson(memoryFile)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    edited.messages['保存']!.translations['en-US'] = 'Store';
    const editedContent = `${JSON.stringify(edited, null, 2)}\n`;
    await fs.writeFile(memoryFile, editedContent);
    await hotUpdate.call(
      { environment: { name: 'client' } },
      {
        type: 'update',
        file: memoryFile,
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
    expect(
      await readJson(path.join(directory, 'translations.json')),
    ).toMatchObject({
      messages: { 保存: { translations: { 'en-US': 'Store' } } },
    });

    const overridesFile = path.join(directory, 'overrides.json');
    const overridesContent = `${JSON.stringify(
      {
        version: 1,
        messages: {
          保存: { default: { 'en-US': 'Keep' } },
        },
      },
      null,
      2,
    )}\n`;
    await fs.writeFile(overridesFile, overridesContent);
    hotSend.mockClear();
    await hotUpdate.call(
      { environment: { name: 'client' } },
      {
        type: 'update',
        file: overridesFile,
        timestamp: 4,
        modules: [],
        read: async () => overridesContent,
      },
    );
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/provider.ts',
      messages: {
        'zh-CN': { 保存: '保存' },
        'en-US': { 保存: 'Keep' },
      },
    });
    expect(
      await readJson(path.join(directory, 'locales/en-US.json')),
    ).toMatchObject({ messages: { 保存: 'Keep' } });
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

  it('keeps Vue top-level t auto-import analysis during hot updates', async () => {
    const { plugin, transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const filename = '/workspace/src/hot-vue.ts';
    await transform("export const label = t('before')", filename);

    const registerId = '\0virtual:ai-i18n/register?module=src%2Fhot-vue.ts';
    const register = { id: registerId };
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
      {
        environment: {
          name: 'client',
          moduleGraph: {
            getModuleById: (id: string) =>
              id === registerId ? register : undefined,
            invalidateModule: vi.fn(),
          },
        },
      },
      {
        type: 'update',
        file: filename,
        timestamp: 2,
        modules: [],
        read: async () => "export const label = t('after')",
      },
    );

    const registration = await callHook<Promise<string>>(
      plugin.load,
      registerId,
    );
    expect(registration).toContain('"after"');
    expect(registration).not.toContain('"before"');
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
        loading: {},
      },
    );
    await transform(
      "import { t } from 'virtual:ai-i18n'; t('保存')",
      '/workspace/src/lazy-hot.ts',
    );
    const memoryFile = path.join(directory, 'translations.json');
    const edited = (await readJson(memoryFile)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    edited.messages['保存']!.translations['en-US'] = 'Save';
    const editedContent = `${JSON.stringify(edited, null, 2)}\n`;
    await fs.writeFile(memoryFile, editedContent);
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
        file: memoryFile,
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
      loading: {},
    });
    const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
    const code = await callHook<Promise<string>>(plugin.load, runtimeId);

    expect(code).toContain(
      '"en-US": () => import("/@ai-i18n/locale/en-US.js")',
    );
    expect(code).toContain('ai-i18n:locale-update');
    expect(code).toContain('runtime.replaceLocale(locale, messages)');
  });
});
