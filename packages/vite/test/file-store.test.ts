import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimeMessageId } from '@ai-i18n/core';
import { describe, expect, it, vi } from 'vitest';
import { FileStore } from '../src/file-store';
import { ProjectState } from '../src/project-state';
import { extractedTestPath } from './extracted-test-path';
import { options, readJson, setup } from './file-store-test-utils';
import { updateTestTranslationMemory } from './translation-memory-test-utils';

describe('FileStore', () => {
  it('does not let a pending persistence trace block a successful sync', async () => {
    const { root, state } = await setup();
    const onSynced = vi.fn(() => new Promise<void>(() => {}));
    const store = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
      onSynced,
    });
    const source = path.join(root, 'src/main.ts');
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    store.markProviderBatch('batch-test');

    await expect(store.sync(state.snapshot())).resolves.toBeDefined();
    expect(onSynced).toHaveBeenCalledWith(['batch-test']);
    await expect(
      fs.access(path.join(root, 'i18n/locales/en-US.json')),
    ).resolves.toBeUndefined();
  });

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
    expect(targetLocale).toMatchObject({
      messages: { [runtimeMessageId('src/main.ts', '保存')]: null },
    });
    expect(overrides).toEqual({ version: 2, rules: [] });
    expect(JSON.stringify(cache)).not.toContain(root);
  });

  it('generates locales with global and exact file human overrides', async () => {
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
          version: 2,
          rules: [
            { source: '提交', translations: { 'en-US': 'Submit' } },
            {
              source: '提交',
              comment: 'Git 操作',
              files: ['src/main.ts'],
              translations: { 'en-US': 'Commit' },
            },
          ],
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
        [runtimeMessageId('src/main.ts', '提交#Git 操作')]: 'Commit',
        [runtimeMessageId('src/main.ts', '提交')]: 'Submit',
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
      messages: {
        [runtimeMessageId('src/main.ts', '保存')]: null,
        [runtimeMessageId('src/lazy.ts', '稍后加载')]: null,
      },
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
    await updateTestTranslationMemory(cachePath, (cache) => {
      cache.messages['保存#旧注释']!.translations['en-US'] = 'Save';
    });

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
});
