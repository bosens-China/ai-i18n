import fs from 'node:fs/promises';
import { runtimeMessageId } from '@ai-i18n/core';
import { describe, expect, it, vi } from 'vitest';
import {
  callHook,
  objectHandler,
  options,
  setupPlugin,
} from './plugin-test-utils';
import {
  firstTranslationShard,
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

describe('@ai-i18n/vite plugin HMR', () => {
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

  it('pushes importer registration when an imported constant changes', async () => {
    const { plugin, transform, hotSend } = setupPlugin(
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
            getModuleById: () => undefined,
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

    expect(invalidateModule).not.toHaveBeenCalled();
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/main.ts',
      messages: {
        'zh-CN': { [runtimeMessageId('src/main.ts', 'after')]: 'after' },
        'en-US': { [runtimeMessageId('src/main.ts', 'after')]: null },
      },
    });
    expect(result).toBeUndefined();
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
    await vi.waitFor(async () => {
      expect(
        (await readTestTranslationMemory(directory)).messages,
      ).toHaveProperty('保存');
    });
    await updateTestTranslationMemory(directory, (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'Save';
    });
    const memoryFile = await firstTranslationShard(directory);
    const editedContent = await fs.readFile(memoryFile, 'utf8');
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
      messages: {
        [runtimeMessageId('src/lazy-hot.ts', '保存')]: 'Save',
      },
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
