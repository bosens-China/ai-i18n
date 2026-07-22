import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileStore } from '../src/file-store';
import { ProjectState, type NormalizedAiI18nOptions } from '../src/project-state';

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
    tempDirs.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
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
      path.join(root, 'i18n/extracted/src/main.ts.json'),
    );
    const sourceLocale = await readJson(
      path.join(root, 'i18n/locales/zh-CN.json'),
    );
    const targetLocale = await readJson(
      path.join(root, 'i18n/locales/en-US.json'),
    );

    expect(cache).toMatchObject({
      version: 1,
      files: {
        'src/main.ts': {
          fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          messageIds: ['保存'],
        },
      },
      messages: { 保存: { source: '保存', translations: { 'en-US': null } } },
    });
    expect(extracted).toMatchObject({
      version: 1,
      source: 'src/main.ts',
      messages: [{ id: '保存', translations: { 'en-US': null } }],
    });
    expect(sourceLocale).toMatchObject({ messages: { 保存: '保存' } });
    expect(targetLocale).toMatchObject({ messages: { 保存: null } });
    expect(JSON.stringify(cache)).not.toContain(root);
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

    const extractedPath = path.join(
      root,
      'i18n/extracted/src/main.ts.json',
    );
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
      path.join(root, 'i18n/extracted/src/other.ts.json'),
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
    state.hydrateCache(await store.load('src/main.ts'));
    await store.sync(state.snapshot(), 'src/main.ts');
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/other.ts.json')),
    ).toMatchObject({
      messages: [{ translations: { 'en-US': 'Store' } }],
    });

    await fs.rm(main);
    state.remove(main);
    const afterDelete = await store.sync(state.snapshot());
    expect(afterDelete.files).not.toHaveProperty('src/main.ts');
    expect(afterDelete.messages).toHaveProperty('保存');
    await expect(fs.access(extractedPath)).rejects.toMatchObject({ code: 'ENOENT' });

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

  it('adds and removes configured locales without dropping cache history', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());

    const extractedPath = path.join(root, 'i18n/extracted/src/main.ts.json');
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
      const file = path.join(root, 'i18n/extracted', `${source}.json`);
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
    const extractedPath = path.join(
      root,
      'i18n/extracted/src/other.ts.json',
    );
    const extracted = (await readJson(extractedPath)) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    extracted.messages[0]!.translations['en-US'] = 'Cancel';
    await fs.writeFile(extractedPath, `${JSON.stringify(extracted, null, 2)}\n`);

    state.hydrateCache(await store.load());
    const reconciled = await store.sync(state.snapshot());
    expect(reconciled.messages).toMatchObject({
      保存: { translations: { 'en-US': 'Save' } },
      取消: { translations: { 'en-US': 'Cancel' } },
    });
    expect(await readJson(path.join(root, 'i18n/locales/en-US.json'))).toMatchObject({
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

    await Promise.all([
      store.sync(firstSnapshot),
      store.sync(secondSnapshot),
    ]);

    expect(
      await readJson(path.join(root, 'i18n/extracted/src/main.ts.json')),
    ).toMatchObject({ messages: [{ id: '第二' }] });
    expect(await readJson(path.join(root, 'i18n/cache.json'))).toMatchObject({
      files: { 'src/main.ts': { messageIds: ['第二'] } },
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

    expect(cache.files).toHaveProperty('src/unvisited.ts');
    await expect(
      fs.access(path.join(root, 'i18n/extracted/src/unvisited.ts.json')),
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
