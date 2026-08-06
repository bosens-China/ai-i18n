import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '../src';
import { removeTempDir } from './temp-dir';
import { readTestTranslationMemory } from './translation-memory-test-utils';

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

  it('stores SQLite globally and reuses a unique candidate across projects', async () => {
    const workspace = await fixture('sqlite-workspace', false);
    const dataDirectory = path.join(workspace, 'user-data');
    vi.stubEnv('AI_I18N_DATA_DIR', dataDirectory);
    const firstRoot = path.join(workspace, 'first');
    const secondRoot = path.join(workspace, 'second');
    await createSources(firstRoot);
    await createSources(secondRoot);

    const provider = translator('Save');
    await buildProject(firstRoot, provider, { storage: 'sqlite' });
    expect(provider).toHaveBeenCalledTimes(1);
    await buildProject(secondRoot, undefined, { storage: 'sqlite' });

    expect(
      (await readTestTranslationMemory(path.join(secondRoot, 'i18n'))).messages[
        '保存'
      ]?.translations['en-US'],
    ).toBe('Save');
    expect(
      JSON.parse(
        await fs.readFile(path.join(firstRoot, 'i18n/storage.json'), 'utf8'),
      ),
    ).toEqual({ version: 1, storage: 'sqlite' });
    await expect(
      fs.access(path.join(firstRoot, 'i18n/translations')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(firstRoot, 'i18n/translations.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(dataDirectory, 'translation-memory.sqlite')),
    ).resolves.toBeUndefined();
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
    storage?: 'json' | 'sqlite';
    providerCache?: 'reuse' | 'fresh';
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
                ...(options?.providerCache
                  ? { cache: options.providerCache }
                  : {}),
              },
            }
          : {}),
        ...(options?.storage
          ? { translationMemory: { storage: options.storage } }
          : {}),
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
