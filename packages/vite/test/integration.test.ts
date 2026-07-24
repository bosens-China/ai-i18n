import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import { aiI18n } from '../src/index';
import { ProjectState } from '../src/project-state';

const tempDirs: string[] = [];
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Vite integration', () => {
  it('extracts only requested modules during dev and grows progressively', async () => {
    const root = await fixtureRoot();
    await write(root, 'src/main.ts', translatedModule('首屏'));
    await write(root, 'src/lazy.ts', translatedModule('动态页面'));
    const server = await createServer({
      root,
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      server: { middlewareMode: true },
      resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
      plugins: [plugin()],
    });

    try {
      await server.transformRequest('/src/main.ts');
      expect(await extractedSources(root)).toEqual(['src/main.ts']);

      await server.transformRequest('/src/lazy.ts');
      expect(await extractedSources(root)).toEqual([
        'src/lazy.ts',
        'src/main.ts',
      ]);
    } finally {
      await server.close();
    }
  });

  it('reuses translation memory after a source file moves', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'index.html',
      '<script type="module" src="/src/main.ts"></script>',
    );
    await write(root, 'src/main.ts', "import './old'");
    await write(root, 'src/old.ts', translatedModule('可移动文案'));
    await buildFixture(root);

    const oldExtracted = path.join(root, 'i18n/extracted/src/old.ts.json');
    const extracted = await readJson<ExtractedFile>(oldExtracted);
    extracted.messages[0]!.translations['en-US'] = 'Moved text';
    await fs.writeFile(oldExtracted, `${JSON.stringify(extracted, null, 2)}\n`);
    await fs.rename(
      path.join(root, 'src/old.ts'),
      path.join(root, 'src/new.ts'),
    );
    await write(root, 'src/main.ts', "import './new'");

    await buildFixture(root);

    const moved = await readJson<ExtractedFile>(
      path.join(root, 'i18n/extracted/src/new.ts.json'),
    );
    const cache = await readJson<CacheFile>(path.join(root, 'i18n/cache.json'));
    expect(moved.messages[0]?.translations['en-US']).toBe('Moved text');
    expect(cache.messages['可移动文案']?.translations['en-US']).toBe(
      'Moved text',
    );
    await expect(fs.access(oldExtracted)).rejects.toThrow();
  });

  it('normalizes Windows paths and keeps output relative to a non-cwd root', async () => {
    const windows = new ProjectState('C:\\repo\\apps\\web', {
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
    });
    expect(windows.normalizeId('C:\\repo\\apps\\web\\src\\main.ts')).toBe(
      'src/main.ts',
    );
    expect(windows.normalizeId('D:\\outside\\main.ts')).toBeNull();

    const workspace = await fixtureRoot();
    const root = path.join(workspace, 'apps/web');
    await write(
      root,
      'index.html',
      '<script type="module" src="/src/main.ts"></script>',
    );
    await write(root, 'src/main.ts', translatedModule('子项目'));
    await buildFixture(root);

    const cache = await readJson<CacheFile>(path.join(root, 'i18n/cache.json'));
    expect(Object.keys(cache.files)).toEqual(['src/main.ts']);
    expect(JSON.stringify(cache)).not.toContain(workspace);
  });
});

interface ExtractedFile {
  messages: Array<{ translations: Record<string, string | null> }>;
}

interface CacheFile {
  files: Record<string, unknown>;
  messages: Record<string, { translations: Record<string, string | null> }>;
}

function plugin() {
  return aiI18n({ sourceLang: 'zh-CN', locales });
}

async function fixtureRoot() {
  const created = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-vite-integration-'),
  );
  const root = await fs.realpath(created);
  tempDirs.push(root);
  return root;
}

async function buildFixture(root: string) {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [plugin()],
  });
}

async function write(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
}

function translatedModule(source: string) {
  return `import { t } from 'virtual:ai-i18n'; console.log(t(${JSON.stringify(source)}))`;
}

async function extractedSources(root: string) {
  const directory = path.join(root, 'i18n/extracted/src');
  const files = await fs.readdir(directory);
  const sources = await Promise.all(
    files.map(async (file) => {
      const value = await readJson<{ source: string }>(
        path.join(directory, file),
      );
      return value.source;
    }),
  );
  return sources.sort();
}

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
}
