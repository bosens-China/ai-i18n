import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CacheFileV1 } from '@ai-i18n/core';
import { afterEach, describe, expect, it } from 'vitest';
import { aiI18n } from '../src';
import { FileStore } from '../src/file-store';
import { stableJson } from '../src/json-files';
import {
  ProjectState,
  type NormalizedAiI18nOptions,
} from '../src/project-state';

const tempDirs: string[] = [];
const options: NormalizedAiI18nOptions = {
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

describe('Cache capacity', () => {
  it('validates positive integer limits', () => {
    const base = { sourceLang: options.sourceLang, locales: options.locales };
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => aiI18n({ ...base, cache: { maxMessages: value } })).toThrow(
        'cache.maxMessages must be a positive integer',
      );
      expect(() => aiI18n({ ...base, cache: { maxBytes: value } })).toThrow(
        'cache.maxBytes must be a positive integer',
      );
    }
    expect(() => aiI18n({ ...base, cache: {} })).not.toThrow();
  });

  it('keeps inactive Translation Memory when capacity is omitted', async () => {
    const { cache } = await prepareCache(['active', 'history-a'], ['active']);

    expect(messageIds(cache)).toEqual(['active', 'history-a']);
  });

  it('enforces maxMessages with stable message ID eviction', async () => {
    const { root, state } = await prepareCache(
      ['active', 'history-c', 'history-a', 'history-b'],
      ['active'],
    );
    const store = capacityStore(root, { maxMessages: 2 });
    const result = await store.sync(state.snapshot());
    const content = await fs.readFile(
      path.join(root, 'i18n/cache.json'),
      'utf8',
    );

    expect(messageIds(result)).toEqual(['active', 'history-c']);
    await store.sync(state.snapshot());
    expect(await fs.readFile(path.join(root, 'i18n/cache.json'), 'utf8')).toBe(
      content,
    );
  });

  it('enforces maxBytes against stable UTF-8 serialization', async () => {
    const { root, state, cache } = await prepareCache(
      ['active', 'history-a', 'history-b'],
      ['active'],
    );
    const expected = structuredClone(cache);
    delete expected.messages['history-a'];
    const maxBytes = byteLength(expected);

    const result = await capacityStore(root, { maxBytes }).sync(
      state.snapshot(),
    );

    expect(messageIds(result)).toEqual(['active', 'history-b']);
    expect(byteLength(result)).toBeLessThanOrEqual(maxBytes);
  });

  it('satisfies maxMessages and maxBytes together', async () => {
    const { root, state, cache } = await prepareCache(
      ['active', 'history-a', 'history-b', 'history-c'],
      ['active'],
    );
    const expected = structuredClone(cache);
    delete expected.messages['history-a'];
    delete expected.messages['history-b'];
    const maxBytes = byteLength(expected);

    const result = await capacityStore(root, {
      maxMessages: 2,
      maxBytes,
    }).sync(state.snapshot());

    expect(messageIds(result)).toEqual(['active', 'history-c']);
    expect(Object.keys(result.messages)).toHaveLength(2);
    expect(byteLength(result)).toBeLessThanOrEqual(maxBytes);
  });

  it('preserves active messages and warns when they exceed a limit', async () => {
    const { root, state } = await prepareCache(
      ['active-a', 'active-b', 'history-a'],
      ['active-a', 'active-b'],
    );
    const warnings: string[] = [];

    const result = await capacityStore(
      root,
      { maxMessages: 1, maxBytes: 1 },
      warnings,
    ).sync(state.snapshot());

    expect(messageIds(result)).toEqual(['active-a', 'active-b']);
    expect(warnings).toEqual([
      expect.stringMatching(/2\/1 messages, \d+\/1 bytes/),
    ]);
  });

  it('lets orphan cleanup remove all inactive messages first', async () => {
    const { root, state } = await prepareCache(
      ['active', 'history-a', 'history-b'],
      ['active'],
    );
    const result = await capacityStore(
      root,
      { maxMessages: 100 },
      [],
      true,
    ).sync(state.snapshot());

    expect(messageIds(result)).toEqual(['active']);
  });

  it('keeps missing source records protected when cleanup is disabled', async () => {
    const { root, state } = await prepareCache(
      ['active', 'history-a'],
      ['active'],
      false,
    );
    const warnings: string[] = [];
    const result = await capacityStore(
      root,
      { maxMessages: 1 },
      warnings,
      false,
      false,
    ).sync(state.snapshot());

    expect(messageIds(result)).toEqual(['active', 'history-a']);
    expect(warnings).toHaveLength(1);
  });

  it('merges Agent and Git edits before pruning inactive history', async () => {
    const { root, state, cache } = await prepareCache(
      ['active', 'history-a', 'history-b'],
      ['active'],
    );
    const cachePath = path.join(root, 'i18n/cache.json');
    cache.messages['history-b']!.translations['en-US'] = 'Git history';
    await fs.writeFile(cachePath, stableJson(cache));

    const extractedPath = path.join(root, 'i18n/extracted/src/active.ts.json');
    const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
      messages: Array<{ translations: Record<string, string | null> }>;
    };
    extracted.messages[0]!.translations['en-US'] = 'Agent active';
    await fs.writeFile(extractedPath, stableJson(extracted));

    const result = await capacityStore(root, { maxMessages: 2 }).sync(
      state.snapshot(),
    );

    expect(messageIds(result)).toEqual(['active', 'history-b']);
    expect(result.messages['active']?.translations['en-US']).toBe(
      'Agent active',
    );
    expect(result.messages['history-b']?.translations['en-US']).toBe(
      'Git history',
    );
  });
});

async function prepareCache(
  messages: readonly string[],
  activeMessages: readonly string[],
  cleanupMissingSourceFiles = true,
) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-cache-capacity-')),
  );
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'));
  const state = new ProjectState(root, options);
  const store = capacityStore(
    root,
    undefined,
    [],
    false,
    cleanupMissingSourceFiles,
  );

  for (const message of messages) {
    const source = path.join(root, 'src', `${message}.ts`);
    const code = `import { t } from 'virtual:ai-i18n'; t('${message}')`;
    await fs.writeFile(source, code);
    state.update(code, source);
  }
  await store.sync(state.snapshot());

  const active = new Set(activeMessages);
  for (const message of messages) {
    if (active.has(message)) continue;
    const source = path.join(root, 'src', `${message}.ts`);
    await fs.rm(source);
    state.remove(source);
  }
  const cache = await store.sync(state.snapshot());
  return { root, state, cache };
}

function capacityStore(
  root: string,
  cache?: { maxMessages?: number; maxBytes?: number },
  warnings: string[] = [],
  cleanupOrphanMessages = false,
  cleanupMissingSourceFiles = true,
) {
  return new FileStore({
    root,
    sourceLang: options.sourceLang,
    locales: options.locales,
    cleanupOrphanMessages,
    cleanupMissingSourceFiles,
    ...(cache ? { cache } : {}),
    onWarning: (message) => warnings.push(message),
  });
}

function messageIds(cache: CacheFileV1): string[] {
  return Object.keys(cache.messages).sort();
}

function byteLength(cache: CacheFileV1): number {
  return Buffer.byteLength(stableJson(cache), 'utf8');
}
