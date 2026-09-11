import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimeMessageId } from '@ai-i18n/core';
import { transactTranslationOverrides } from '@ai-i18n/core/translation-memory';
import { describe, expect, it, vi } from 'vitest';
import { extractedPath } from '../src/file-store-paths';
import { objectHandler, setupPlugin } from './plugin-test-utils';
import {
  firstTranslationShard,
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

async function setup() {
  const fixture = setupPlugin();
  await fixture.transform(
    "import { t } from 'virtual:ai-i18n'; t('保存')",
    '/workspace/src/race.ts',
  );
  const extracted = extractedPath(fixture.directory, 'src/race.ts');
  await vi.waitFor(async () => {
    await expect(fs.stat(extracted)).resolves.toBeDefined();
  });
  const handler = objectHandler<
    (
      this: unknown,
      options: {
        type: 'create' | 'update' | 'delete';
        file: string;
        timestamp: number;
        modules: unknown[];
        read: () => Promise<string>;
      },
    ) => Promise<unknown[] | undefined>
  >(fixture.plugin.hotUpdate);
  return {
    ...fixture,
    extracted,
    update: (
      file: string,
      type: 'create' | 'update' | 'delete',
      read = () => fs.readFile(file, 'utf8'),
    ) =>
      handler.call(
        { environment: { name: 'client' } },
        { type, file, timestamp: 1, modules: [], read },
      ),
  };
}

describe('managed file hot update read races', () => {
  it.each([
    ['translations', 'create'],
    ['translations', 'update'],
    ['overrides', 'create'],
    ['overrides', 'update'],
  ] as const)(
    'ignores a vanished %s journal on %s until a shard changes',
    async (area, type) => {
      const { directory, hotSend, update } = await setup();
      await updateTestTranslationMemory(directory, (memory) => {
        memory.messages['保存']!.translations['en-US'] = 'Save';
      });
      const journal = path.join(directory, area, '.transaction.json');
      await expect(fs.stat(journal)).rejects.toMatchObject({ code: 'ENOENT' });
      // 不依赖 watcher 调度时机：直接重放已排队、但文件已消失的事件。
      const read = vi.fn(() => fs.readFile(journal, 'utf8'));
      hotSend.mockClear();
      await expect(update(journal, type, read)).resolves.toEqual([]);
      expect(read).not.toHaveBeenCalled();
      expect(hotSend).not.toHaveBeenCalled();
      await expect(
        update(await firstTranslationShard(directory), 'update'),
      ).resolves.toEqual([]);
      expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
        moduleId: 'src/race.ts',
        messages: expect.objectContaining({
          'en-US': expect.objectContaining({
            [runtimeMessageId('src/race.ts', '保存')]: 'Save',
          }),
        }),
      });
    },
  );

  it.each(['create', 'update'] as const)(
    'restores an active generated file that disappears during a %s read',
    async (type) => {
      const { extracted, hotSend, update } = await setup();
      const read = vi.fn(async () => {
        await fs.rm(extracted);
        return fs.readFile(extracted, 'utf8');
      });
      await expect(update(extracted, type, read)).resolves.toEqual([]);
      const restored = await fs.readFile(extracted, 'utf8');
      expect(restored).toContain('src/race.ts');
      hotSend.mockClear();
      await expect(update(extracted, 'update')).resolves.toEqual([]);
      expect(hotSend).not.toHaveBeenCalled();
    },
  );

  it('propagates a shard deletion instead of dropping the stale update', async () => {
    const { directory, hotSend, update } = await setup();
    await updateTestTranslationMemory(directory, (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'Save';
    });
    const shard = await firstTranslationShard(directory);
    await update(shard, 'update');
    hotSend.mockClear();
    await fs.rm(shard);
    await expect(update(shard, 'update')).resolves.toEqual([]);
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/race.ts',
      messages: expect.objectContaining({
        'en-US': expect.objectContaining({
          [runtimeMessageId('src/race.ts', '保存')]: null,
        }),
      }),
    });
  });

  it('keeps a pending journal intact until a real shard event invokes storage recovery', async () => {
    const { directory, hotSend, update } = await setup();
    const memory = await readTestTranslationMemory(directory);
    memory.messages['保存']!.translations['en-US'] = 'Recovered';
    const journal = path.join(directory, 'translations/.transaction.json');
    const content = JSON.stringify(memory);
    await fs.writeFile(journal, content);
    await expect(update(journal, 'create')).resolves.toEqual([]);
    expect(await fs.readFile(journal, 'utf8')).toBe(content);
    hotSend.mockClear();
    await update(await firstTranslationShard(directory), 'update');
    await expect(fs.stat(journal)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
      moduleId: 'src/race.ts',
      messages: expect.objectContaining({
        'en-US': expect.objectContaining({
          [runtimeMessageId('src/race.ts', '保存')]: 'Recovered',
        }),
      }),
    });
  });

  it('propagates override shard creation and deletion after ignoring its journal', async () => {
    const { directory, hotSend, update } = await setup();
    const overrides = path.join(directory, 'overrides');
    await transactTranslationOverrides(overrides, (draft) => {
      draft.rules = [{ source: '保存', translations: { 'en-US': 'Keep' } }];
    });
    const journal = path.join(overrides, '.transaction.json');
    await update(journal, 'delete');
    const relative = (await fs.readdir(overrides, { recursive: true })).find(
      (file) => file.endsWith('.json'),
    )!;
    const shard = path.join(overrides, relative);
    for (const [type, value] of [
      ['create', 'Keep'],
      ['delete', null],
    ] as const) {
      if (type === 'delete') await fs.rm(shard);
      hotSend.mockClear();
      await expect(update(shard, type)).resolves.toEqual([]);
      expect(hotSend).toHaveBeenCalledWith('ai-i18n:update', {
        moduleId: 'src/race.ts',
        messages: expect.objectContaining({
          'en-US': expect.objectContaining({
            [runtimeMessageId('src/race.ts', '保存')]: value,
          }),
        }),
      });
    }
  });

  it('preserves non-ENOENT read errors and allows later events', async () => {
    const { extracted, update } = await setup();
    const error = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });
    await expect(
      update(extracted, 'update', async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(update(extracted, 'update')).resolves.toEqual([]);
  });
});
