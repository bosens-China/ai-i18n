import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { build, createServer } from 'vite';
import { sqlite } from '@ai-i18n/sqlite';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';
import { aiI18n } from '../src/index';
import { aiI18nPluginApi } from '../src/plugin-api';
import { FileStore } from '../src/file-store';
import { ProjectState } from '../src/project-state';
import { createReviewService } from '../src/review-service';

const roots: string[] = [];
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];
const target = { sourceLang: 'zh-CN', targetLang: 'en-US', source: '保存' };
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-cache-reuse-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(
    path.join(root, 'src/main.ts'),
    "import {t} from 'virtual:ai-i18n'; console.log(t('保存'));",
  );
  const dataDirectory = path.join(root, 'data');
  return { root, dataDirectory };
}

for (const mode of ['dev', 'build'] as const) {
  for (const kind of [
    'unique',
    'conflict',
    'reviewed',
    'without-provider',
  ] as const) {
    test(`${mode}: fills unique cache before Provider and leaves ${kind} decisions correct`, async () => {
      const { root, dataDirectory } = await fixture();
      const origin = path.join(root, 'origin');
      await fs.mkdir(origin);
      const cache = await sqlite({ dataDirectory }).open(origin);
      await cache.sync([
        {
          ...target,
          value: 'Cached',
          kind: kind === 'reviewed' ? 'reviewed' : 'automatic',
        },
        ...(kind === 'conflict'
          ? [
              {
                ...target,
                value: 'Other',
                kind: 'reviewed' as const,
                file: 'src/a.ts',
              },
            ]
          : []),
      ]);
      cache.close();
      const translator = vi.fn(
        async ({ messages }: { messages: ReadonlyArray<{ source: string }> }) =>
          messages.map(() => ({ 'en-US': 'Provider' })),
      );
      const plugin = aiI18n({
        sourceLang: 'zh-CN',
        locales,
        dts: false,
        translationMemory: { cache: sqlite({ dataDirectory }) },
        ...(kind === 'without-provider'
          ? {}
          : { provider: { translator, debounceMs: 0 } }),
      });
      const config = {
        root,
        configFile: false as const,
        logLevel: 'silent' as const,
        plugins: [plugin],
        resolve: {
          alias: {
            '@ai-i18n/core': path.resolve('packages/core/src/index.ts'),
            '@ai-i18n/vite/runtime': path.resolve(
              'packages/vite/src/runtime.ts',
            ),
          },
        },
      };
      if (mode === 'build') {
        await build({
          ...config,
          build: {
            write: false,
            lib: { entry: path.join(root, 'src/main.ts'), formats: ['es'] },
          },
        });
      } else {
        const server = await createServer({
          ...config,
          server: { middlewareMode: true, watch: null },
          optimizeDeps: { noDiscovery: true },
        });
        try {
          await server.transformRequest('/src/main.ts');
          await aiI18nPluginApi(plugin)!.flushProvider();
        } finally {
          await server.close();
        }
      }
      expect(translator).toHaveBeenCalledTimes(
        kind === 'unique' || kind === 'without-provider' ? 0 : 1,
      );
      const store = await openTranslationMemoryStore(path.join(root, 'i18n'));
      try {
        expect(
          (await store.load()).messages['保存']!.translations['en-US'],
        ).toBe(
          kind === 'unique' || kind === 'without-provider'
            ? 'Cached'
            : 'Provider',
        );
      } finally {
        store.close();
      }
    });
  }
}

test('review can load suggestions and adopt one with occurrence scope without changing automatic translation', async () => {
  const { root, dataDirectory } = await fixture();
  const origin = path.join(root, 'origin');
  await fs.mkdir(origin);
  const cache = await sqlite({ dataDirectory }).open(origin);
  await cache.sync([{ ...target, value: 'Reviewed', kind: 'reviewed' }]);
  cache.close();
  const options = { sourceLang: 'zh-CN', defaultLang: 'zh-CN', locales };
  const state = new ProjectState(root, options);
  state.update(
    "import {t} from 'virtual:ai-i18n'; t('保存');",
    path.join(root, 'src/main.ts'),
  );
  const store = new FileStore({
    root,
    ...options,
    translationMemory: { cache: sqlite({ dataDirectory }) },
  });
  try {
    state.hydrateCache(await store.sync(state.snapshot()));
    const service = createReviewService({
      ...options,
      ready: async () => {},
      state: () => state,
      store: () => store,
      runStateTask: async (task) => task(),
      flushPersistence: async () => {},
      notify: () => {},
    });
    const snapshot = await service.snapshot();
    expect(snapshot.messages[0]!.cacheCandidatesEnabled).toBe(true);
    const suggestions = await service.candidates!({
      message: { source: '保存' },
      locale: 'en-US',
    });
    expect(suggestions.candidates[0]!.value).toBe('Reviewed');
    const location = snapshot.messages[0]!.occurrences[0]!.locations[0]!;
    await service.setOverride({
      message: { source: '保存' },
      locale: 'en-US',
      file: 'src/main.ts',
      location,
      value: suggestions.candidates[0]!.value,
    });
    const result = await service.snapshot();
    expect(result.messages[0]!.translations['en-US']).toBeNull();
    expect(result.messages[0]!.overrides).toEqual([
      { locale: 'en-US', file: 'src/main.ts', location, value: 'Reviewed' },
    ]);
    expect(
      (
        await service.candidates!({
          message: { source: '保存' },
          locale: 'en-US',
        })
      ).candidates[0]!.sources.some(
        (source) => source.location?.column === location.column,
      ),
    ).toBe(true);
  } finally {
    await store.close();
  }
});
