import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build, createServer, type Plugin } from 'vite';
import { aiI18n } from '../src/plugin';
import { aiI18nPluginApi } from '../src/plugin-api';
import { scanWithDev } from '../src/scan-bridge';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

const roots: string[] = [];
const locales = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-persistence-')),
  );
  roots.push(root);
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<script type="module" src="/main.ts"></script>',
  );
  await fs.writeFile(path.join(root, 'main.ts'), "console.log(t('保存'));");
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    for (const [source, value] of [
      ['保存', 'Save'],
      ['历史', 'History'],
    ]) {
      memory.messages[source!] = {
        source: source!,
        sourceLang: 'zh',
        translations: { en: value! },
      };
    }
  });
  return root;
}
function config(root: string, extra: Plugin[] = [], fail = false) {
  return {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    resolve: {
      alias: {
        '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
      },
    },
    plugins: [
      aiI18n({
        sourceLang: 'zh',
        locales,
        autoImport: true,
        dts: false,
        cleanup: { orphanMessages: true },
        failOnMissingTranslations: fail,
        translationMemory: { capacity: { maxMessages: 1 } },
      }),
      ...extra,
    ],
    build: { minify: false as const },
  };
}
const memory = (root: string) =>
  readTestTranslationMemory(path.join(root, 'i18n'));

it('cleans only successful Watch cycles and recovers after a failed cycle', async () => {
  const root = await fixture();
  let fail = true;
  const input = config(root, [
    {
      name: 'watch-failure',
      renderChunk() {
        if (fail) throw new Error('watch render failed');
      },
    },
  ]);
  const watcher = await build({
    ...input,
    build: {
      minify: false,
      watch: { exclude: ['**/i18n/**'] },
    },
  });
  if (!('on' in watcher)) throw new Error('Expected watcher');
  const events: string[] = [];
  watcher.on('event', (event) => {
    if (event.code === 'BUNDLE_END' || event.code === 'ERROR')
      events.push(event.code);
  });
  try {
    await vi.waitFor(() => expect(events.at(-1)).toBe('ERROR'));
    expect((await memory(root)).messages['历史']).toBeDefined();
    fail = false;
    events.length = 0;
    await fs.writeFile(path.join(root, 'main.ts'), "console.info(t('保存'));");
    await vi.waitFor(() => expect(events.at(-1)).toBe('BUNDLE_END'));
    expect((await memory(root)).messages['历史']).toBeUndefined();
    await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
      memory.messages['历史'] = {
        source: '历史',
        sourceLang: 'zh',
        translations: { en: 'History' },
      };
    });
    fail = true;
    events.length = 0;
    await fs.writeFile(path.join(root, 'main.ts'), "console.warn(t('保存'));");
    await vi.waitFor(() => expect(events.at(-1)).toBe('ERROR'));
    expect((await memory(root)).messages['历史']).toBeDefined();
  } finally {
    await watcher.close();
  }
});

it.each([false, true])(
  'waits for all outputs before cleanup (second output fails: %s)',
  async (fail) => {
    const root = await fixture();
    let writes = 0;
    const input = config(root, [
      {
        name: 'second-output',
        writeBundle: {
          order: 'post',
          sequential: true,
          async handler() {
            expect((await memory(root)).messages['历史']).toBeDefined();
            if (++writes === 2 && fail) throw new Error('second output failed');
          },
        },
      },
    ]);
    const result = build({
      ...input,
      build: {
        minify: false,
        rolldownOptions: {
          output: [
            { format: 'es', dir: path.join(root, 'dist/es') },
            { format: 'cjs', dir: path.join(root, 'dist/cjs') },
          ],
        },
      },
    });
    if (fail) await expect(result).rejects.toThrow('second output failed');
    else await result;
    expect(Boolean((await memory(root)).messages['历史'])).toBe(fail);
  },
);

it('preserves unvisited translations during Dev without derived caches, including repeated persistence', async () => {
  const root = await fixture();
  const server = await createServer({
    ...config(root),
    server: { middlewareMode: true, preTransformRequests: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await server.transformRequest('/main.ts');
    const api = server.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
    await api.flushPersistence();
    expect((await memory(root)).messages['历史']?.translations.en).toBe(
      'History',
    );
    await api.flushPersistence();
  } finally {
    await server.close();
  }
  expect((await memory(root)).messages['历史']?.translations.en).toBe(
    'History',
  );
});

it('persists a complete missing catalog before failing, without entering rendering or pruning history', async () => {
  const root = await fixture();
  await fs.writeFile(
    path.join(root, 'main.ts'),
    "import { titles } from './titles'; console.log(t(titles[location.hash]));",
  );
  await fs.writeFile(
    path.join(root, 'titles.ts'),
    "export const titles = defineI18nMessages({a:'标题甲',b:'标题乙',c:'标题丙',d:'标题丁'});",
  );
  const render = vi.fn();
  await expect(
    build(
      config(root, [{ name: 'observe-render', renderStart: render }], true),
    ),
  ).rejects.toThrow(/en: 4/);
  expect(render).not.toHaveBeenCalled();
  expect((await memory(root)).messages['历史']?.translations.en).toBe(
    'History',
  );
  const files = await fs.readdir(path.join(root, 'i18n/extracted'));
  const extracted = await Promise.all(
    files.map(async (file) =>
      JSON.parse(
        await fs.readFile(path.join(root, 'i18n/extracted', file), 'utf8'),
      ),
    ),
  );
  expect(
    extracted
      .flatMap((file) => file.messages)
      .map((message) => message.source)
      .sort(),
  ).toEqual(['标题甲', '标题乙', '标题丙', '标题丁'].sort());
});

it.each(['render', 'write', 'close'] as const)(
  'preserves history when a later %s hook fails',
  async (stage) => {
    const root = await fixture();
    const failure = () => {
      throw new Error('downstream failure');
    };
    const plugin: Plugin = {
      name: 'downstream-failure',
      enforce: 'post',
      ...(stage === 'render'
        ? { renderChunk: failure }
        : stage === 'write'
          ? {
              writeBundle: {
                order: 'post' as const,
                sequential: true,
                handler: failure,
              },
            }
          : {
              closeBundle: {
                order: 'post' as const,
                sequential: true,
                handler: failure,
              },
            }),
    };
    await expect(build(config(root, [plugin]))).rejects.toThrow(
      'downstream failure',
    );
    expect((await memory(root)).messages['历史']?.translations.en).toBe(
      'History',
    );
  },
);

it('prunes only after successful output, but never for write:false', async () => {
  const root = await fixture();
  const observed: string[] = [];
  const input = config(root, [
    {
      name: 'observe-write',
      writeBundle: {
        order: 'post',
        sequential: true,
        async handler() {
          observed.push(
            (await memory(root)).messages['历史']!.translations.en!,
          );
        },
      },
    },
  ]);
  await build({ ...input, build: { write: false } });
  expect((await memory(root)).messages['历史']).toBeDefined();
  await build(config(root, input.plugins.slice(1)));
  expect(observed).toEqual(['History']);
  expect((await memory(root)).messages['历史']).toBeUndefined();
});

it('keeps the newest bridge registered when the old Dev closes', async () => {
  const root = await fixture();
  const start = () =>
    createServer({
      ...config(root),
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  const old = await start();
  const current = await start();
  try {
    await old.close();
    expect((await scanWithDev(current))?.message_count).toBe(1);
  } finally {
    await current.close();
  }
});
