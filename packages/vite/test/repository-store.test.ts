import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import type { ExtractedFile } from '@ai-i18n/core';
import { transactTranslationOverrides } from '@ai-i18n/core/translation-memory';
import { fileId } from '../src/repository-paths.js';
import { RepositoryStore } from '../src/repository-store.js';
import type { TranslationCatalog } from '../src/translation-adapter.js';

test('rebuilds the local index and final locales without persisting adapter results as manual', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-repo-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    const source = 'src/page.ts';
    const id = fileId(root, path.join(root, source));
    const files: ExtractedFile[] = [
      {
        version: 1,
        source,
        messages: [
          {
            id: '保存',
            source: '保存',
            scope: 'file',
            locations: [{ line: 1, column: 0 }],
          },
        ],
      },
    ];
    const store = new RepositoryStore(root);
    await fs.mkdir(path.join(root, 'i18n', 'translations'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, 'i18n', 'translations', 'old.json'),
      '{}',
    );
    const adapter = vi.fn(async (catalog: TranslationCatalog) => ({
      'en-US': Object.fromEntries(
        catalog.messages.map((message) => [
          message.key,
          message.scope === 'file' ? 'Save here' : 'Save',
        ]),
      ),
    }));
    await store.rebuild(
      files,
      'zh-CN',
      ['zh-CN', 'en-US'],
      { [id]: 'page' },
      adapter,
    );
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0]![0].messages).toHaveLength(2);
    expect(store.loadExtracted()).toEqual(files);
    const locales = path.join(root, 'i18n', 'locales');
    expect(
      JSON.parse(await fs.readFile(path.join(locales, 'en-US.json'), 'utf8')),
    ).toEqual({ 保存: 'Save' });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(locales, 'files', 'en-US', 'page.json'),
          'utf8',
        ),
      ),
    ).toEqual({ [`f:${id}:保存`]: 'Save here' });
    await expect(
      fs.access(path.join(root, 'i18n', 'translations')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await store.rebuild(files, 'zh-CN', ['zh-CN', 'en-US'], { [id]: 'page' });
    expect(
      JSON.parse(await fs.readFile(path.join(locales, 'en-US.json'), 'utf8')),
    ).toEqual({});
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(locales, 'files', 'en-US', 'page.json'),
          'utf8',
        ),
      ),
    ).toEqual({});
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('migration re-reads manual values written after preparation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-migrate-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    const files: ExtractedFile[] = [
      {
        version: 1,
        source: 'src/page.ts',
        messages: [
          {
            id: '保存',
            source: '保存',
            locations: [{ line: 1, column: 0 }],
          },
        ],
      },
    ];
    const directory = path.join(root, 'i18n');
    await transactTranslationOverrides(
      path.join(directory, 'overrides'),
      (draft) => {
        draft.rules.push({
          source: '保存',
          translations: { 'en-US': 'Save' },
        });
      },
    );
    const store = new RepositoryStore(root);
    const prepared = await store.prepare(files, 'zh-CN', ['zh-CN', 'en-US']);
    await fs.mkdir(path.join(directory, 'locales'), { recursive: true });
    await fs.writeFile(
      path.join(directory, 'locales', 'en-US.manual.json'),
      JSON.stringify({ 取消: 'Cancel' }),
    );
    await store.commit(prepared, {});
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, 'locales', 'en-US.manual.json'),
          'utf8',
        ),
      ),
    ).toEqual({ 取消: 'Cancel', 保存: 'Save' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
