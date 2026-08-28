import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimeMessageId } from '@ai-i18n/core';
import { describe, expect, it } from 'vitest';
import { FileStore } from '../src/file-store';
import { ProjectState } from '../src/project-state';
import { extractedTestPath } from './extracted-test-path';
import { options, readJson, setup } from './file-store-test-utils';
import { updateTestTranslationMemory } from './translation-memory-test-utils';

describe('FileStore sync', () => {
  it('updates only dirty extracted sources while preserving unvisited locale messages', async () => {
    const { root, state, store } = await setup();
    const main = path.join(root, 'src/main.ts');
    const lazy = path.join(root, 'src/lazy.ts');
    await fs.writeFile(main, '');
    await fs.writeFile(lazy, '');
    state.updateExtracted('', main, [
      { id: '保存', source: '保存', locations: [{ line: 1, column: 0 }] },
    ]);
    state.updateExtracted('', lazy, [
      {
        id: '稍后加载',
        source: '稍后加载',
        locations: [{ line: 1, column: 0 }],
      },
    ]);
    await store.sync(state.snapshot());

    state.updateExtracted('changed', main, [
      { id: '提交', source: '提交', locations: [{ line: 1, column: 0 }] },
    ]);
    await store.sync(state.snapshot(), { changedSources: ['src/main.ts'] });

    const locale = await readJson(path.join(root, 'i18n/locales/en-US.json'));
    expect(locale).toMatchObject({
      messages: {
        [runtimeMessageId('src/main.ts', '提交')]: null,
        [runtimeMessageId('src/lazy.ts', '稍后加载')]: null,
      },
    });
    expect(locale).not.toHaveProperty(
      `messages.${runtimeMessageId('src/main.ts', '保存')}`,
    );
  });

  it('removes a dirty source without deleting unrelated locale messages', async () => {
    const { root, state, store } = await setup();
    const main = path.join(root, 'src/main.ts');
    const lazy = path.join(root, 'src/lazy.ts');
    await fs.writeFile(main, '');
    await fs.writeFile(lazy, '');
    state.updateExtracted('', main, [
      { id: '保存', source: '保存', locations: [{ line: 1, column: 0 }] },
    ]);
    state.updateExtracted('', lazy, [
      {
        id: '稍后加载',
        source: '稍后加载',
        locations: [{ line: 1, column: 0 }],
      },
    ]);
    await store.sync(state.snapshot());

    state.remove(main);
    await store.sync(state.snapshot(), { changedSources: ['src/main.ts'] });

    await expect(
      fs.access(extractedTestPath(root, 'src/main.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const locale = await readJson(path.join(root, 'i18n/locales/en-US.json'));
    expect(locale).toMatchObject({
      messages: {
        [runtimeMessageId('src/lazy.ts', '稍后加载')]: null,
      },
    });
    expect(locale).not.toHaveProperty(
      `messages.${runtimeMessageId('src/main.ts', '保存')}`,
    );
  });

  it('merges memory edits, synchronizes duplicate IDs and preserves history', async () => {
    const { root, state, store } = await setup();
    const main = path.join(root, 'src/main.ts');
    const other = path.join(root, 'src/other.ts');
    const mainCode = "import { t } from 'virtual:ai-i18n'; t('保存')";
    const otherCode = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(main, mainCode);
    await fs.writeFile(other, otherCode);
    state.update(mainCode, main);
    await store.sync(state.snapshot());

    const extractedPath = extractedTestPath(root, 'src/main.ts');
    const memoryPath = path.join(root, 'i18n');
    await updateTestTranslationMemory(memoryPath, (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'Save';
    });

    state.update(otherCode, other);
    const cache = await store.sync(state.snapshot());
    state.hydrateCache(cache);
    await store.sync(state.snapshot());

    const otherExtracted = await readJson(
      extractedTestPath(root, 'src/other.ts'),
    );
    const targetLocale = await readJson(
      path.join(root, 'i18n/locales/en-US.json'),
    );
    expect(otherExtracted).toMatchObject({
      messages: [{ id: '保存' }],
    });
    expect(JSON.stringify(otherExtracted)).not.toContain('translations');
    expect(targetLocale).toMatchObject({
      messages: {
        [runtimeMessageId('src/main.ts', '保存')]: 'Save',
        [runtimeMessageId('src/other.ts', '保存')]: 'Save',
      },
    });

    await updateTestTranslationMemory(memoryPath, (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'Store';
    });
    // 人工校对值即使遇到旧的 Vite 内存快照也必须优先。
    await store.sync(state.snapshot());
    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: {
        [runtimeMessageId('src/main.ts', '保存')]: 'Store',
        [runtimeMessageId('src/other.ts', '保存')]: 'Store',
      },
    });

    await fs.rm(main);
    state.remove(main);
    const afterDelete = await store.sync(state.snapshot());
    expect(afterDelete).not.toHaveProperty('files');
    expect(afterDelete.messages).toHaveProperty('保存');
    await expect(fs.access(extractedPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await fs.rm(other);
    state.remove(other);
    const pruningStore = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
      cleanupOrphanMessages: true,
    });
    const pruned = await pruningStore.sync(state.snapshot());
    expect(pruned.messages).not.toHaveProperty('保存');

    state.hydrateCache(pruned);
    await fs.writeFile(other, otherCode);
    state.update(otherCode, other);
    expect(state.registration('src/other.ts')).toMatchObject({
      'en-US': { [runtimeMessageId('src/other.ts', '保存')]: null },
    });
  });

  it('restores derived locale files from translation memory', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());

    const localePath = path.join(root, 'i18n/locales/en-US.json');
    const locale = (await readJson(localePath)) as {
      messages: Record<string, string | null>;
    };
    locale.messages['保存'] = 'Save';
    await fs.writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`);

    const loadOptions = await store.loadOptions([localePath]);
    state.hydrateCache(await store.load());
    const cache = await store.sync(state.snapshot(), loadOptions);

    expect(cache.messages['保存']).toMatchObject({
      sourceLang: 'zh-CN',
      translations: { 'en-US': null },
    });
    expect(await readJson(localePath)).toMatchObject({
      messages: { [runtimeMessageId('src/main.ts', '保存')]: null },
    });
  });

  it('serializes concurrent snapshots in call order', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const first = "import { t } from 'virtual:ai-i18n'; t('第一')";
    const second = "import { t } from 'virtual:ai-i18n'; t('第二')";
    await fs.writeFile(source, second);
    state.update(first, source);
    const firstSnapshot = state.snapshot();
    state.update(second, source);
    const secondSnapshot = state.snapshot();

    await Promise.all([store.sync(firstSnapshot), store.sync(secondSnapshot)]);

    expect(
      await readJson(extractedTestPath(root, 'src/main.ts')),
    ).toMatchObject({ messages: [{ id: '第二' }] });
    expect(await readJson(path.join(root, 'i18n'))).toMatchObject({
      messages: { 第一: expect.any(Object), 第二: expect.any(Object) },
    });
  });

  it('preserves existing source records that a build did not visit', async () => {
    const { root, state, store } = await setup();
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    for (const source of ['src/main.ts', 'src/unvisited.ts']) {
      const file = path.join(root, source);
      await fs.writeFile(file, code);
      state.update(code, file);
    }
    await store.sync(state.snapshot());

    const freshBuild = new ProjectState(root, options);
    freshBuild.hydrateCache(await store.load());
    freshBuild.update(code, path.join(root, 'src/main.ts'));
    const cache = await store.sync(freshBuild.snapshot());

    expect(cache.messages).toHaveProperty('保存');
    expect(cache).not.toHaveProperty('files');
    await expect(
      fs.access(extractedTestPath(root, 'src/unvisited.ts')),
    ).resolves.toBeUndefined();
  });
});
