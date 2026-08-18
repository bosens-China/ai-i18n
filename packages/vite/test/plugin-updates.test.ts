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
  objectHandler,
  options,
  readJson,
  setupPlugin,
} from './plugin-test-utils';
import {
  firstTranslationShard,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

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
    expect(transformed?.code).toContain('__registerModule');
    expect(transformed?.code).not.toContain('register?module=');
    expect(translator).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledWith(
      expect.objectContaining({ logging: path.resolve('/workspace/logs') }),
    );

    expect(transformed?.code).toContain(
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

  it('sends an inline registration update on source hot update', async () => {
    const { plugin, transform, hotSend } = setupPlugin();
    await transform(
      "import { t } from 'virtual:ai-i18n'; t('before')",
      '/workspace/src/hot.ts',
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
        file: '/workspace/src/hot.ts',
        timestamp: 1,
        modules: [],
        read: async () => "import { t } from 'virtual:ai-i18n'; t('after')",
      },
    );

    expect(invalidateModule).not.toHaveBeenCalled();
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/hot.ts',
      messages: {
        'zh-CN': { [runtimeMessageId('src/hot.ts', 'after')]: 'after' },
        'en-US': { [runtimeMessageId('src/hot.ts', 'after')]: null },
      },
    });
    expect(result).toBeUndefined();
  });
});
