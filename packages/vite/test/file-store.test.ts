import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStore } from '../src/file-store';
import { ProjectState } from '../src/project-state';
import { extractedTestPath } from './extracted-test-path';
import { options, readJson, setup } from './file-store-test-utils';

describe('FileStore', () => {
  it('writes deterministic memory, extracted and locale files', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);

    await store.sync(state.snapshot());

    const cache = await readJson(path.join(root, 'i18n/translations.json'));
    const extracted = await readJson(extractedTestPath(root, 'src/main.ts'));
    const targetLocale = await readJson(
      path.join(root, 'i18n/locales/en-US.json'),
    );
    const overrides = await readJson(path.join(root, 'i18n/overrides.json'));

    expect(cache).toMatchObject({
      version: 1,
      revision: 1,
      messages: {
        保存: {
          source: '保存',
          sourceLang: 'zh-CN',
          translations: { 'en-US': null },
        },
      },
    });
    expect(cache).not.toHaveProperty('files');
    expect(extracted).toMatchObject({
      version: 1,
      source: 'src/main.ts',
      messages: [{ id: '保存' }],
    });
    expect(JSON.stringify(extracted)).not.toContain('translations');
    await expect(
      fs.access(path.join(root, 'i18n/locales/zh-CN.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(targetLocale).toMatchObject({ messages: { 保存: null } });
    expect(overrides).toEqual({ version: 1, messages: {} });
    expect(JSON.stringify(cache)).not.toContain(root);
  });

  it('generates locales with default and exact human overrides', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    await fs.writeFile(source, '');
    state.updateExtracted('', source, [
      {
        id: '提交#Git 操作',
        source: '提交',
        comment: 'Git 操作',
        locations: [{ line: 1, column: 0 }],
      },
      {
        id: '提交',
        source: '提交',
        locations: [{ line: 2, column: 0 }],
      },
    ]);
    await store.sync(state.snapshot());
    await fs.writeFile(
      path.join(root, 'i18n/overrides.json'),
      `${JSON.stringify(
        {
          version: 1,
          messages: {
            提交: {
              default: { 'en-US': 'Submit' },
              byId: { '提交#Git 操作': { 'en-US': 'Commit' } },
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await store.sync(state.snapshot());

    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: {
        '提交#Git 操作': 'Commit',
        提交: 'Submit',
      },
    });
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

  it('creates a new untranslated message when comments change', async () => {
    const { root, state, store } = await setup();
    const source = path.join(root, 'src/main.ts');
    const oldCode =
      "import { t } from 'virtual:ai-i18n'; t('保存', { comment: '旧注释' })";
    await fs.writeFile(source, oldCode);
    state.update(oldCode, source);
    await store.sync(state.snapshot());

    const cachePath = path.join(root, 'i18n/translations.json');
    const cache = (await readJson(cachePath)) as {
      messages: Record<string, unknown>;
    };
    const message = cache.messages['保存#旧注释'] as {
      translations: Record<string, string | null>;
    };
    message.translations['en-US'] = 'Save';
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

    const next = new ProjectState(root, options);
    const newCode =
      "import { t } from 'virtual:ai-i18n'; t('保存', { comment: '新注释' })";
    await fs.writeFile(source, newCode);
    next.update(newCode, source);
    await store.sync(next.snapshot());

    expect(
      await readJson(extractedTestPath(root, 'src/main.ts')),
    ).toMatchObject({
      messages: [
        {
          id: '保存#新注释',
          comment: '新注释',
        },
      ],
    });
    expect(
      (await readJson(cachePath)) as Record<string, unknown>,
    ).toMatchObject({
      messages: {
        '保存#旧注释': { translations: { 'en-US': 'Save' } },
        '保存#新注释': { translations: { 'en-US': null } },
      },
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
    ).toEqual([
      'd84392fab7ca2aff860cb5efb245cfe78ef2f66af8d504dd6dd616ac02836d8d.json',
      'eb7041468cb32feadbbbcf82b6cf05326b26c717d315fc2a4cef3eaa16b0aaed.json',
    ]);
    expect(extractedTestPath(root, 'src\\a_b.ts')).toBe(
      extractedTestPath(root, 'src/a_b.ts'),
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
    const memoryPath = path.join(root, 'i18n/translations.json');
    const edited = (await readJson(memoryPath)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    edited.messages['保存']!.translations['en-US'] = 'Save';
    await fs.writeFile(memoryPath, `${JSON.stringify(edited, null, 2)}\n`);

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
    expect(targetLocale).toMatchObject({ messages: { 保存: 'Save' } });

    const changed = (await readJson(memoryPath)) as {
      messages: Record<string, { translations: Record<string, string | null> }>;
    };
    changed.messages['保存']!.translations['en-US'] = 'Store';
    await fs.writeFile(memoryPath, `${JSON.stringify(changed, null, 2)}\n`);
    // 人工审校值即使遇到旧的 Vite 内存快照也必须优先。
    await store.sync(state.snapshot());
    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: { 保存: 'Store' },
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
      messages: { 保存: null },
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
    expect(
      await readJson(path.join(root, 'i18n/translations.json')),
    ).toMatchObject({
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
