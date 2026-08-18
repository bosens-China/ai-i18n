import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { aiI18n } from '../src/index';
import { removeTempDir } from './temp-dir';

const tempDirs: string[] = [];
const viteSource = path.resolve('packages/vite/src');
const require = createRequire(import.meta.url);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(removeTempDir));
});

describe('Build chunk boundaries', () => {
  it.each([
    ['vue', vue()],
    ['react', react()],
  ] as const)(
    'keeps %s scoped and registration modules inside business chunks',
    async (framework, hostPlugin) => {
      const root = await fixtureRoot();
      await writeFixture(root, framework);
      const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        resolve: {
          alias: [
            {
              find: '@ai-i18n/vite/runtime',
              replacement: path.join(viteSource, 'runtime.ts'),
            },
            {
              find: '@ai-i18n/vite/vue',
              replacement: path.join(viteSource, 'vue.ts'),
            },
            {
              find: '@ai-i18n/vite/react',
              replacement: path.join(viteSource, 'react.ts'),
            },
            { find: /^vue$/, replacement: require.resolve('vue') },
            {
              find: /^react-dom\/client$/,
              replacement: require.resolve('react-dom/client'),
            },
            {
              find: /^react\/jsx-dev-runtime$/,
              replacement: require.resolve('react/jsx-dev-runtime'),
            },
            {
              find: /^react\/jsx-runtime$/,
              replacement: require.resolve('react/jsx-runtime'),
            },
            { find: /^react$/, replacement: require.resolve('react') },
          ],
        },
        plugins: [
          hostPlugin as Plugin,
          aiI18n({
            sourceLang: 'zh-CN',
            locales: [
              { value: 'zh-CN', label: '中文' },
              { value: 'en-US', label: 'English' },
            ],
            dts: false,
            directory: path.join(root, 'i18n'),
          }),
        ],
        build: { write: false },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(
        (item) => {
          if (!('output' in item)) {
            throw new Error('Expected a completed Vite Build output.');
          }
          return item.output;
        },
      );
      const chunks = outputs.filter((output) => output.type === 'chunk');
      const virtualPrefix = '\0virtual:ai-i18n';
      const scopedOrRegistration = (moduleId: string) =>
        moduleId.startsWith(`${virtualPrefix}?module=`) ||
        moduleId.startsWith(`${virtualPrefix}/register?module=`);

      expect(chunks).toHaveLength(2);
      expect(chunks.filter((chunk) => chunk.isEntry)).toHaveLength(1);
      expect(chunks.filter((chunk) => chunk.isDynamicEntry)).toHaveLength(1);
      expect(
        chunks.some((chunk) => chunk.facadeModuleId?.startsWith(virtualPrefix)),
      ).toBe(false);

      const chunksWithScopedRuntime = chunks.filter((chunk) =>
        Object.keys(chunk.modules).some(scopedOrRegistration),
      );
      expect(chunksWithScopedRuntime).toHaveLength(2);
      for (const chunk of chunksWithScopedRuntime) {
        const moduleIds = Object.keys(chunk.modules);
        expect(moduleIds.some((id) => id.startsWith(`${root}/src/`))).toBe(
          true,
        );
      }
    },
  );
});

async function fixtureRoot(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-build-chunks-'),
  );
  const root = await fs.realpath(directory);
  tempDirs.push(root);
  return root;
}

async function writeFixture(root: string, framework: 'vue' | 'react') {
  await write(
    root,
    'index.html',
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
  );
  await write(
    root,
    'src/lazy.ts',
    "import { t } from 'virtual:ai-i18n'; export const lazyLabel = t('动态页面')",
  );
  if (framework === 'vue') {
    await write(
      root,
      'src/main.ts',
      "import { createApp } from 'vue'; import App from './App.vue'; createApp(App).mount('#app'); void import('./lazy')",
    );
    await write(
      root,
      'src/App.vue',
      `<script setup lang="ts">
import { t } from 'virtual:ai-i18n'
const label = t('电站首页')
</script>
<template><h1>{{ label }}</h1></template>`,
    );
    return;
  }
  await write(
    root,
    'index.html',
    '<div id="app"></div><script type="module" src="/src/main.tsx"></script>',
  );
  await write(
    root,
    'src/main.tsx',
    "import React from 'react'; import { createRoot } from 'react-dom/client'; import { App } from './App'; createRoot(document.getElementById('app')!).render(<App />); void import('./lazy')",
  );
  await write(
    root,
    'src/App.tsx',
    `import { useI18n } from 'virtual:ai-i18n'
export function App() {
  const { t } = useI18n()
  return <h1>{t('电站首页')}</h1>
}`,
  );
}

async function write(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
}
