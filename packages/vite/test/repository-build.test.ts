import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { aiI18n } from '../src/plugin.js';

test('builds global and file locale assets from a full repository catalog', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-build-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="/src/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(root, 'src', 'main.ts'),
      `import { t } from 'virtual:ai-i18n'; document.body.textContent = t('首页'); import('./lazy').then((module) => module.show());`,
    );
    await fs.writeFile(
      path.join(root, 'src', 'lazy.ts'),
      `import { t } from 'virtual:ai-i18n'; export const show = () => t('保存', { scope: 'file' });`,
    );
    await build({
      root,
      base: './',
      configFile: false,
      logLevel: 'error',
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          adapter: async (catalog) => ({
            'en-US': Object.fromEntries(
              catalog.messages.map((message) => [
                message.key,
                message.scope === 'file'
                  ? 'Save here'
                  : message.source === '首页'
                    ? 'Home'
                    : 'Save',
              ]),
            ),
          }),
        }),
      ],
      build: {
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: {
            entryFileNames: 'scripts/nested/[name]-[hash].js',
            chunkFileNames: 'scripts/nested/[name]-[hash].js',
          },
        },
      },
    });
    const locales = path.join(root, 'i18n', 'locales');
    expect(
      JSON.parse(await fs.readFile(path.join(locales, 'en-US.json'), 'utf8')),
    ).toMatchObject({ 首页: 'Home' });
    const manifest = JSON.parse(
      await fs.readFile(path.join(locales, 'files', 'manifest.json'), 'utf8'),
    ) as Record<string, string>;
    expect(Object.keys(manifest)).toHaveLength(1);
    const [fileId, group] = Object.entries(manifest)[0]!;
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(locales, 'files', 'en-US', `${group}.json`),
          'utf8',
        ),
      ),
    ).toEqual({ [`f:${fileId}:保存`]: 'Save here' });
    await fs.access(
      path.join(root, 'dist', 'locales', 'files', 'en-US', `${group}.json`),
    );
    const assets = await fs.readdir(
      path.join(root, 'dist', 'scripts', 'nested'),
    );
    const chunks = await Promise.all(
      assets.map((name) =>
        fs.readFile(path.join(root, 'dist', 'scripts', 'nested', name), 'utf8'),
      ),
    );
    expect(chunks.join('\n')).toContain(
      'new URL("../../locales/files/", import.meta.url).href',
    );
    await fs.access(
      path.join(root, 'node_modules', '.cache', 'ai-i18n', 'extracted.sqlite'),
    );
    await build({
      root,
      configFile: false,
      logLevel: 'error',
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
        }),
      ],
      build: { outDir: 'dist', minify: false },
    });
    expect(
      JSON.parse(await fs.readFile(path.join(locales, 'en-US.json'), 'utf8')),
    ).toEqual({});
    const nextManifest = JSON.parse(
      await fs.readFile(path.join(locales, 'files', 'manifest.json'), 'utf8'),
    ) as Record<string, string>;
    const nextGroup = nextManifest[fileId]!;
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(locales, 'files', 'en-US', `${nextGroup}.json`),
          'utf8',
        ),
      ),
    ).toEqual({});
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('keeps legacy translations when a later bundle hook fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-fail-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="/src/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(root, 'src', 'main.ts'),
      "import { t } from 'virtual:ai-i18n'; document.body.textContent = t('首页');",
    );
    const legacy = path.join(root, 'i18n', 'translations', 'keep.json');
    await fs.mkdir(path.dirname(legacy), { recursive: true });
    await fs.writeFile(legacy, '{}');
    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        resolve: {
          alias: {
            '@ai-i18n/vite/runtime': path.resolve(
              'packages/vite/src/runtime.ts',
            ),
          },
        },
        plugins: [
          aiI18n({
            sourceLang: 'zh-CN',
            locales: [
              { value: 'zh-CN', label: '中文' },
              { value: 'en-US', label: 'English' },
            ],
          }),
          {
            name: 'fail-after-ai-i18n',
            generateBundle: {
              order: 'post',
              handler() {
                throw new Error('later bundle hook failed');
              },
            },
          },
        ],
        build: { outDir: 'dist' },
      }),
    ).rejects.toThrow('later bundle hook failed');
    await fs.access(legacy);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('builds both global and file-scoped HTML translations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-html-build-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    await fs.writeFile(
      path.join(root, 'index.html'),
      `<p>t('保存')</p><p>t('保存', { scope: 'file' })</p><script type="module" src="/main.ts"></script>`,
    );
    await fs.writeFile(path.join(root, 'main.ts'), 'export {};');
    await build({
      root,
      configFile: false,
      logLevel: 'error',
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          adapter: async (catalog) => ({
            'en-US': Object.fromEntries(
              catalog.messages.map((message) => [
                message.key,
                message.scope === 'file' ? 'Save here' : 'Save',
              ]),
            ),
          }),
        }),
      ],
      build: { outDir: 'dist', minify: false },
    });
    const locales = path.join(root, 'i18n/locales');
    const global = JSON.parse(
      await fs.readFile(path.join(locales, 'en-US.json'), 'utf8'),
    );
    expect(global['保存']).toBe('Save');
    const manifest = JSON.parse(
      await fs.readFile(path.join(locales, 'files/manifest.json'), 'utf8'),
    ) as Record<string, string>;
    const { fileId } = await import('../src/repository-paths.js');
    const id = fileId(root, path.join(root, 'index.html'));
    expect(manifest[id]).toBeDefined();
    const scoped = JSON.parse(
      await fs.readFile(
        path.join(locales, 'files/en-US', `${manifest[id]}.json`),
        'utf8',
      ),
    );
    expect(scoped[`f:${id}:保存`]).toBe('Save here');
    const assets = path.join(root, 'dist/assets');
    const chunks = await Promise.all(
      (await fs.readdir(assets))
        .filter((name) => name.endsWith('.js'))
        .map((name) => fs.readFile(path.join(assets, name), 'utf8')),
    );
    const output = chunks.join('\n');
    expect(output).toContain('__loadFile');
    expect(output).toMatch(/["']?scope["']?\s*:\s*["']file["']/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
