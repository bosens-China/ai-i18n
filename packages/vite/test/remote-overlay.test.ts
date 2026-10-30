import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { aiI18n } from '../src/index';
import { ProjectState } from '../src/project-state';
import { FileStore } from '../src/file-store';
import { validateRemoteSnapshot } from '../src/remote-validation';
import { remoteCatalog, remoteContext } from '../src/remote-context';
import { aiI18nPluginApi } from '../src/plugin-api';
import { ensureScan } from '../src/scan-catalog';
import { scanProject } from '../src/scan';
import { options } from './plugin-test-utils';
import { buildOutputItems } from './build-output';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

const roots: string[] = [];
const servers: ViteDevServer[] = [];
const alias = {
  '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
};
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-overlay-')),
  );
  roots.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(
    path.join(root, 'src/main.ts'),
    `import { t } from 'virtual:ai-i18n'; console.log(t('保存')); void import('./lazy');`,
  );
  await fs.writeFile(
    path.join(root, 'src/lazy.ts'),
    `import { t } from 'virtual:ai-i18n'; console.log(t('懒加载'));`,
  );
  await fs.writeFile(
    path.join(root, 'index.html'),
    `<h1>t("页面")</h1><script type="module" src="/src/main.ts"></script>`,
  );
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    for (const source of ['保存', '懒加载', '页面'])
      memory.messages[source] = {
        source,
        sourceLang: 'zh-CN',
        translations: { 'en-US': `LOCAL ${source}` },
      };
  });
  const store = new FileStore({ root, ...options });
  await store.transactOverrides((overrides) => {
    overrides.rules.push({
      source: '保存',
      translations: { 'en-US': 'REVIEWED' },
    });
  });
  await store.close();
  return root;
}

it('resolves remote above human rules, keeps comments/locales separate, and restores local values on withdrawal', () => {
  const project = new ProjectState('/workspace', {
    ...options,
    locales: [...options.locales, { value: 'fr', label: 'French' }],
  });
  project.update(
    `import { t } from 'virtual:ai-i18n'; t('提交', {comment:'表单'}); t('提交', {comment:'Git'}); t('constructor');`,
    '/workspace/src/main.ts',
  );
  const cache = project.snapshot().cache;
  for (const message of Object.values(cache.messages))
    message.translations = { 'en-US': 'LOCAL', fr: 'FR LOCAL' };
  project.hydrateCache(cache);
  project.hydrateOverrides({
    version: 2,
    rules: [
      {
        source: '提交',
        comment: '表单',
        translations: { 'en-US': 'REVIEWED' },
      },
    ],
  });
  const apply = (value: string | null | undefined) =>
    project.hydrateRemoteOverlay(
      validateRemoteSnapshot(
        {
          translations:
            value === undefined
              ? []
              : [
                  {
                    message: { source: '提交', comment: '表单' },
                    locale: 'en-US',
                    value,
                  },
                ],
        },
        remoteContext(
          project,
          'serve',
          remoteCatalog(project),
          new AbortController().signal,
        ),
      ).cache,
    );
  const values = (locale: string) =>
    Object.values(project.registration('src/main.ts')?.[locale] ?? {});
  apply('REMOTE');
  expect(values('en-US')).toEqual(expect.arrayContaining(['REMOTE', 'LOCAL']));
  expect(values('en-US')).not.toContain('REVIEWED');
  expect(new Set(values('fr'))).toEqual(new Set(['FR LOCAL']));
  expect(project.snapshot().cache).toEqual(cache);
  apply('');
  expect(values('en-US')).toContain('');
  for (const value of [null, undefined]) {
    apply(value);
    expect(values('en-US')).toContain('REVIEWED');
    expect(values('en-US')).not.toContain('REMOTE');
  }
  project.reset();
  expect(project.snapshot().remoteOverlay).toBeUndefined();
});

it.each([false, true])(
  'builds merged HTML/modules/locales without persisting the remote layer (loading=%s)',
  async (loading) => {
    const root = await fixture();
    const directory = path.join(root, 'i18n');
    const before = await readTestTranslationMemory(directory);
    const sync = vi.fn(async () => {});
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias },
      plugins: [
        aiI18n({
          ...options,
          defaultLang: 'en-US',
          loading,
          failOnMissingTranslations: true,
          remote: {
            mode: 'overlay',
            load: async () => ({
              translations: [
                {
                  message: { source: '保存' },
                  locale: 'en-US',
                  value: 'REMOTE SAVE',
                },
                {
                  message: { source: '页面' },
                  locale: 'en-US',
                  value: 'REMOTE PAGE',
                },
              ],
            }),
          },
          translationMemory: {
            cache: {
              cache: 'sqlite',
              list: async () => ({ candidates: [], hasMore: false }),
              open: async () => ({
                list: async () => ({ candidates: [], hasMore: false }),
                sync,
                findUnique: async (targets) => targets.map(() => undefined),
                close: () => {},
              }),
            },
          },
        }),
      ],
      build: { write: false },
    });
    const items = buildOutputItems(result);
    const code = items
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
    expect(code).toContain('REMOTE SAVE');
    expect(code).toContain('LOCAL 懒加载');
    expect(code).not.toContain('REVIEWED');
    const html = items.find(
      (item) => item.type === 'asset' && item.fileName === 'index.html',
    );
    expect(html?.type === 'asset' && String(html.source)).toContain(
      loading ? '>页面</h1>' : '>REMOTE PAGE</h1>',
    );
    expect((await readTestTranslationMemory(directory)).messages).toEqual(
      before.messages,
    );
    expect(sync).toHaveBeenCalled();
    expect(JSON.stringify(sync.mock.calls)).not.toContain('REMOTE');
    const locale = JSON.parse(
      await fs.readFile(path.join(directory, 'locales/en-US.json'), 'utf8'),
    );
    expect(Object.values(locale.messages)).toEqual(
      expect.arrayContaining(['REMOTE SAVE', 'REMOTE PAGE', 'LOCAL 懒加载']),
    );
  },
);

it('checks the merged missing gate rather than just remote coverage', async () => {
  const root = await fixture();
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['懒加载']!.translations['en-US'] = null;
  });
  await expect(
    build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias },
      plugins: [
        aiI18n({
          ...options,
          failOnMissingTranslations: true,
          remote: { mode: 'overlay', load: async () => ({ translations: [] }) },
        }),
      ],
      build: { write: false },
    }),
  ).rejects.toThrow(/missing translations/);
});

it('keeps local edits live in Dev, preserves the remote layer during scanning, and skips callbacks in standalone scans', async () => {
  const root = await fixture();
  const load = vi.fn(async () => ({
    translations: [
      { message: { source: '保存' }, locale: 'en-US', value: 'REMOTE' },
    ],
  }));
  const config = {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    resolve: { alias },
  };
  const plugins = () => [
    aiI18n({ ...options, remote: { mode: 'overlay', load } }),
  ];
  expect(
    (await scanProject({ ...config, plugins: plugins() })).translation_source,
  ).toBe('overlay');
  expect(load).not.toHaveBeenCalled();
  const vite = await createServer({
    ...config,
    plugins: plugins(),
    appType: 'custom',
    server: { middlewareMode: true },
  });
  servers.push(vite);
  await vite.transformRequest('/src/main.ts');
  await vite.transformRequest('/src/lazy.ts');
  await expect
    .poll(async () => (await vite.transformRequest('/src/main.ts'))?.code)
    .toContain('REMOTE');
  const api = vite.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
  const calls = load.mock.calls.length;
  expect((await ensureScan(vite, api)).translation_source).toBe('overlay');
  expect(load.mock.calls.length).toBe(calls);
  expect(JSON.stringify(api.state().registration('src/main.ts'))).toContain(
    'REMOTE',
  );
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['懒加载']!.translations['en-US'] = 'LOCAL UPDATED';
  });
  await expect
    .poll(async () => (await vite.transformRequest('/src/lazy.ts'))?.code)
    .toContain('LOCAL UPDATED');
  expect(JSON.stringify(api.state().registration('src/main.ts'))).toContain(
    'REMOTE',
  );
});
