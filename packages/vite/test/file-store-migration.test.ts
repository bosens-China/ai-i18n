import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStore } from '../src/file-store';
import { mergeProjectMessages } from '../src/file-store-merge';
import {
  ProjectState,
  type NormalizedAiI18nOptions,
} from '../src/project-state';
import { extractedTestPath } from './extracted-test-path';
import { options, readJson, setup } from './file-store-test-utils';

describe('FileStore migrations', () => {
  it('adds and removes configured locales without dropping cache history', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());

    const extractedPath = extractedTestPath(root, 'src/main.ts');
    const memoryPath = path.join(root, 'i18n/translations.json');
    const edited = (await readJson(memoryPath)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    edited.messages['保存']!.translations['en-US'] = 'Save';
    await fs.writeFile(memoryPath, `${JSON.stringify(edited, null, 2)}\n`);

    const addedOptions: NormalizedAiI18nOptions = {
      ...options,
      locales: [...options.locales, { value: 'ja-JP', label: '日本語' }],
    };
    const addedState = new ProjectState(root, addedOptions);
    addedState.hydrateCache(
      await new FileStore({
        root,
        sourceLang: addedOptions.sourceLang,
        locales: addedOptions.locales,
      }).load(),
    );
    addedState.update(code, source);
    const addedStore = new FileStore({
      root,
      sourceLang: addedOptions.sourceLang,
      locales: addedOptions.locales,
    });
    await addedStore.sync(addedState.snapshot());
    expect(await readJson(extractedPath)).toMatchObject({
      version: 1,
      messages: [{ id: '保存' }],
    });

    const removedOptions: NormalizedAiI18nOptions = {
      ...addedOptions,
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'ja-JP', label: '日本語' },
      ],
    };
    const removedStore = new FileStore({
      root,
      sourceLang: removedOptions.sourceLang,
      locales: removedOptions.locales,
    });
    const removedState = new ProjectState(root, removedOptions);
    removedState.hydrateCache(await removedStore.load());
    removedState.update(code, source);
    const cache = await removedStore.sync(removedState.snapshot());
    expect(cache.messages['保存']?.translations).toMatchObject({
      'en-US': 'Save',
      'ja-JP': null,
    });
    expect(await readJson(extractedPath)).toMatchObject({
      version: 1,
      messages: [{ id: '保存' }],
    });
    await expect(
      fs.access(path.join(root, 'i18n/locales/en-US.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reuses translations in reverse after changing the source language', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const chineseCode = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, chineseCode);
    state.update(chineseCode, source);
    await store.sync(state.snapshot());

    const memoryPath = path.join(root, 'i18n/translations.json');
    const memory = (await readJson(memoryPath)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    memory.messages['保存']!.translations['en-US'] = 'Save';
    await fs.writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);
    state.hydrateCache(await store.load());
    await store.sync(state.snapshot());

    const englishOptions: NormalizedAiI18nOptions = {
      sourceLang: 'en-US',
      defaultLang: 'en-US',
      locales: [
        { value: 'en-US', label: 'English' },
        { value: 'zh-CN', label: '中文' },
      ],
    };
    const englishStore = new FileStore({
      root,
      sourceLang: englishOptions.sourceLang,
      locales: englishOptions.locales,
    });
    const englishState = new ProjectState(root, englishOptions);
    englishState.hydrateCache(await englishStore.load());
    const englishCode = "import { t } from 'virtual:ai-i18n'; t('Save')";
    await fs.writeFile(source, englishCode);
    englishState.update(englishCode, source);
    const cache = await englishStore.sync(englishState.snapshot());
    englishState.hydrateCache(cache);

    expect(cache.messages.Save).toMatchObject({
      sourceLang: 'en-US',
      translations: { 'zh-CN': '保存' },
    });
    expect(englishState.registration('src/main.ts')).toMatchObject({
      'zh-CN': { Save: '保存' },
    });
    await expect(
      fs.access(path.join(root, 'i18n/locales/en-US.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('mergeProjectMessages migrations', () => {
  it('migrates translations when the source language changes without changing the message ID', () => {
    const merged = mergeProjectMessages(
      {
        OK: {
          source: 'OK',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Okay', 'ja-JP': 'オーケー' },
        },
      },
      {
        OK: {
          source: 'OK',
          sourceLang: 'en-US',
          translations: {
            'zh-CN': null,
            'ja-JP': '古いスナップショット',
          },
        },
      },
    );

    expect(merged.OK).toEqual({
      source: 'OK',
      sourceLang: 'en-US',
      translations: { 'ja-JP': 'オーケー', 'zh-CN': 'OK' },
    });
  });
});
