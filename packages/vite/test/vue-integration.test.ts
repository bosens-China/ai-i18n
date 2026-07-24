import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import vuePlugin from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '../src';
import { buildOutputItems } from './build-output';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Vue Vite integration', () => {
  it('auto-detects Vue and extracts SFC, TS, and TSX calls', async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-vue-')),
    );
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
      path.join(root, 'src/useLabel.ts'),
      `export function useLabel() {
  const i18n = useI18n()
  return i18n.t('Vue TS')
}`,
    );
    await fs.writeFile(
      path.join(root, 'src/VueJsxPanel.tsx'),
      `import { defineComponent } from 'vue'
export default defineComponent({
  setup() {
    const { t } = useI18n()
    return () => <p>{t('Vue TSX')}</p>
  },
})`,
    );
    await fs.writeFile(
      path.join(root, 'src/App.vue'),
      `<script setup lang="ts">
import VueJsxPanel from './VueJsxPanel'
import { useLabel } from './useLabel'
const { t } = useI18n()
const label = useLabel()
</script>
<template>
  <h1>{{ t('Vue SFC') }}</h1>
  <p>{{ label }}</p>
  <VueJsxPanel />
</template>`,
    );
    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: `EN:${request.source}`,
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
          '@ai-i18n/vite/vue': path.resolve('packages/vite/src/vue.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          defaultLang: 'en-US',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          translator,
          provider: { batchLength: 12_000, strict: true },
        }),
        { name: 'unplugin-auto-import' },
        vuePlugin(),
        vueJsx(),
      ],
      build: {
        write: false,
        rollupOptions: {
          external: /^vue(?:\/.*)?$/,
        },
      },
    });
    const code = chunks(output);

    expect(code).toContain('EN:Vue SFC');
    expect(code).toContain('EN:Vue TS');
    expect(code).toContain('EN:Vue TSX');
    expect(translator).toHaveBeenCalled();
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/App.vue.json')),
    ).toMatchObject({ messages: [{ id: 'Vue SFC' }] });
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/useLabel.ts.json')),
    ).toMatchObject({ messages: [{ id: 'Vue TS' }] });
    expect(
      await readJson(
        path.join(root, 'i18n/extracted/src/VueJsxPanel.tsx.json'),
      ),
    ).toMatchObject({ messages: [{ id: 'Vue TSX' }] });
  });
});

function chunks(output: Awaited<ReturnType<typeof build>>) {
  return buildOutputItems(output)
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
