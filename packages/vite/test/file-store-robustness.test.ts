import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileStore } from '../src/file-store';
import { listJsonFiles } from '../src/json-files';
import {
  ProjectState,
  type NormalizedAiI18nOptions,
} from '../src/project-state';
import { removeTempDir } from './temp-dir';

const tempDirs: string[] = [];
const options: NormalizedAiI18nOptions = {
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map(removeTempDir));
});

describe('FileStore robustness', () => {
  it('keeps atomic-write temporary and lock files outside the project', async () => {
    const { root, state, store, source } = await setup();
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);

    await expect(store.sync(state.snapshot())).resolves.toBeDefined();
    expect((await fs.readdir(path.join(root, 'i18n'))).sort()).toEqual([
      'extracted',
      'locales',
      'overrides.json',
      'translations.json',
    ]);
  });

  it('skips disappeared extracted files and propagates other read failures', async () => {
    const { root, state, store, source } = await setup();
    const code = "import { t } from 'virtual:ai-i18n'; t('保存')";
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());
    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const originalReadFile = fs.readFile.bind(fs);
    const readFile = vi
      .spyOn(fs, 'readFile')
      .mockImplementation((file, readOptions) => {
        if (path.resolve(String(file)) === extractedPath) {
          return Promise.reject(
            Object.assign(new Error('gone'), { code: 'ENOENT' }),
          );
        }
        return originalReadFile(file, readOptions);
      });
    const warnings: string[] = [];
    const readingStore = createStore(root, warnings);

    await expect(readingStore.sync(state.snapshot())).resolves.toBeDefined();
    expect(warnings).toEqual([
      expect.stringContaining('disappeared while reading'),
    ]);

    readFile.mockImplementation((file, readOptions) => {
      if (path.resolve(String(file)) === extractedPath) {
        return Promise.reject(
          Object.assign(new Error('denied'), { code: 'EACCES' }),
        );
      }
      return originalReadFile(file, readOptions);
    });
    await expect(readingStore.sync(state.snapshot())).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('only accepts and scans flat extracted JSON files', async () => {
    const { root, store } = await setup();
    const directory = path.join(root, 'i18n/extracted');
    const direct = path.join(directory, 'src_a%5Fb.ts.json');
    const nested = path.join(directory, 'src/a_b.ts.json');
    await fs.mkdir(path.dirname(nested), { recursive: true });
    await Promise.all([
      fs.writeFile(direct, '{}'),
      fs.writeFile(nested, '{}'),
      fs.writeFile(path.join(directory, 'ignored.txt'), ''),
    ]);

    expect(store.extractedSource(direct)).toBe('src/a_b.ts');
    expect(store.extractedSource(nested)).toBeUndefined();
    expect(await listJsonFiles(directory)).toEqual([direct]);
  });

  it('keeps source structure when an externally edited extracted file is stale', async () => {
    const warnings: string[] = [];
    const { root, state, source } = await setup();
    const store = createStore(root, warnings);
    const code = `import { t } from 'virtual:ai-i18n';
t('一'); t('二'); t('三'); t('四'); t('五');`;
    await fs.writeFile(source, code);
    state.update(code, source);
    await store.sync(state.snapshot());
    const extractedPath = path.join(root, 'i18n/extracted/src_main.ts.json');
    const extracted = await readJson<{ messages: unknown[] }>(extractedPath);
    extracted.messages = extracted.messages.slice(0, 1);
    await fs.writeFile(
      extractedPath,
      `${JSON.stringify(extracted, null, 2)}\n`,
    );

    await store.sync(state.snapshot(), {
      preferredSources: ['src/main.ts'],
    });

    expect(
      (await readJson<{ messages: unknown[] }>(extractedPath)).messages,
    ).toHaveLength(5);
    expect(warnings).toEqual([expect.stringContaining('is stale')]);
  });
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-files-'));
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'));
  return {
    root,
    source: path.join(root, 'src/main.ts'),
    state: new ProjectState(root, options),
    store: createStore(root),
  };
}

function createStore(root: string, warnings?: string[]): FileStore {
  return new FileStore({
    root,
    sourceLang: options.sourceLang,
    locales: options.locales,
    ...(warnings
      ? { onWarning: (message: string) => warnings.push(message) }
      : {}),
  });
}

async function readJson<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}
