import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { createHotUpdateHandler } from '../src/hot-update';
import { createBuildWatchState } from '../src/build-watch';
import { isInternalStoreFile } from '../src/file-store-paths';
import { setup } from './file-store-test-utils';

const internalFiles = [
  'translations/.transaction.json',
  'overrides/.transaction.json',
  'translations/.transaction.json.tmp-1234567890abcdef',
  'overrides/.transaction.json.tmp-1234567890abcdef',
  'translations/en-US/a.json.tmp-1234567890abcdef',
  'overrides/en-US/a.json.tmp-1234567890abcdef',
  'extracted/source.json.tmp-1234567890abcdef',
  'locales/en-US.json.tmp-1234567890abcdef',
];

describe('internal storage file watch filtering', () => {
  it('does not enqueue, read, flush or reconcile repeated internal Dev events', async () => {
    const { state, store } = await setup();
    const flushPersistence = vi.fn(async () => {});
    const runStateTask = vi.fn();
    const getState = vi.fn(() => state);
    const sendTranslationUpdates = vi.fn();
    const handler = createHotUpdateHandler({
      sourcePattern: /\.ts$/,
      ready: async () => {},
      state: getState,
      store: () => store,
      framework: () => 'vanilla',
      autoImport: () => false,
      translationHooks: () => [],
      localeLoading: false,
      sendTranslationUpdates,
      sendLocaleUpdates: vi.fn(),
      requestMissingTranslations: vi.fn(),
      flushPersistence,
      runStateTask: async (task) => {
        runStateTask();
        return task();
      },
    });
    const read = vi.fn(async () => {
      throw new Error('internal files must not be read');
    });
    for (const relative of internalFiles) {
      expect(store.manages(path.join(store.directory, relative))).toBe(false);
      for (const type of ['create', 'update', 'delete', 'update'] as const) {
        await expect(
          handler.call(
            { environment: { name: 'client' } } as ThisParameterType<
              typeof handler
            >,
            {
              type,
              file: path.join(store.directory, relative),
              timestamp: 1,
              modules: [],
              server: {} as ViteDevServer,
              read,
            },
          ),
        ).resolves.toEqual([]);
      }
    }
    expect(read).not.toHaveBeenCalled();
    expect(runStateTask).not.toHaveBeenCalled();
    expect(flushPersistence).not.toHaveBeenCalled();
    expect(getState).not.toHaveBeenCalled();
    expect(sendTranslationUpdates).not.toHaveBeenCalled();
  });

  it('does not register internal Build Watch events for reconciliation', async () => {
    const { state, store } = await setup();
    const read = vi.spyOn(store, 'isOwnFile');
    const sync = vi.spyOn(store, 'sync');
    const load = vi.spyOn(store, 'load');
    const watch = createBuildWatchState({
      sourcePattern: /\.ts$/,
      ready: async () => {},
      state: () => state,
      store: () => store,
      requestMissingTranslations: vi.fn(),
    });
    for (const relative of internalFiles) {
      for (const type of ['create', 'update', 'delete'] as const) {
        await watch.watchChange(path.join(store.directory, relative), type);
      }
    }
    await watch.buildStart(true);
    expect(read).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps real protocol files and same-named business files outside the filter', async () => {
    const { store } = await setup();
    const protocolFiles = [
      'translations/en-US/a.json',
      'overrides/en-US/a.json',
      'extracted/source.json',
      'locales/en-US.json',
    ];
    for (const relative of protocolFiles) {
      const file = path.join(store.directory, relative);
      expect(isInternalStoreFile(store.directory, file)).toBe(false);
      expect(store.manages(file)).toBe(true);
    }
    for (const relative of [
      '../i18n-other/translations/.transaction.json',
      '../src/translations/.transaction.json',
      '../src/main.json.tmp-1234567890abcdef',
      'src/.transaction.json',
      'translations/en-US/.transaction.json',
      'locales/en-US.json.tmp-not-an-atomic-file',
      'translations/en-US/a.json.tmp-1234567890abcdef.ts',
    ]) {
      expect(
        isInternalStoreFile(
          store.directory,
          path.join(store.directory, relative),
        ),
      ).toBe(false);
    }
  });
});
