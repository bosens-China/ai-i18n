import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src/index';
import { defineRemote, type RemoteContext } from '../src/remote';
import { REMOTE_UPDATE_EVENT } from '../src/plugin-remote';
import { scanProject } from '../src/scan';
import { FileStore } from '../src/file-store';
import type { TranslationMemoryCandidateCacheAdapter } from '@ai-i18n/core/translation-memory';
import { buildOutputItems } from './build-output';
import { options } from './plugin-test-utils';
import {
  updateTestTranslationMemory,
  readTestTranslationMemory,
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-remote-')),
  );
  roots.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(
    path.join(root, 'src/main.ts'),
    `import { t, getTranslationMeta } from 'virtual:ai-i18n';
    console.log(t('保存'), getTranslationMeta()); void import('./lazy');`,
  );
  await fs.writeFile(
    path.join(root, 'src/lazy.ts'),
    `import { t } from 'virtual:ai-i18n'; console.log(t('懒加载'));`,
  );
  await fs.writeFile(
    path.join(root, 'index.html'),
    `<h1>t("页面")</h1><script type="module" src="/src/main.ts"></script>`,
  );
  return root;
}

function remoteValues({ messages }: RemoteContext) {
  return {
    translations: messages.map((message) => ({
      message,
      locale: 'en-US',
      value: `Remote ${message.source}`,
    })),
    publicMeta: { version: 'release-42' },
  };
}

function buildFixture(root: string, extra: Partial<AiI18nOptions>) {
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias },
    plugins: [aiI18n({ ...options, ...extra })],
    build: { write: false, sourcemap: true },
  });
}

describe('remote translation lifecycle', () => {
  it('keeps standalone scanning free of remote calls and automatic translation writes', async () => {
    const root = await fixture();
    const publish = vi.fn(async () => {});
    const load = vi.fn(async () => ({ translations: [] }));
    const result = await scanProject({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias },
      plugins: [aiI18n({ ...options, remote: { publish, load } })],
    });
    expect(publish).not.toHaveBeenCalled();
    expect(result.translation_source).toBe('remote');
    expect(load).not.toHaveBeenCalled();
    await expect(
      fs.stat(path.join(root, 'i18n/translations')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves human overrides above a remote snapshot', async () => {
    const root = await fixture();
    const store = new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
    });
    await store.transactOverrides((overrides) => {
      overrides.rules.push({
        source: '保存',
        translations: { 'en-US': 'Reviewed save' },
      });
    });
    await store.close();
    const result = await buildFixture(root, {
      remote: { load: async (context) => remoteValues(context) },
    });
    const code = buildOutputItems(result)
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join();
    expect(code).toContain('Reviewed save');
    expect(code).not.toContain('Remote 保存');
  });

  it.each([false, true])(
    'uses one complete snapshot for HTML, static and lazy modules (loading=%s)',
    async (loading) => {
      const root = await fixture();
      const directory = path.join(root, 'i18n');
      await updateTestTranslationMemory(directory, (memory) => {
        memory.messages['保存'] = {
          source: '保存',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'LOCAL_VALUE' },
        };
      });
      const before = await readTestTranslationMemory(directory);
      const publish = vi.fn<(context: RemoteContext) => Promise<void>>(
        async () => {},
      );
      const adapter: TranslationMemoryCandidateCacheAdapter = {
        cache: 'sqlite',
        open: vi.fn(async () => {
          throw new Error('Unexpected SQLite open');
        }),
        list: vi.fn(async () => ({ candidates: [], hasMore: false })),
      };
      const load = vi.fn(async (context: RemoteContext) =>
        remoteValues(context),
      );
      const result = await buildFixture(root, {
        loading,
        failOnMissingTranslations: true,
        remote: defineRemote({ publish, load }),
        translationMemory: { cache: adapter },
      });
      expect(publish).toHaveBeenCalledOnce();
      expect(load).toHaveBeenCalledOnce();
      expect(adapter.open).not.toHaveBeenCalled();
      expect(adapter.list).not.toHaveBeenCalled();
      expect(
        load.mock.calls[0]![0].messages.map((message) => message.source).sort(),
      ).toEqual(['保存', '懒加载', '页面'].sort());
      expect(publish.mock.invocationCallOrder[0]).toBeLessThan(
        load.mock.invocationCallOrder[0]!,
      );
      const items = buildOutputItems(result);
      const code = items
        .filter((item) => item.type === 'chunk')
        .map((item) => item.code)
        .join('\n');
      expect(code).toContain('Remote 保存');
      expect(code).toContain('Remote 懒加载');
      expect(code).toContain('release-42');
      expect(code).not.toContain('LOCAL_VALUE');
      expect(code).not.toContain('__AI_I18N_REMOTE_');
      const html = items.find(
        (item) => item.type === 'asset' && item.fileName === 'index.html',
      );
      expect(html?.type === 'asset' && String(html.source)).toContain(
        loading ? '>页面</h1>' : '>Remote 页面</h1>',
      );
      expect(await readTestTranslationMemory(directory)).toEqual(before);
      const locale = JSON.parse(
        await fs.readFile(path.join(directory, 'locales/en-US.json'), 'utf8'),
      );
      expect(Object.values(locale.messages)).toContain('Remote 保存');
    },
  );

  it('keeps publish-only compatible with the local provider even when publishing fails', async () => {
    const root = await fixture();
    const translator = vi.fn(
      async ({ messages }: { messages: readonly { source: string }[] }) =>
        messages.map(({ source }) => ({ 'en-US': `Local ${source}` })),
    );
    const result = await buildFixture(root, {
      provider: { translator, debounceMs: 0 },
      remote: {
        publish: async () => {
          throw new Error('offline');
        },
      },
    });
    expect(
      buildOutputItems(result)
        .filter((item) => item.type === 'chunk')
        .map((item) => item.code)
        .join(),
    ).toContain('Local 保存');
    expect(translator).toHaveBeenCalled();
    expect(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages[
        '保存'
      ]?.translations['en-US'],
    ).toBe('Local 保存');
  });

  it('fails the missing gate and does not use local historical values', async () => {
    const root = await fixture();
    await expect(
      buildFixture(root, {
        failOnMissingTranslations: true,
        remote: { load: async () => ({ translations: [] }) },
      }),
    ).rejects.toThrow(/missing translations/);
  });

  it('fails on load errors and invalid snapshots instead of partially emitting a build', async () => {
    const root = await fixture();
    await expect(
      buildFixture(root, {
        remote: {
          load: async () => {
            throw new Error('offline');
          },
        },
      }),
    ).rejects.toThrow(/remote.load/);
    await expect(
      buildFixture(root, {
        remote: {
          load: async () => ({
            translations: [
              { message: { source: 'unknown' }, locale: 'en-US', value: 'bad' },
            ],
          }),
        },
      }),
    ).rejects.toThrow(/outside the current snapshot/);
  });

  it.each([false, true])(
    'does not block Dev transforms and refreshes cached responses (loading=%s)',
    async (loading) => {
      const root = await fixture();
      let release!: (value: ReturnType<typeof remoteValues>) => void;
      const first = new Promise<ReturnType<typeof remoteValues>>((resolve) => {
        release = resolve;
      });
      let firstContext: RemoteContext | undefined;
      const load = vi.fn(async (context: RemoteContext) => {
        if (!firstContext) {
          firstContext = context;
          return first;
        }
        return {
          ...remoteValues(context),
          publicMeta: { version: 'release-43' },
        };
      });
      const vite = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true },
        resolve: { alias },
        plugins: [aiI18n({ ...options, loading, remote: { load } })],
      });
      servers.push(vite);
      const send = vi.spyOn(vite.environments.client.hot, 'send');
      const initial = await vite.transformRequest('/src/main.ts');
      expect(initial?.code).not.toContain('Remote 保存');
      await expect.poll(() => firstContext).toBeDefined();
      release(remoteValues(firstContext!));
      const resource = loading
        ? 'virtual:ai-i18n/locale/en-US'
        : '/src/main.ts';
      await expect
        .poll(async () => (await vite.transformRequest(resource))?.code)
        .toContain('Remote 保存');
      const runtime = 'virtual:ai-i18n/internal';
      expect((await vite.transformRequest(runtime))?.code).toContain(
        'release-42',
      );
      expect(send).toHaveBeenCalledWith(
        REMOTE_UPDATE_EVENT,
        expect.objectContaining({ publicMeta: { version: 'release-42' } }),
      );
      await fs.writeFile(
        path.join(root, 'src/main.ts'),
        `import { t, getTranslationMeta } from 'virtual:ai-i18n'; console.log(t('新增'), getTranslationMeta());`,
      );
      await expect
        .poll(async () => (await vite.transformRequest('/src/main.ts'))?.code)
        .toContain('新增');
      await expect
        .poll(async () => (await vite.transformRequest(resource))?.code)
        .toContain('Remote 新增');
      expect((await vite.transformRequest(runtime))?.code).toContain(
        'release-43',
      );
      await expect(
        fs.stat(path.join(root, 'i18n/translations')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
