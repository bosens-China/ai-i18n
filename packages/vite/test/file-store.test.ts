import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileStore } from '../src/file-store';
import {
  ProjectState,
  type NormalizedAiI18nOptions,
} from '../src/project-state';

const tempDirs: string[] = [];
const options: NormalizedAiI18nOptions = {
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

describe('FileStore', () => {
  it('writes deterministic cache, extracted and locale files', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);

    await store.sync(state.snapshot());

    const cache = await readJson(path.join(root, 'i18n/cache.json'));
    const extracted = await readJson(
      path.join(root, 'i18n/extracted/src_main.ts.json'),
    );
    const targetLocale = await readJson(
      path.join(root, 'i18n/locales/en-US.json'),
    );

    expect(cache).toMatchObject({
      version: 2,
      messages: {
        保存: { sourceLang: 'zh-CN', translations: { 'en-US': null } },
      },
    });
    expect(cache).not.toHaveProperty('files');
    expect(extracted).toMatchObject({
      version: 1,
      source: 'src/main.ts',
      messages: [{ id: '保存', translations: { 'en-US': null } }],
    });
    await expect(
      fs.access(path.join(root, 'i18n/locales/zh-CN.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(targetLocale).toMatchObject({ messages: { 保存: null } });
    expect(JSON.stringify(cache)).not.toContain(root);
  });

  it('rebuilds locales from every active extracted file during partial Dev sync', async () => {
    const { root, state, store } = await setup();
    const sources = [
      ['src/main.ts', '保存'],
      ['src/lazy.ts', '稍后加载'],
    ] as const;
    for (const [relative, message] of sources) {
      const source = path.join(root, relative);
      const code = `import { t } from 'virtual:ai-i18n'; t('${message}')`;
      await fs.writeFile(source, code);
      state.update(code, source);
    }
    await store.sync(state.snapshot());

    const partial = new ProjectState(root, options);
    const [relative, message] = sources[0];
    const source = path.join(root, relative);
    partial.update(
      `import { t } from 'virtual:ai-i18n'; t('${message}')`,
      source,
    );
    await store.sync(partial.snapshot());

    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: { 保存: null, 稍后加载: null },
    });
  });

  it('reuses translations when legacy comment IDs become stable source IDs', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const oldCode = "import { t } from 'virtual:ai-i18n'; t('保存', '旧注释')";
    await fs.writeFile(source, oldCode);
    state.update(oldCode, source);
    await store.sync(state.snapshot());

    const cachePath = path.join(root, 'i18n/cache.json');
    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const cache = (await readJson(cachePath)) as {
      messages: Record<string, unknown>;
    };
    cache.messages['保存#旧注释'] = {
      sourceLang: 'zh-CN',
      comment: '旧注释',
      translations: { 'en-US': 'Save' },
    };
    delete cache.messages['保存'];
    const extracted = (await readJson(extractedPath)) as {
      messages: Array<{
        id: string;
        comment?: string;
        translations: Record<string, string | null>;
      }>;
    };
    extracted.messages[0]!.id = '保存#旧注释';
    extracted.messages[0]!.comment = '旧注释';
    extracted.messages[0]!.translations['en-US'] = 'Save';
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    await fs.writeFile(
      extractedPath,
      `${JSON.stringify(extracted, null, 2)}\n`,
    );

    const next = new ProjectState(root, options);
    const newCode = "import { t } from 'virtual:ai-i18n'; t('保存', '新注释')";
    await fs.writeFile(source, newCode);
    next.update(newCode, source);
    await store.sync(next.snapshot());

    expect(await readJson(extractedPath)).toMatchObject({
      messages: [
        {
          id: '保存',
          comment: '新注释',
          translations: { 'en-US': 'Save' },
        },
      ],
    });
  });

  it('uses flat collision-free extracted filenames', async () => {
    const { root, state, store } = await setup();
    const sources = ['src/a_b.ts', 'src/a/b.ts'];
    for (const [index, relative] of sources.entries()) {
      const source = path.join(root, relative);
      await fs.mkdir(path.dirname(source), { recursive: true });
      const code = `import { t } from 'virtual:ai-i18n'; t('消息${index}')`;
      await fs.writeFile(source, code);
      state.update(code, source);
    }

    await store.sync(state.snapshot());

    expect(
      (await fs.readdir(path.join(root, 'i18n/extracted'))).sort(),
    ).toEqual(['src_a%5Fb.ts.json', 'src_a_b.ts.json']);
  });

  it('merges Agent edits, synchronizes duplicate IDs and preserves history', async () => {
    const { root, state, store } = await setup();
    const main = path.join(root, 'src/main.ts');
    const other = path.join(root, 'src/other.ts');
    const mainCode = "import { t } from 'virtual:ai-i18n'; t('保存')";
    const otherCode = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(main, mainCode);
    await fs.writeFile(other, otherCode);
    state.update(mainCode, main);
    await store.sync(state.snapshot());

    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const edited = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    edited.messages[0]!.translations['en-US'] = 'Save';
    await fs.writeFile(extractedPath, `${JSON.stringify(edited, null, 2)}\n`);

    state.update(otherCode, other);
    const cache = await store.sync(state.snapshot());
    state.hydrateCache(cache);
    await store.sync(state.snapshot());

    const otherExtracted = await readJson(
      path.join(root, 'i18n/extracted/src_other.ts.json'),
    );
    const targetLocale = await readJson(
      path.join(root, 'i18n/locales/en-US.json'),
    );
    expect(otherExtracted).toMatchObject({
      messages: [{ translations: { 'en-US': 'Save' } }],
    });
    expect(targetLocale).toMatchObject({ messages: { 保存: 'Save' } });

    const changed = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    changed.messages[0]!.translations['en-US'] = 'Store';
    await fs.writeFile(extractedPath, `${JSON.stringify(changed, null, 2)}\n`);
    const preferred = { preferredSources: ['src/main.ts'] };
    state.hydrateCache(await store.load(preferred));
    await store.sync(state.snapshot(), preferred);
    expect(
      await readJson(path.join(root, 'i18n/extracted/src_other.ts.json')),
    ).toMatchObject({
      messages: [{ translations: { 'en-US': 'Store' } }],
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
      'en-US': { 保存: null },
    });
  });

  it('restores an explicitly changed locale file without losing metadata', async () => {
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

    const loadOptions = store.loadOptions([localePath]);
    state.hydrateCache(await store.load(loadOptions));
    const cache = await store.sync(state.snapshot(), loadOptions);

    expect(cache.messages['保存']).toMatchObject({
      sourceLang: 'zh-CN',
      translations: { 'en-US': 'Save' },
    });
    expect(
      await readJson(path.join(root, 'i18n/extracted/src_main.ts.json')),
    ).toMatchObject({
      messages: [{ translations: { 'en-US': 'Save' } }],
    });
  });

  it('adds and removes configured locales without dropping cache history', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());

    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const edited = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    edited.messages[0]!.translations['en-US'] = 'Save';
    await fs.writeFile(extractedPath, `${JSON.stringify(edited, null, 2)}\n`);

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
      messages: [{ translations: { 'en-US': 'Save', 'ja-JP': null } }],
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
      messages: [{ translations: { 'ja-JP': null } }],
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

    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const extracted = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    extracted.messages[0]!.translations['en-US'] = 'Save';
    await fs.writeFile(
      extractedPath,
      `${JSON.stringify(extracted, null, 2)}\n`,
    );
    await store.sync(state.snapshot(), {
      preferredSources: ['src/main.ts'],
    });

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

  it('reports every extracted file involved in a translation conflict', async () => {
    const { root, state, store } = await setup();
    const sources = ['src/main.ts', 'src/other.ts'];
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    for (const source of sources) {
      const file = path.join(root, source);
      await fs.writeFile(file, code);
      state.update(code, file);
    }
    await store.sync(state.snapshot());

    for (const [index, source] of sources.entries()) {
      const file = path.join(
        root,
        'i18n/extracted',
        `${source.replace('/', '_')}.json`,
      );
      const extracted = (await readJson(file)) as {
        messages: Array<{ translations: Record<string, string | null> }>;
      };
      extracted.messages[0]!.translations['en-US'] = index ? 'Store' : 'Save';
      await fs.writeFile(file, `${JSON.stringify(extracted, null, 2)}\n`);
    }

    await expect(store.load()).rejects.toThrow(
      /files: i18n\/cache\.json, src\/main\.ts, src\/other\.ts/,
    );
  });

  it('reconciles compatible cache and extracted edits after a Git merge', async () => {
    const { root, state, store } = await setup();
    const files = [
      ['src/main.ts', '保存'],
      ['src/other.ts', '取消'],
    ] as const;
    for (const [source, message] of files) {
      const file = path.join(root, source);
      const code = `import { t } from 'virtual:ai-i18n'; t('${message}')`;
      await fs.writeFile(file, code);
      state.update(code, file);
    }
    await store.sync(state.snapshot());

    // 模拟 Git 合并后：一个分支更新 cache，另一个分支更新 extracted。
    const cachePath = path.join(root, 'i18n/cache.json');
    const cache = (await readJson(cachePath)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    cache.messages['保存']!.translations['en-US'] = 'Save';
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    const extractedPath = path.join(root, 'i18n/extracted/src_other.ts.json');
    const extracted = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    extracted.messages[0]!.translations['en-US'] = 'Cancel';
    await fs.writeFile(
      extractedPath,
      `${JSON.stringify(extracted, null, 2)}\n`,
    );

    state.hydrateCache(await store.load());
    const reconciled = await store.sync(state.snapshot());
    expect(reconciled.messages).toMatchObject({
      保存: { translations: { 'en-US': 'Save' } },
      取消: { translations: { 'en-US': 'Cancel' } },
    });
    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: { 保存: 'Save', 取消: 'Cancel' },
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
      await readJson(path.join(root, 'i18n/extracted/src_main.ts.json')),
    ).toMatchObject({ messages: [{ id: '第二' }] });
    expect(await readJson(path.join(root, 'i18n/cache.json'))).toMatchObject({
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
      fs.access(path.join(root, 'i18n/extracted/src_unvisited.ts.json')),
    ).resolves.toBeUndefined();
  });
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-files-'));
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'));
  return {
    root,
    state: new ProjectState(root, options),
    store: new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
    }),
  };
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}
