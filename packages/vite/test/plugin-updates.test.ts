import fs from 'node:fs/promises';
import path from 'node:path';
import {
  runtimeMessageId,
  type TranslationBatchEvent,
  type TranslationResult,
  type Translator,
} from '@ai-i18n/core';
import { describe, expect, it, vi } from 'vitest';
import { extractedPath } from '../src/file-store-paths';
import {
  callHook,
  objectHandler,
  options,
  readJson,
  setupPlugin,
} from './plugin-test-utils';
import { updateTestTranslationMemory } from './translation-memory-test-utils';

describe('@ai-i18n/vite plugin updates', () => {
  it('reconciles a deleted managed extracted file without reading it', async () => {
    const { plugin, directory, transform } = setupPlugin();
    await transform(
      "import { t } from 'virtual:ai-i18n'; t('保存')",
      '/workspace/src/deleted-extracted.ts',
    );
    const extractedFile = extractedPath(directory, 'src/deleted-extracted.ts');
    await vi.waitFor(async () => {
      await expect(fs.stat(extractedFile)).resolves.toBeDefined();
    });
    await fs.rm(extractedFile);
    const read = vi.fn<() => Promise<string>>(async () => {
      throw new Error('delete events must not read the removed file');
    });
    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'delete';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);

    await expect(
      hotUpdate.call(
        { environment: { name: 'client' } },
        {
          type: 'delete',
          file: extractedFile,
          timestamp: 1,
          modules: [],
          read,
        },
      ),
    ).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
    await expect(fs.readFile(extractedFile, 'utf8')).resolves.toContain(
      'src/deleted-extracted.ts',
    );

    const context = {
      environment: {
        name: 'client',
        moduleGraph: {
          getModuleById: () => undefined,
          invalidateModule: vi.fn(),
        },
      },
    };
    await hotUpdate.call(context, {
      type: 'delete',
      file: '/workspace/src/deleted-extracted.ts',
      timestamp: 2,
      modules: [],
      read,
    });
    await fs.rm(extractedFile);
    await hotUpdate.call(context, {
      type: 'delete',
      file: extractedFile,
      timestamp: 3,
      modules: [],
      read,
    });
    expect(read).not.toHaveBeenCalled();
    await expect(fs.stat(extractedFile)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

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
    const reportBatchEvent = vi.fn<(event: TranslationBatchEvent) => void>();
    translator.reportBatchEvent = reportBatchEvent;
    const { plugin, transform, hotSend, directory } = setupPlugin(
      [],
      undefined,
      {
        ...options,
        provider: { translator, batchLength: 1, logging: true },
      },
    );

    const transformed = await transform(
      "import { t } from 'virtual:ai-i18n'; t('保存')",
      '/workspace/src/provider.ts',
    );
    expect(transformed?.code).toContain('register?module=src%2Fprovider.ts');
    expect(translator).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledWith(
      expect.objectContaining({ logging: path.resolve('/workspace/logs') }),
    );

    const registerId = '\0virtual:ai-i18n/register?module=src%2Fprovider.ts';
    const before = await callHook<Promise<string>>(plugin.load, registerId);
    expect(before).toContain(
      JSON.stringify({
        [runtimeMessageId('src/provider.ts', '保存')]: null,
      }),
    );

    finish();
    await vi.waitFor(() => {
      expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
        moduleId: 'src/provider.ts',
        messages: {
          'zh-CN': {
            [runtimeMessageId('src/provider.ts', '保存')]: '保存',
          },
          'en-US': {
            [runtimeMessageId('src/provider.ts', '保存')]: 'Save',
          },
        },
      });
    });
    expect(
      await readJson(path.join(directory, 'locales/en-US.json')),
    ).toMatchObject({
      messages: {
        [runtimeMessageId('src/provider.ts', '保存')]: 'Save',
      },
    });
    const batchId = vi.mocked(translator).mock.calls[0]![0].batchId;
    expect(batchId).toEqual(expect.any(String));
    expect(
      reportBatchEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.batchId === batchId)
        .map((event) => event.stage),
    ).toEqual(['scheduled', 'state-applied', 'persisted']);
    expect(
      reportBatchEvent.mock.calls.every(
        ([event]) => event.logging === path.resolve('/workspace/logs'),
      ),
    ).toBe(true);

    const extractedFile = extractedPath(directory, 'src/provider.ts');
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

    await updateTestTranslationMemory(directory, (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'Store';
    });
    const memoryFile = await firstTranslationShard(directory);
    const editedContent = await fs.readFile(memoryFile, 'utf8');
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
        'zh-CN': {
          [runtimeMessageId('src/provider.ts', '保存')]: '保存',
        },
        'en-US': {
          [runtimeMessageId('src/provider.ts', '保存')]: 'Store',
        },
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
        version: 2,
        rules: [{ source: '保存', translations: { 'en-US': 'Keep' } }],
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
        'zh-CN': {
          [runtimeMessageId('src/provider.ts', '保存')]: '保存',
        },
        'en-US': {
          [runtimeMessageId('src/provider.ts', '保存')]: 'Keep',
        },
      },
    });
    expect(
      await readJson(path.join(directory, 'locales/en-US.json')),
    ).toMatchObject({
      messages: {
        [runtimeMessageId('src/provider.ts', '保存')]: 'Keep',
      },
    });
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

async function firstTranslationShard(directory: string): Promise<string> {
  const translations = path.join(directory, 'translations');
  const shard = (await fs.readdir(translations)).find((file) =>
    /^[0-9a-f]{2}\.json$/.test(file),
  );
  if (!shard) throw new Error('translation shard not found');
  return path.join(translations, shard);
}
