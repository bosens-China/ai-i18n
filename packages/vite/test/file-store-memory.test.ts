import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  TranslationMemoryCandidateCache,
  TranslationMemoryCandidateCacheAdapter,
} from '@ai-i18n/core/translation-memory';
import { afterEach, expect, test, vi } from 'vitest';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';
import { FileStoreMemory } from '../src/file-store-memory';

const roots: string[] = [];
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test('retries opening the optional cache after an initial failure', async () => {
  const directory = await temporaryDirectory();
  const cache = candidateCache();
  const open = vi
    .fn<TranslationMemoryCandidateCacheAdapter['open']>()
    .mockRejectedValueOnce(new Error('temporarily unavailable'))
    .mockResolvedValue(cache);
  const warnings = vi.fn<(message: string) => void>();
  const memory = createMemory(
    directory,
    { cache: 'sqlite', open, list: cache.list },
    warnings,
  );
  try {
    await memory.update();
    await memory.update();
    expect(open).toHaveBeenCalledTimes(2);
    expect(cache.sync).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveBeenCalledTimes(1);
  } finally {
    await memory.close();
  }
});

test('serializes SQLite synchronization for the same project', async () => {
  const directory = await temporaryDirectory();
  let enterFirst!: () => void;
  let releaseFirst!: () => void;
  const firstEntered = new Promise<void>((resolve) => (enterFirst = resolve));
  const firstReleased = new Promise<void>(
    (resolve) => (releaseFirst = resolve),
  );
  let syncCount = 0;
  const cache = candidateCache(async () => {
    if (++syncCount === 1) {
      enterFirst();
      await firstReleased;
    }
  });
  const adapter: TranslationMemoryCandidateCacheAdapter = {
    cache: 'sqlite',
    list: cache.list,
    open: async () => cache,
  };
  const first = createMemory(directory, adapter);
  const second = createMemory(directory, adapter);
  try {
    const firstUpdate = first.update();
    await firstEntered;
    const secondUpdate = second.update();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(syncCount).toBe(1);
    releaseFirst();
    await Promise.all([firstUpdate, secondUpdate]);
    expect(syncCount).toBe(2);
  } finally {
    releaseFirst();
    await Promise.all([first.close(), second.close()]);
  }
});

function candidateCache(
  sync: () => Promise<void> = async () => undefined,
): TranslationMemoryCandidateCache {
  return {
    list: async () => ({ candidates: [], hasMore: false }),
    sync: vi.fn(sync),
    findUnique: async (targets) => targets.map(() => undefined),
    close: () => undefined,
  };
}

function createMemory(
  directory: string,
  adapter: TranslationMemoryCandidateCacheAdapter,
  onWarning?: (message: string) => void,
) {
  return new FileStoreMemory(
    directory,
    {
      root: path.dirname(directory),
      sourceLang: 'zh-CN',
      locales,
      translationMemory: { cache: adapter },
      onWarning,
    },
    () => undefined,
  );
}

async function temporaryDirectory(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-memory-'));
  roots.push(root);
  const directory = path.join(root, 'i18n');
  await fs.mkdir(directory);
  return directory;
}

test('does not persist a cache candidate that loses template tokens', async () => {
  const directory = await temporaryDirectory();
  const source = '你好 {{0}}';
  const store = await openTranslationMemoryStore(directory);
  await store.transact((memory) => {
    memory.messages[source] = {
      source,
      sourceLang: 'zh-CN',
      translations: { 'en-US': null },
    };
  });
  store.close();
  const cache = candidateCache();
  cache.findUnique = async () => ['Hello'];
  const memory = createMemory(directory, {
    cache: 'sqlite',
    list: cache.list,
    open: async () => cache,
  });
  try {
    expect(
      (await memory.update()).messages[source]!.translations['en-US'],
    ).toBeNull();
  } finally {
    await memory.close();
  }
});
