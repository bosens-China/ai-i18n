import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { aiI18n } from '../src/plugin';
import { scanProject } from '../src/scan';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { aiI18nPluginApi } from '../src/plugin-api';
import { ensureScan } from '../src/scan-catalog';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];
async function fixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-scan-'));
  roots.push(root);
  for (const [file, code] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), code);
  }
  return root;
}
function config(root: string, translator = vi.fn(async () => [])) {
  return {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    resolve: {
      alias: {
        '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        '@texts': path.join(root, 'texts.ts'),
      },
    },
    plugins: [
      aiI18n({
        sourceLang: 'zh-CN',
        locales,
        provider: { translator },
        cleanup: { orphanMessages: true },
        translationMemory: { capacity: { maxMessages: 1 } },
      }),
    ],
  };
}

it('extracts entry, lazy routes, glob pages and shared constants without Build or Provider', async () => {
  const root = await fixture({
    'index.html': '<script type="module" src="/main.ts"></script>',
    'main.ts':
      "import { t } from 'virtual:ai-i18n'; import { LABEL } from '@texts'; console.log(t(LABEL)); void import('./lazy'); console.log(import.meta.glob('./pages/*.ts'));",
    'texts.ts': "export { LABEL } from './labels';",
    'labels.ts': "export const LABEL = '首页';",
    'lazy.ts': "import { t } from 'virtual:ai-i18n'; console.log(t('懒加载'));",
    'pages/settings.ts':
      "import { t } from 'virtual:ai-i18n'; console.log(t('设置'));",
    'unused.ts':
      "import { t } from 'virtual:ai-i18n'; console.log(t('未引用'));",
  });
  const translator = vi.fn(async () => []);
  const input = config(root, translator);
  const generateBundle = vi.fn();
  input.plugins.push({ name: 'no-build', generateBundle });
  const transformed: string[] = [];
  input.plugins.push({
    name: 'capture-scan-code',
    enforce: 'post',
    transform(code, id) {
      if (id.endsWith('/main.ts')) transformed.push(code);
    },
  });
  const result = await scanProject(input);
  expect(transformed).toHaveLength(1);
  expect(transformed[0]).not.toContain('__registerModule');
  expect(transformed[0]).not.toContain('__aiI18nAt');
  expect(result).toMatchObject({
    file_count: 3,
    message_count: 3,
    locales: [{ locale: 'en-US', translated: 0, missing: 3 }],
  });
  expect(
    Object.keys(
      (await readTestTranslationMemory(path.join(root, 'i18n'))).messages,
    ),
  ).toEqual(expect.arrayContaining(['首页', '懒加载', '设置']));
  expect(translator).not.toHaveBeenCalled();
  expect(generateBundle).not.toHaveBeenCalled();
  await expect(fs.access(path.join(root, 'dist'))).rejects.toThrow();
  await expect(
    fs.access(path.join(root, 'src/ai-i18n.d.ts')),
  ).rejects.toThrow();

  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['首页']!.translations['en-US'] = 'Home';
  });
  await fs.writeFile(
    path.join(root, 'main.ts'),
    "import { t } from 'virtual:ai-i18n'; console.log(t('新文案'));",
  );
  const second = await scanProject(config(root));
  expect(second.message_count).toBe(1);
  const memory = await readTestTranslationMemory(path.join(root, 'i18n'));
  expect(memory.messages['首页']?.translations['en-US']).toBe('Home');
  expect(Object.keys(memory.messages)).toHaveLength(4); // 扫描不能应用 orphan/capacity 清理。
  expect(await fs.readdir(path.join(root, 'i18n/extracted'))).toHaveLength(1);
});

it('does not publish a partial catalog when traversal or static extraction fails', async () => {
  const root = await fixture({
    'index.html': '<script type="module" src="/main.ts"></script>',
    'main.ts': "import { t } from 'virtual:ai-i18n'; console.log(t('旧文案'));",
  });
  await scanProject(config(root));
  const directory = path.join(root, 'i18n/extracted');
  const before = await fs.readFile(
    path.join(directory, (await fs.readdir(directory))[0]!),
    'utf8',
  );
  for (const code of [
    "import { t } from 'virtual:ai-i18n'; console.log(t('新文案')); import('./missing.ts');",
    "import { t } from 'virtual:ai-i18n'; console.log(t(window.label));",
    'const target = window.route; import(/* @vite-ignore */ target);',
  ]) {
    await fs.writeFile(path.join(root, 'main.ts'), code);
    await expect(scanProject(config(root))).rejects.toThrow();
    expect(
      await fs.readFile(
        path.join(directory, (await fs.readdir(directory))[0]!),
        'utf8',
      ),
    ).toBe(before);
  }
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<script type="module">import { t } from "virtual:ai-i18n"; console.log(t("内联"));</script>',
  );
  await expect(scanProject(config(root))).rejects.toThrow('Inline HTML');
  expect(
    await fs.readFile(
      path.join(directory, (await fs.readdir(directory))[0]!),
      'utf8',
    ),
  ).toBe(before);
});

it('handles inline HTML, multiple entries, virtual routes and Vue auto imports', async () => {
  const root = await fixture({
    'index.html':
      '<p>t("HTML 文案")</p><script type="module">import "virtual:pages";</script>',
    'admin.html': '<script type="module" src="/admin.ts"></script>',
    'admin.ts':
      "import { t } from 'virtual:ai-i18n'; console.log(t('管理页'));",
    'Page.vue':
      '<script setup lang="ts">const value = t("脚本");</script><template><p>{{ t("页面") }} {{ value }}</p></template><style scoped>p { color: red }</style>',
  });
  const input = config(root);
  input.plugins = [
    aiI18n({ sourceLang: 'zh-CN', locales, autoImport: true, html: true }),
    vue(),
    {
      name: 'virtual-routes',
      resolveId(id) {
        if (id === 'virtual:pages') return '\0virtual:pages';
      },
      load(id) {
        if (id === '\0virtual:pages')
          return "export const routes = [() => import('/Page.vue')];";
      },
    },
  ];
  const result = await scanProject({
    ...input,
    base: '/app/',
    build: {
      rolldownOptions: {
        input: {
          app: path.join(root, 'index.html'),
          admin: path.join(root, 'admin.html'),
        },
      },
    },
    resolve: {
      alias: {
        ...input.resolve.alias,
        vue: path.resolve(
          'packages/vite/node_modules/vue/dist/vue.runtime.esm-bundler.js',
        ),
        '@ai-i18n/vite/vue': path.resolve('packages/vite/src/vue.ts'),
      },
    },
  });
  expect(result.message_count).toBe(4);
});

it('follows React lazy page modules without executing their browser code', async () => {
  const root = await fixture({
    'main.tsx':
      "import React from 'react'; import { t } from 'virtual:ai-i18n'; const Page = React.lazy(() => import('./Page')); document.body.innerHTML = t('首页'); console.log(Page);",
    'Page.tsx':
      "import { t } from 'virtual:ai-i18n'; export default function Page() { return <h1>{t('React 页面')}</h1> }",
  });
  const input = config(root);
  input.plugins = [aiI18n({ sourceLang: 'zh-CN', locales }), ...react()];
  const result = await scanProject(
    {
      ...input,
      resolve: {
        alias: {
          ...input.resolve.alias,
          react: path.resolve('packages/vite/node_modules/react'),
          '@ai-i18n/vite/react': path.resolve('packages/vite/src/react.ts'),
        },
      },
    },
    ['main.tsx'],
  );
  expect(result.message_count).toBe(2);
  // 活动 Dev 会注入 React Refresh，仍需覆盖未访问页面，不能把其运行时当成业务路由。
  const server = await createServer({
    ...input,
    server: { host: '127.0.0.1', port: 0 },
    plugins: [aiI18n({ sourceLang: 'zh-CN', locales }), ...react()],
    resolve: {
      alias: {
        ...input.resolve.alias,
        react: path.resolve('packages/vite/node_modules/react'),
        '@ai-i18n/vite/react': path.resolve('packages/vite/src/react.ts'),
      },
    },
  });
  try {
    await server.listen();
    const api = server.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
    expect((await ensureScan(server, api, ['main.tsx'])).message_count).toBe(2);
  } finally {
    await server.close();
  }
});

it('follows local workspace sources outside the Vite root and terminates import cycles', async () => {
  const workspace = await fixture({
    'app/index.html': '<script type="module" src="/main.ts"></script>',
    'app/main.ts':
      "import '../shared.ts'; import { t } from 'virtual:ai-i18n'; console.log(t('应用'));",
    'shared.ts':
      "import './app/main.ts'; import { t } from 'virtual:ai-i18n'; console.log(t('共享包'));",
  });
  const result = await scanProject(config(path.join(workspace, 'app')));
  expect(result.message_count).toBe(2);
  const directory = path.join(result.i18n_directory, 'extracted');
  const files = await Promise.all(
    (await fs.readdir(directory)).map(
      async (file) =>
        JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as {
          source: string;
        },
    ),
  );
  expect(files.map((file) => file.source)).toContain('../shared.ts');
});

it('reuses a successful standalone scan and rereads translations without re-extraction', async () => {
  const root = await fixture({
    'index.html': '<script type="module" src="/main.ts"></script>',
    'main.ts': "import { t } from 'virtual:ai-i18n'; console.log(t('保存'));",
    'node_modules/test-runtime/index.js': 'export const t = (value) => value;',
  });
  const input = () => {
    const result = config(root);
    result.resolve.alias['@ai-i18n/vite/runtime'] = path.join(
      root,
      'node_modules/test-runtime/index.js',
    );
    return result;
  };
  expect((await scanProject(input())).reused).toBe(false);
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['保存']!.translations['en-US'] = 'Save';
  });
  expect(await scanProject(input())).toMatchObject({
    reused: true,
    locales: [{ missing: 0, translated: 1 }],
  });
});
