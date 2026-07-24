import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer, type UserConfig } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src';
import { buildOutputItems } from './build-output';

const tempDirs: string[] = [];
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
];
const aliases = {
  '@ai-i18n/core': path.resolve('packages/core/src/index.ts'),
  '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Locale Lazy', () => {
  it('validates and normalizes locale loading configuration', () => {
    const base = { sourceLang: 'zh-CN', locales };
    expect(() =>
      aiI18n({
        ...base,
        loading: { strategy: 'locale', preload: ['missing'] },
      }),
    ).toThrow('unknown locale "missing"');
    expect(() =>
      aiI18n({
        ...base,
        loading: { strategy: 'locale', prefetch: ['zh-CN'] },
      }),
    ).toThrow('source locale "zh-CN"');
    expect(() =>
      aiI18n({
        ...base,
        loading: {
          strategy: 'locale',
          preload: ['en-US'],
          prefetch: ['en-US'],
        },
      }),
    ).toThrow('both preloaded and prefetched');
    expect(() =>
      aiI18n({
        ...base,
        defaultLang: 'en-US',
        loading: { strategy: 'locale', prefetch: ['en-US'] },
      }),
    ).toThrow('both preloaded and prefetched');
  });

  it('builds one hashed chunk per target locale and injects final base URLs', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'index.html',
      '<main id="app"></main><script type="module" src="/src/main.ts"></script>',
    );
    await write(
      root,
      'src/main.ts',
      `import { t, setLang } from 'virtual:ai-i18n'
globalThis.text = t('保存')
globalThis.changeLanguage = setLang`,
    );

    const output = await buildFixture(root, {
      base: '/docs/',
      plugin: {
        loading: {
          strategy: 'locale',
          preload: ['en-US', 'en-US'],
          prefetch: ['ja-JP'],
        },
      },
    });
    const items = buildOutputItems(output);
    const chunks = items.filter((item) => item.type === 'chunk');
    const entry = chunks.find((chunk) => chunk.isEntry)!;
    const english = chunks.find((chunk) => chunk.code.includes('Save'))!;
    const japanese = chunks.find((chunk) => chunk.code.includes('保存する'))!;
    const html = assetSource(items, 'index.html');
    expect(english.fileName).toMatch(/^assets\/en-US-[\w-]+\.js$/);
    expect(japanese.fileName).toMatch(/^assets\/ja-JP-[\w-]+\.js$/);
    expect(entry.code).not.toContain('Save');
    expect(entry.code).not.toContain('保存する');
    expect(english.code).toContain('Save');
    expect(english.code).toContain('保存');
    expect(english.code).not.toContain('保存する');
    expect(japanese.code).toContain('保存する');
    expect(html).toContain(
      `rel="modulepreload" href="/docs/${english.fileName}"`,
    );
    expect(html.match(/data-ai-i18n-locale="en-US"/g)).toHaveLength(1);
    expect(html).toContain(`rel="prefetch" href="/docs/${japanese.fileName}"`);
  });

  it('keeps HTML on source fallback while a target default loads', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'index.html',
      `<title>t('首页')</title><script type="module" src="/src/main.ts"></script>`,
    );
    await write(root, 'src/main.ts', 'console.log("ready")');

    const output = await buildFixture(root, {
      plugin: {
        defaultLang: 'en-US',
        html: true,
        loading: { strategy: 'locale' },
      },
    });
    const items = buildOutputItems(output);
    const html = assetSource(items, 'index.html');
    const english = items.find(
      (item) => item.type === 'chunk' && item.code.includes('Home'),
    );

    expect(html).toContain('>首页</title>');
    expect(html).not.toContain('>Home</title>');
    expect(html).toContain('rel="modulepreload"');
    expect(english?.type).toBe('chunk');
  });

  it('emits no resource hint for fully lazy target locales', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'index.html',
      '<script type="module" src="/src/main.ts"></script>',
    );
    await write(
      root,
      'src/main.ts',
      `import { t } from 'virtual:ai-i18n'; console.log(t('保存'))`,
    );

    const output = await buildFixture(root, {
      plugin: { loading: { strategy: 'locale' } },
    });
    const items = buildOutputItems(output);
    const html = assetSource(items, 'index.html');

    expect(html).not.toContain('data-ai-i18n-locale');
    expect(
      items.filter(
        (item) =>
          item.type === 'chunk' &&
          /^assets\/(?:en-US|ja-JP)-/.test(item.fileName),
      ),
    ).toHaveLength(2);
  });

  it('uses relative hints and complete locale data for multiple HTML entries', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'index.html',
      `<title>t('首页')</title><script type="module" src="/src/main.ts"></script>`,
    );
    await write(
      root,
      'admin.html',
      `<title>t('管理')</title><script type="module" src="/src/admin.ts"></script>`,
    );
    await write(root, 'src/main.ts', `console.log('main')`);
    await write(root, 'src/admin.ts', `console.log('admin')`);

    const output = await buildFixture(root, {
      base: './',
      plugin: {
        html: true,
        loading: { strategy: 'locale', preload: ['en-US'] },
      },
      build: {
        rollupOptions: {
          input: {
            index: path.join(root, 'index.html'),
            admin: path.join(root, 'admin.html'),
          },
        },
      },
    });
    const items = buildOutputItems(output);
    const english = items.find(
      (item) =>
        item.type === 'chunk' &&
        item.code.includes('Home') &&
        item.code.includes('Admin'),
    );
    const htmlAssets = items.filter(
      (item) => item.type === 'asset' && item.fileName.endsWith('.html'),
    );

    expect(english?.type).toBe('chunk');
    for (const html of htmlAssets) {
      if (html.type !== 'asset') throw new TypeError('Expected HTML asset');
      expect(String(html.source)).toContain(
        `rel="modulepreload" href="./${english!.fileName}"`,
      );
    }
  });

  it('preloads a Dev wrapper without freezing partial locale data', async () => {
    const root = await fixtureRoot();
    const source = `<title>t('首页')</title><script type="module" src="/src/main.ts"></script><main></main>`;
    await write(root, 'index.html', source);
    await write(
      root,
      'src/main.ts',
      `import { t } from 'virtual:ai-i18n'; console.log(t('保存'))`,
    );
    const server = await createServer({
      root,
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      resolve: { alias: aliases },
      plugins: [
        aiI18n({
          ...pluginOptions(),
          html: true,
          loading: { strategy: 'locale', preload: ['en-US'] },
          provider: { debounceMs: 0 },
        }),
      ],
    });

    try {
      const html = await server.transformIndexHtml('/index.html', source);
      const englishWrapper = await server.transformRequest(
        '/@ai-i18n/locale/en-US.js',
      );
      expect(englishWrapper?.code).toContain(
        'import("/@id/__x00__virtual:ai-i18n/locale/en-US")',
      );
      expect(englishWrapper?.code).not.toContain('"首页":"Home"');

      await server.transformRequest('/src/main.ts');
      await vi.waitFor(async () => {
        const locale = await readJson<{
          messages: Record<string, string | null>;
        }>(path.join(root, 'i18n/locales/en-US.json'));
        expect(locale.messages.保存).toBe('Save');
      });
      await vi.waitFor(async () => {
        const locale = await readJson<{
          messages: Record<string, string | null>;
        }>(path.join(root, 'i18n/locales/en-US.json'));
        expect(locale.messages.首页).toBe('Home');
      });
      const englishData = await server.transformRequest(
        'virtual:ai-i18n/locale/en-US',
      );

      expect(html).toContain(
        'rel="modulepreload" href="/@ai-i18n/locale/en-US.js"',
      );
      expect(html).toContain('data-ai-i18n-text=');
      expect(html).toContain('>首页</title>');
      expect(html).not.toContain('ja-JP');
      expect(englishData?.code).toContain('"首页":"Home"');
      expect(englishData?.code).toContain('"保存":"Save"');
    } finally {
      await server.close();
    }
  });
});

function pluginOptions(): AiI18nOptions {
  const translator: Translator = async (requests) =>
    requests.map((request) => ({
      messageId: request.messageId,
      locale: request.locale,
      value:
        request.locale === 'en-US'
          ? request.source === '首页'
            ? 'Home'
            : request.source === '管理'
              ? 'Admin'
              : 'Save'
          : request.source === '保存'
            ? '保存する'
            : `JA:${request.source}`,
    }));
  return { sourceLang: 'zh-CN', locales, translator };
}

async function buildFixture(
  root: string,
  options: {
    base?: string;
    plugin?: Partial<AiI18nOptions>;
    build?: UserConfig['build'];
  },
) {
  return build({
    root,
    base: options.base,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: aliases },
    plugins: [aiI18n({ ...pluginOptions(), ...options.plugin })],
    build: { write: false, ...options.build },
  });
}

async function fixtureRoot() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-locale-lazy-')),
  );
  tempDirs.push(root);
  return root;
}

async function write(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
}

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
}

function assetSource(
  items: ReturnType<typeof buildOutputItems>,
  fileName: string,
): string {
  const item = items.find(
    (output) => output.type === 'asset' && output.fileName === fileName,
  );
  return item?.type === 'asset' ? String(item.source) : '';
}
