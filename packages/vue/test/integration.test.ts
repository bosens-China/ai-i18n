import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import vuePlugin from '@vitejs/plugin-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '@ai-i18n/vite';
import { vue } from '../src/vite';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('@ai-i18n/vue Vite integration', () => {
  it('builds after the extractor and writes SFC protocol files', async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-vue-'));
    const root = await fs.realpath(temporaryRoot);
    tempDirs.push(root);
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(root, 'src/main.ts'),
      "import { createApp } from 'vue'; import App from './App.vue'; createApp(App).mount('#app');",
    );
    await fs.writeFile(
      path.join(root, 'src/App.vue'),
      `<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'
const { t } = useI18n()
const LABEL = '标题'
</script>
<template>
  <h1>{{ t(LABEL) }}</h1>
  <input :placeholder="t('请输入')">
  <p>普通文本</p>
</template>`,
    );
    const translator: Translator = vi.fn(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: request.source === '标题' ? 'Title' : 'Type here',
      })),
    );

    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@ai-i18n/core': path.resolve('packages/core/src/index.ts'),
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
          '@ai-i18n/vue': path.resolve('packages/vue/src/index.ts'),
          vue: path.resolve(
            'packages/vue/node_modules/vue/dist/vue.runtime.esm-bundler.js',
          ),
        },
      },
      plugins: [
        vuePlugin(),
        aiI18n({
          sourceLang: 'zh-CN',
          defaultLang: 'en-US',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          extractors: [vue()],
          translator,
          provider: { batchSize: 10, strict: true },
        }),
      ],
      build: { write: false },
    });
    const code = (Array.isArray(output) ? output : [output])
      .flatMap((item) => item.output)
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');

    expect(code).toContain('Title');
    expect(code).toContain('Type here');
    expect(code).not.toContain('静态属性不提取');
    expect(translator).toHaveBeenCalled();
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/App.vue.json')),
    ).toMatchObject({
      source: 'src/App.vue',
      messages: [
        { id: '标题', locations: [{ line: 7 }] },
        { id: '请输入', locations: [{ line: 8 }] },
      ],
    });
  });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
