import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { writeFrameworkTypes } from '../src/framework';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

it('lets vue-tsc resolve bare t in script setup, Options, and template-only SFCs', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-vue-template-types-'),
  );
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.symlink(
    path.join(workspaceRoot, 'packages/vite/node_modules'),
    path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await writeFrameworkTypes(root, 'vue', true);

  await Promise.all([
    fs.writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          lib: ['ES2022', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.vue'],
      }),
    ),
    fs.writeFile(path.join(root, 'src/runtime-stubs.d.ts'), runtimeTypeStubs),
    fs.writeFile(
      path.join(root, 'src/SetupPanel.vue'),
      `<script setup lang="ts">
import { ref } from 'vue'

const count = ref(1)
const label: string = t('setup 脚本')
</script>

<template>
  <p>{{ t('setup 模板') }} {{ label }} {{ count }}</p>
</template>
`,
    ),
    fs.writeFile(
      path.join(root, 'src/OptionsPanel.vue'),
      `<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  methods: {
    label(): string {
      return t('Options 脚本')
    },
  },
})
</script>

<template>
  <p>{{ t('Options 模板') }} {{ label() }}</p>
</template>
`,
    ),
    fs.writeFile(
      path.join(root, 'src/TemplateOnly.vue'),
      `<template>
  <p>{{ t('纯模板') }}</p>
</template>
`,
    ),
  ]);

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = await execFileAsync(
    pnpm,
    ['exec', 'vue-tsc', '--noEmit', '-p', path.join(root, 'tsconfig.json')],
    { cwd: workspaceRoot },
  );

  expect(result.stderr).toBe('');
}, 20_000);

const runtimeTypeStubs = `declare module '@ai-i18n/vite' {
  export interface I18nRuntime {
    t: (source: string) => string
    setLang: (lang: string) => Promise<void>
    getLang: () => string
    getLangs: () => readonly unknown[]
    getLangLoadState: () => unknown
    subscribe: (listener: () => void) => () => void
  }
}

declare module '@ai-i18n/vite/vue' {
  export type UseI18n = () => unknown
  export type TranslateRef = (source: string) => unknown
  export type I18nComputed = () => object
  export type TranslateComputed = (source: string) => () => string
}
`;
