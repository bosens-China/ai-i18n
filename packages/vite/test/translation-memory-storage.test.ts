import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TranslationBatchEvent, Translator } from '@ai-i18n/core';
import type { TranslationMemoryCandidateCacheAdapter } from '@ai-i18n/core/translation-memory';
import { listSqliteCandidates, sqlite } from '@ai-i18n/sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '../src';
import { removeTempDir } from './temp-dir';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

const tempDirectories: string[] = [];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => removeTempDir(directory)),
  );
});

describe('Translation Memory Vite storage', () => {
  it('traces one build batch through state application and persistence', async () => {
    const root = await fixture('batch-trace');
    const provider = translator('Save');
    const reportBatchEvent = vi.fn<(event: TranslationBatchEvent) => void>();
    provider.reportBatchEvent = reportBatchEvent;

    await buildProject(root, provider, { logging: true });

    const batchId = vi.mocked(provider).mock.calls[0]![0].batchId;
    expect(batchId).toEqual(expect.any(String));
    const events = reportBatchEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.batchId === batchId);
    expect(events.map((event) => event.stage)).toEqual([
      'scheduled',
      'state-applied',
      'persisted',
    ]);
    // Provider 返回时另一个模块可能尚未完成 Vite 转换，受影响模块数会随时序变化。
    expect(events[1]).toMatchObject({
      resultCount: 1,
      affectedModules: expect.any(Number),
    });
    expect(
      JSON.stringify(await readTestTranslationMemory(path.join(root, 'i18n'))),
    ).not.toContain(batchId as string);
  });

  it('fresh Provider cache replaces history once and reuses the result afterwards', async () => {
    const root = await fixture('fresh');
    const initial = translator('Old');
    await buildProject(root, initial);
    expect(initial).toHaveBeenCalledTimes(1);

    const refreshed = translator('New');
    await buildProject(root, refreshed, { providerCache: 'fresh' });
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages[
        '保存'
      ]?.translations['en-US'],
    ).toBe('New');

    await buildProject(root);
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages[
        '保存'
      ]?.translations['en-US'],
    ).toBe('New');
  });

  it('prunes orphan translations on every Build unless cleanup is disabled', async () => {
    const root = await fixture('build-orphans');
    await buildProject(root, translator('Save'));
    await fs.writeFile(path.join(root, 'src/main.ts'), "import './other';");
    await fs.writeFile(path.join(root, 'src/other.ts'), 'export {};');

    await buildProject(root, undefined, { cleanupOrphans: false });
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages,
    ).toHaveProperty('保存');

    await buildProject(root);
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages,
    ).not.toHaveProperty('保存');
  });

  it('stores SQLite globally and reuses a unique candidate across projects', async () => {
    const workspace = await fixture('sqlite-workspace', false);
    const dataDirectory = path.join(workspace, 'user-data');
    vi.stubEnv('AI_I18N_DATA_DIR', dataDirectory);
    const firstRoot = path.join(workspace, 'first');
    const secondRoot = path.join(workspace, 'second');
    await createSources(firstRoot);
    await createSources(secondRoot);

    const provider = translator('Save');
    await buildProject(firstRoot, provider, { cache: sqlite() });
    expect(provider).toHaveBeenCalledTimes(1);
    await buildProject(secondRoot, undefined, { cache: sqlite() });

    expect(
      (await readTestTranslationMemory(path.join(secondRoot, 'i18n'))).messages[
        '保存'
      ]?.translations['en-US'],
    ).toBe('Save');
    await expect(
      fs.access(path.join(firstRoot, 'i18n/translations')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(firstRoot, 'i18n/storage.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(dataDirectory, 'translation-memory.sqlite')),
    ).resolves.toBeUndefined();
  });

  it('stops suggesting replaced or cleared values while retaining orphans', async () => {
    const root = await fixture('sqlite-lifecycle');
    const dataDirectory = path.join(root, 'user-data');
    const cache = sqlite({ dataDirectory });
    const target = { source: '保存', sourceLang: 'zh-CN', targetLang: 'en-US' };
    await buildProject(root, translator('Old'), { cache });

    await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'New';
    });
    await buildProject(root, undefined, { cache });
    await expect(
      listSqliteCandidates(target, { dataDirectory }),
    ).resolves.toMatchObject({ candidates: [{ value: 'New' }] });

    await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
      memory.messages['保存']!.translations['en-US'] = null;
    });
    await buildProject(root, undefined, { cache });
    await expect(
      listSqliteCandidates(target, { dataDirectory }),
    ).resolves.toMatchObject({ candidates: [] });
    await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
      memory.messages['保存']!.translations['en-US'] = 'New';
    });
    await buildProject(root, undefined, { cache });

    await fs.writeFile(path.join(root, 'src/main.ts'), "import './other';");
    await fs.writeFile(path.join(root, 'src/other.ts'), 'export {};');
    await buildProject(root, undefined, { cache });
    await expect(
      listSqliteCandidates(target, { dataDirectory }),
    ).resolves.toMatchObject({ candidates: [{ value: 'New' }] });

    await buildProject(root, undefined, {
      cache: sqlite({ dataDirectory, pruneOrphans: true }),
    });
    await expect(
      listSqliteCandidates(target, { dataDirectory }),
    ).resolves.toMatchObject({ candidates: [] });
  });

  it('keeps an Agent write made while a fresh Provider request is in flight', async () => {
    const root = await fixture('fresh-concurrent-write');
    await buildProject(root, translator('Old'));
    const provider = vi.fn<Translator>(async ({ messages }) => {
      await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
        memory.messages['保存']!.translations['en-US'] = 'Agent';
      });
      return messages.map(() => ({ 'en-US': 'Stale Provider' }));
    });
    await buildProject(root, provider, { providerCache: 'fresh' });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages[
        '保存'
      ]!.translations['en-US'],
    ).toBe('Agent');
  });
});

function translator(value: string) {
  return vi.fn<Translator>(async ({ messages }) =>
    messages.map(() => ({ 'en-US': value })),
  );
}

async function buildProject(
  root: string,
  provider?: Translator,
  options?: {
    cache?: TranslationMemoryCandidateCacheAdapter;
    providerCache?: 'reuse' | 'fresh';
    logging?: boolean | string;
    cleanupOrphans?: boolean;
  },
): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [
      aiI18n({
        sourceLang: 'zh-CN',
        locales,
        ...(provider
          ? {
              provider: {
                translator: provider,
                ...(options?.logging === undefined
                  ? {}
                  : { logging: options.logging }),
                ...(options?.providerCache
                  ? { cache: options.providerCache }
                  : {}),
              },
            }
          : {}),
        ...(options?.cache
          ? { translationMemory: { cache: options.cache } }
          : {}),
        ...(options?.cleanupOrphans === undefined
          ? {}
          : { cleanup: { orphanMessages: options.cleanupOrphans } }),
      }),
    ],
  });
}

async function fixture(name: string, sources = true): Promise<string> {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), `ai-i18n-${name}-`)),
  );
  tempDirectories.push(root);
  if (sources) await createSources(root);
  return root;
}

async function createSources(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<script type="module" src="/src/main.ts"></script>',
  );
  await fs.writeFile(
    path.join(root, 'src/main.ts'),
    "import './other'; import { t } from 'virtual:ai-i18n'; console.log(t('保存'));",
  );
  await fs.writeFile(
    path.join(root, 'src/other.ts'),
    "import { t } from 'virtual:ai-i18n'; console.log(t('保存'));",
  );
}
