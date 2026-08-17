import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileStore } from '../src/file-store';
import { ProjectState } from '../src/project-state';
import {
  createReviewService,
  createReviewSnapshot,
  ReviewProblem,
} from '../src/review-service';

const tempDirs: string[] = [];
const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
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

describe('review service', () => {
  it('creates one review message with automatic values, scopes, and occurrences', () => {
    const state = projectState();
    state.hydrateCache({
      version: 1,
      revision: 1,
      messages: {
        保存: {
          source: '保存',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Save' },
        },
      },
    });
    const snapshot = createReviewSnapshot(
      state.snapshot(),
      {
        version: 2,
        rules: [
          {
            source: '保存',
            files: ['src/main.ts'],
            translations: { 'en-US': 'Save file' },
          },
        ],
      },
      options.sourceLang,
      options.locales,
    );

    expect(snapshot.messages).toEqual([
      {
        message: { source: '保存' },
        translations: { 'en-US': 'Save' },
        overrides: [
          { locale: 'en-US', value: 'Save file', file: 'src/main.ts' },
        ],
        occurrences: [
          {
            sourceFile: 'src/main.ts',
            locations: [{ line: 1, column: 0 }],
          },
          {
            sourceFile: 'src/other.ts',
            locations: [{ line: 2, column: 0 }],
          },
        ],
      },
    ]);
  });

  it('prefers an empty Dev extraction over the matching Build snapshot', async () => {
    const root = await temporaryRoot();
    const state = new ProjectState(root, options);
    state.update('', path.join(root, 'src/main.ts'));
    const store = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
    });
    const service = createReviewService({
      sourceLang: options.sourceLang,
      locales: options.locales,
      ready: async () => {},
      state: () => state,
      store: () => store,
      loadPersistedExtracted: async () => [
        {
          version: 1,
          source: 'src/main.ts',
          messages: [
            {
              id: '旧文案',
              source: '旧文案',
              locations: [{ line: 1, column: 0 }],
            },
          ],
        },
      ],
      persistedCache: () => ({
        version: 1,
        revision: 1,
        messages: {
          旧文案: {
            source: '旧文案',
            sourceLang: 'zh-CN',
            translations: { 'en-US': 'Old text' },
          },
        },
      }),
      runStateTask: async (task) => task(),
      flushPersistence: async () => {},
      notify: () => {},
    });

    await expect(service.snapshot()).resolves.toMatchObject({ messages: [] });
    await store.close();
  });

  it('writes and deletes global and file review values atomically', async () => {
    const root = await temporaryRoot();
    const state = projectState(root);
    const store = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
      cleanupMissingSourceFiles: false,
    });
    state.hydrateCache(await store.load());
    state.hydrateOverrides(await store.loadOverrides());
    const notify = vi.fn();
    const service = createReviewService({
      sourceLang: options.sourceLang,
      locales: options.locales,
      ready: async () => {},
      state: () => state,
      store: () => store,
      runStateTask: async (task) => task(),
      flushPersistence: async () => {},
      notify,
    });

    await expect(
      service.setOverride({
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Save',
      }),
    ).resolves.toMatchObject({ changed: true });
    await expect(
      service.setOverride({
        message: { source: '保存' },
        locale: 'en-US',
        file: 'src/main.ts',
        value: 'Save file',
      }),
    ).resolves.toMatchObject({ changed: true });

    expect((await service.snapshot()).messages[0]?.overrides).toEqual([
      { locale: 'en-US', value: 'Save' },
      { locale: 'en-US', value: 'Save file', file: 'src/main.ts' },
    ]);
    expect(notify).toHaveBeenCalledTimes(2);

    await service.deleteOverride({
      message: { source: '保存' },
      locale: 'en-US',
      file: 'src/main.ts',
    });
    expect((await service.snapshot()).messages[0]?.overrides).toEqual([
      { locale: 'en-US', value: 'Save' },
    ]);
    await store.close();
  });

  it('rejects stale files, unknown locales, and template token changes', async () => {
    const root = await temporaryRoot();
    const state = projectState(root, '你好 {{0}}');
    const store = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
      cleanupMissingSourceFiles: false,
    });
    state.hydrateCache(await store.load());
    const service = createReviewService({
      sourceLang: options.sourceLang,
      locales: options.locales,
      ready: async () => {},
      state: () => state,
      store: () => store,
      runStateTask: async (task) => task(),
      flushPersistence: async () => {},
      notify: () => {},
    });

    const base = {
      message: { source: '你好 {{0}}' },
      locale: 'en-US',
      value: 'Hello',
    };
    await expect(service.setOverride(base)).rejects.toMatchObject({
      code: 'TEMPLATE_TOKEN_MISMATCH',
    } satisfies Partial<ReviewProblem>);
    await expect(
      service.setOverride({
        ...base,
        value: 'Hello {{0}}',
        file: 'missing.ts',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_SOURCE_FILE' });
    await expect(
      service.setOverride({ ...base, value: 'Hello {{0}}', locale: 'fr-FR' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_LOCALE' });
    await expect(
      fs.access(path.join(root, 'i18n/overrides.json')),
    ).rejects.toThrow();
    await store.close();
  });
});

function projectState(root = '/workspace', source = '保存') {
  const state = new ProjectState(root, options);
  const id = source;
  state.updateExtracted('', path.join(root, 'src/main.ts'), [
    { id, source, locations: [{ line: 1, column: 0 }] },
  ]);
  state.updateExtracted('', path.join(root, 'src/other.ts'), [
    { id, source, locations: [{ line: 2, column: 0 }] },
  ]);
  return state;
}

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-review-'));
  tempDirs.push(root);
  return root;
}
