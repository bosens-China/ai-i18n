import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createLogger, createServer } from 'vite';
import { aiI18n } from '../src/index';
import { ProjectState } from '../src/project-state';
import { extractedTestPath } from './extracted-test-path';
import { removeTempDir } from './temp-dir';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

const tempDirs: string[] = [];
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => removeTempDir(directory)),
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
      await expect.poll(() => extractedSources(root)).toEqual(['src/main.ts']);

      await server.transformRequest('/src/lazy.ts');
      await expect
        .poll(() => extractedSources(root))
        .toEqual(['src/lazy.ts', 'src/main.ts']);
    } finally {
      await server.close();
    }
  });

  it('finishes aliased cross-file analysis before the first dev transform returns', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'src/main.ts',
      [
        "import { t } from 'virtual:ai-i18n'",
        "import { messages } from '@/messages'",
        'declare const index: number',
        'console.log(t(messages.status), t(messages.steps[index]))',
      ].join('\n'),
    );
    await write(
      root,
      'src/messages.ts',
      [
        'export const messages = defineI18nMessages({',
        "  status: '跨文件状态',",
        "  steps: ['第一步', '第二步'],",
        '})',
      ].join('\n'),
    );
    const warnings: string[] = [];
    const logger = createLogger('silent');
    logger.warn = (message) => warnings.push(message);
    const server = await createServer({
      root,
      configFile: false,
      appType: 'custom',
      customLogger: logger,
      server: { middlewareMode: true },
      resolve: {
        alias: {
          '@': path.join(root, 'src'),
          '@ai-i18n/vite/runtime': runtimeEntry,
        },
      },
      plugins: [plugin()],
    });

    try {
      const first = await server.transformRequest('/src/main.ts');
      expect(first?.code).toContain('跨文件状态');
      expect(first?.code).toContain('第一步');
      expect(first?.code).toContain('第二步');
      expect(first?.code).toContain('t.__aiI18nAt');
      expect(
        warnings.filter(
          (message) =>
            message.includes('statically extractable') ||
            message.includes('静态提取'),
        ),
      ).toEqual([]);

      await server.transformRequest('/src/messages.ts');
      const cached = await server.transformRequest('/src/main.ts');
      expect(cached?.code).toBe(first?.code);
      await expect
        .poll(() => extractedMessageIds(root, 'src/main.ts'))
        .toEqual(['第一步', '第二步', '跨文件状态']);
    } finally {
      await server.close();
    }
  });

  it('does not recursively wait on cyclic cross-file analysis', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'src/main.ts',
      [
        "import { t } from 'virtual:ai-i18n'",
        "import { childMessage } from './messages'",
        "export const parentMessage = '父级循环文案'",
        'console.log(t(childMessage))',
      ].join('\n'),
    );
    await write(
      root,
      'src/messages.ts',
      [
        "import { t } from 'virtual:ai-i18n'",
        "import { parentMessage } from './main'",
        "export const childMessage = '子级循环文案'",
        'console.log(t(parentMessage))',
      ].join('\n'),
    );
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
      const result = await server.transformRequest('/src/main.ts');
      expect(result?.code).toContain('子级循环文案');
      await expect
        .poll(() => extractedMessageIds(root, 'src/main.ts'))
        .toEqual(['子级循环文案']);
      await expect
        .poll(() => extractedMessageIds(root, 'src/messages.ts'))
        .toEqual(['父级循环文案']);
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

    const oldExtracted = extractedTestPath(root, 'src/old.ts');
    const memoryPath = path.join(root, 'i18n/translations.json');
    await updateTestTranslationMemory(memoryPath, (memory) => {
      memory.messages['可移动文案']!.translations['en-US'] = 'Moved text';
    });
    await fs.rename(
      path.join(root, 'src/old.ts'),
      path.join(root, 'src/new.ts'),
    );
    await write(root, 'src/main.ts', "import './new'");

    await buildFixture(root);

    const moved = await readJson<ExtractedFile>(
      extractedTestPath(root, 'src/new.ts'),
    );
    const cache = await readJson<CacheFile>(
      path.join(root, 'i18n/translations.json'),
    );
    expect(moved.messages[0]?.id).toBe('可移动文案');
    expect(JSON.stringify(moved)).not.toContain('translations');
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

    const cache = await readJson<CacheFile>(
      path.join(root, 'i18n/translations.json'),
    );
    expect(cache).not.toHaveProperty('files');
    expect(JSON.stringify(cache)).not.toContain(workspace);
  });

  it('extracts workspace package source imported outside the Vite root', async () => {
    const workspace = await fixtureRoot();
    const root = path.join(workspace, 'apps/web');
    await write(
      root,
      'index.html',
      '<script type="module" src="/src/main.ts"></script>',
    );
    await write(
      root,
      'src/main.ts',
      "import { uiLabel } from '../../../packages/ui/src/messages'; console.log(uiLabel)",
    );
    await write(
      workspace,
      'packages/ui/src/messages.ts',
      "import { t } from 'virtual:ai-i18n'; export const uiLabel = t('共享 UI')",
    );

    await buildFixture(root);

    const extracted = await readJson<ExtractedFile & { source: string }>(
      extractedTestPath(root, '../../packages/ui/src/messages.ts'),
    );
    expect(extracted.source).toBe('../../packages/ui/src/messages.ts');
    expect(extracted.messages[0]?.id).toBe('共享 UI');
    expect(JSON.stringify(extracted)).not.toContain(workspace);
  });
});

interface ExtractedFile {
  messages: Array<{ id: string }>;
}

interface CacheFile {
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
  const directory = path.join(root, 'i18n/extracted');
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

async function extractedMessageIds(root: string, source: string) {
  const extracted = await readJson<ExtractedFile>(
    extractedTestPath(root, source),
  );
  return extracted.messages.map(({ id }) => id).sort();
}

async function readJson<T>(filename: string): Promise<T> {
  if (filename.endsWith('translations.json')) {
    return (await readTestTranslationMemory(filename)) as T;
  }
  return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
}
