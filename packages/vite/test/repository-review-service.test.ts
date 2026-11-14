import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { FileStore } from '../src/file-store.js';
import { ProjectState } from '../src/project-state.js';
import { normalizeOptions } from '../src/plugin-utils.js';
import { createRepositoryReviewService } from '../src/repository-review-service.js';
import { fileId } from '../src/repository-paths.js';

test('review edits manual global and explicit file values without changing generated output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-review-'));
  const locales = [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ];
  const state = new ProjectState(
    root,
    normalizeOptions({ repository: true, sourceLang: 'zh-CN', locales }),
  );
  const store = new FileStore({
    root,
    repository: true,
    sourceLang: 'zh-CN',
    locales,
  });
  try {
    const source = 'src/page.ts';
    const id = fileId(root, path.join(root, source));
    await store.repository!.rebuild(
      [
        {
          version: 1,
          source,
          messages: [
            { id: '首页', source: '首页', locations: [{ line: 1, column: 0 }] },
            {
              id: '保存',
              source: '保存',
              scope: 'file',
              locations: [{ line: 2, column: 0 }],
            },
          ],
        },
      ],
      'zh-CN',
      locales.map((locale) => locale.value),
      { [id]: 'abcdef012345' },
      async () => ({
        'en-US': { 首页: 'Home', 保存: 'Save', [`f:${id}:保存`]: 'Save here' },
      }),
    );
    const service = createRepositoryReviewService({
      sourceLang: 'zh-CN',
      locales,
      ready: async () => {},
      state: () => state,
      store: () => store,
      runStateTask: (task) => Promise.resolve().then(task),
    });
    const first = await service.snapshot();
    expect(
      first.messages.find((message) => message.message.source === '保存')
        ?.occurrences[0]?.fileScoped,
    ).toBe(true);
    expect(
      first.messages.find((message) => message.message.source === '保存')
        ?.fileTranslations?.[source]?.['en-US'],
    ).toBe('Save here');
    await service.setOverride({
      message: { source: '保存' },
      locale: 'en-US',
      file: source,
      value: 'Store here',
    });
    const second = await service.snapshot();
    expect(
      second.messages.find((message) => message.message.source === '保存')
        ?.overrides,
    ).toContainEqual({
      locale: 'en-US',
      file: source,
      value: 'Store here',
    });
    await expect(
      service.setOverride({
        message: { source: '首页' },
        locale: 'en-US',
        file: source,
        value: 'Home here',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_MESSAGE' });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, 'i18n', 'locales', 'files', 'en-US.manual.json'),
          'utf8',
        ),
      ),
    ).toEqual({
      [`f:${id}:保存`]: 'Store here',
    });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, 'i18n', 'locales', 'en-US.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ 首页: 'Home' });
  } finally {
    await store.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
