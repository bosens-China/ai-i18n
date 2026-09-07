import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from 'vite';
import { createPluginProvider } from '../src/plugin-provider';
import { setup } from './file-store-test-utils';
import { updateTestTranslationMemory } from './translation-memory-test-utils';

async function providerFixture(initial: string | null = null) {
  const fixture = await setup();
  const { root, state, store } = fixture;
  const source = path.join(root, 'src/main.ts');
  const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
  await fs.writeFile(source, code);
  state.update(code, source);
  await store.sync(state.snapshot());
  const memory = await updateTestTranslationMemory(store.directory, (draft) => {
    draft.messages['保存']!.translations['en-US'] = initial;
  });
  state.hydrateCache(memory);
  state.missingTranslations('src/main.ts', { refreshCached: true });
  const results = [{ messageId: '保存', locale: 'en-US', value: 'Provider' }];
  const baseline = state.snapshot().cache;
  state.applyTranslations(results, { replaceCached: true });
  store.markProviderTranslations(results, baseline);
  return fixture;
}

describe('Provider persistence conflicts', () => {
  it('does not let a rejected result authorize a later stale snapshot', async () => {
    const { root, state, store } = await providerFixture('Old');
    await store.sync(state.snapshot());
    // 请求基线仍是 Old，当前值已变化，后到结果必须被拒绝。
    const coordinator = createPluginProvider({
      provider: { translator: async () => [{ 'en-US': 'Rejected' }] },
      providerCache: 'fresh',
      config: {
        root,
        command: 'serve',
        logger: { warn: () => {} },
      } as unknown as ResolvedConfig,
      state: () => state,
      store: () => store,
      runStateTask: async (task) => task(),
      flushPersistence: async () => {},
      localeLoading: false,
      sendTranslationUpdates: () => {},
      sendLocaleUpdates: () => {},
    });
    const request = coordinator.request({
      messageId: '保存',
      source: '保存',
      locales: ['en-US'],
    });
    await coordinator.flush();
    await request;
    expect((await store.load()).messages['保存']!.translations['en-US']).toBe(
      'Provider',
    );
    const intermediate = await updateTestTranslationMemory(
      store.directory,
      (draft) => {
        draft.messages['保存']!.translations['en-US'] = 'Rejected';
      },
    );
    state.hydrateCache(intermediate);
    await updateTestTranslationMemory(store.directory, (draft) => {
      draft.messages['保存']!.translations['en-US'] = 'Provider';
    });
    const cache = await store.sync(state.snapshot());
    expect(cache.messages['保存']!.translations['en-US']).toBe('Provider');
  });

  it('retains an uncommitted refresh after persistence fails', async () => {
    const { state, store } = await providerFixture('Old');
    const journal = path.join(
      store.directory,
      'translations/.transaction.json',
    );
    await fs.mkdir(journal);
    await expect(store.sync(state.snapshot())).rejects.toThrow();
    await fs.rm(journal, { recursive: true });
    const cache = await store.sync(state.snapshot());
    expect(cache.messages['保存']!.translations['en-US']).toBe('Provider');
  });

  it.each([null, 'Old'])(
    'commits against the unchanged %s baseline once',
    async (initial) => {
      const { state, store } = await providerFixture(initial);
      const cache = await store.sync(state.snapshot());
      expect(cache.messages['保存']!.translations['en-US']).toBe('Provider');
      expect((await store.load()).messages['保存']!.translations['en-US']).toBe(
        'Provider',
      );
    },
  );

  it.each([
    [null, 'Agent'],
    ['Old', 'Agent'],
    ['Old', ''],
    ['Old', null],
  ] as const)(
    'preserves a disk change from %s to %s before commit',
    async (initial, external) => {
      const { state, store } = await providerFixture(initial);
      await updateTestTranslationMemory(store.directory, (draft) => {
        draft.messages['保存']!.translations['en-US'] = external;
      });
      const cache = await store.sync(state.snapshot());
      expect(cache.messages['保存']!.translations['en-US']).toBe(external);
      expect((await store.load()).messages['保存']!.translations['en-US']).toBe(
        external,
      );
    },
  );

  it.each(['Agent', '', null])(
    'preserves a later %s edit against an old Provider snapshot',
    async (external) => {
      const { state, store } = await providerFixture('Old');
      await store.sync(state.snapshot());
      await updateTestTranslationMemory(store.directory, (draft) => {
        draft.messages['保存']!.translations['en-US'] = external;
      });
      const cache = await store.sync(state.snapshot());
      expect(cache.messages['保存']!.translations['en-US']).toBe(external);
      expect((await store.load()).messages['保存']!.translations['en-US']).toBe(
        external,
      );
    },
  );
});
