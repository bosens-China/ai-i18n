import type { Plugin, ResolvedConfig } from 'vite';
import { parse } from '@vue/compiler-sfc';
import { expect, test } from 'vitest';
import { aiI18nVitest } from '../src/vitest';

test('Vitest plugin resolves a React-compatible in-memory runtime', () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin, { name: 'vite:react-babel' }],
  } as unknown as ResolvedConfig);
  const id = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
  const code = callHook<string>(plugin.load, id);

  expect(id).toBe('\0virtual:ai-i18n:vitest');
  expect(code).toContain("from '@ai-i18n/vite/react'");
  expect(code).toContain('export const useI18n = createReactI18n(runtime)');
  expect(code).not.toContain('tRef');
  expect(code).toContain(
    'export const getLangLoadState = runtime.getLangLoadState',
  );
  expect(code).not.toContain('FileStore');
});

test('Vitest plugin erases defineI18nMessages without a runtime import', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin],
  } as unknown as ResolvedConfig);

  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    "const messages = defineI18nMessages({ save: '保存' })",
    '/workspace/src/messages.ts',
  );

  expect(result?.code).toBe("const messages = ({ save: '保存' })");
});

test.each([
  {
    expected: 'import { t, getLangLoadState } from "virtual:ai-i18n";',
    framework: 'vanilla' as const,
    source: "t('Vanilla'); getLangLoadState()",
  },
  {
    expected:
      'import { useI18n, t, setLang, getLang, getLangs, getLangLoadState, subscribe, tRef, i18nComputed, tComputed } from "virtual:ai-i18n";',
    framework: 'vue' as const,
    source:
      "useI18n(); t('Vue'); setLang('en-US'); getLang(); getLangs(); getLangLoadState(); subscribe(listener); tRef('Vue Ref'); i18nComputed(); tComputed('Options')",
  },
  {
    expected:
      'import { useI18n, t, setLang, getLang, getLangs, getLangLoadState, subscribe } from "virtual:ai-i18n";',
    framework: 'react' as const,
    source:
      "useI18n(); t('React'); setLang('en-US'); getLang(); getLangs(); getLangLoadState(); subscribe(listener)",
  },
])(
  'Vitest plugin injects $framework auto imports when enabled',
  async ({ expected, framework, source }) => {
    const plugin = aiI18nVitest({
      sourceLang: 'zh-CN',
      locales: [{ value: 'zh-CN', label: '中文' }],
      framework,
      autoImport: true,
    });
    const result = await callHook<
      Promise<{ code: string; map: unknown } | null>
    >(plugin.transform, source, '/workspace/src/auto-import.ts');

    expect(result?.code).toContain(expected);
  },
);

test('Vitest plugin injects auto-imported APIs used as values', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'react',
    autoImport: true,
  });
  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    'const switchLanguage = setLang; const runtime = { getLang }',
    '/workspace/src/runtime.ts',
  );

  expect(result?.code).toContain(
    'import { setLang, getLang } from "virtual:ai-i18n";',
  );
});

test('Vitest plugin leaves unbound runtime calls alone when auto import is disabled', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
  });

  await expect(
    callHook<Promise<unknown>>(
      plugin.transform,
      "useI18n(); t('显式导入')",
      '/workspace/src/explicit.ts',
    ),
  ).resolves.toBeNull();
});

test('Vitest plugin injects Vue auto imports inside script setup', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
    autoImport: true,
  });
  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    [
      '<script setup lang="ts">',
      'const { t } = useI18n()',
      '</script>',
      "<template>{{ t('测试') }}</template>",
    ].join('\n'),
    '/workspace/src/App.vue',
  );

  expect(result).not.toBeNull();
  const transformed = result!.code;
  expect(transformed).toContain('import { useI18n } from "virtual:ai-i18n";');
  expect(transformed.indexOf('import { useI18n }')).toBeLessThan(
    transformed.indexOf('const { t }'),
  );
});

test('Vitest plugin injects Options API helpers into ordinary Vue scripts', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
    autoImport: true,
  });
  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    [
      '<script lang="ts">',
      'export default {',
      '  computed: {',
      '    ...i18nComputed(),',
      "    label: tComputed('保存'),",
      '  },',
      '}',
      '</script>',
      '<template>{{ label }} · {{ currentLang }}</template>',
    ].join('\n'),
    '/workspace/src/OptionsPanel.vue',
  );

  expect(result?.code).toContain(
    'import { i18nComputed, tComputed } from "virtual:ai-i18n";',
  );
});

test('Vitest plugin preserves dual-script scopes for auto imports', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
    autoImport: true,
  });
  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    [
      '<script>',
      "const result = setLang('en-US')",
      'export default { data: () => ({ result }) }',
      '</script>',
      '<script setup>',
      'const setLang = (value) => value',
      '</script>',
      "<template>{{ result }} {{ setLang('local') }}</template>",
    ].join('\n'),
    '/workspace/src/DualShadow.vue',
  );
  const descriptor = parse(result!.code, {
    filename: 'DualShadow.vue',
  }).descriptor;

  expect(descriptor.script?.content).toContain(
    'import { setLang } from "virtual:ai-i18n";',
  );
  expect(descriptor.scriptSetup?.content).not.toContain(
    'import { setLang } from "virtual:ai-i18n";',
  );
});

test('Vitest plugin exposes Vue-only reactive helpers in the Vue runtime', () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
  });
  const id = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
  const code = callHook<string>(plugin.load, id);

  expect(code).toContain("from '@ai-i18n/vite/vue'");
  expect(code).toContain(
    'export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(runtime)',
  );
});

test('Vitest plugin rejects referencing the defineI18nMessages macro function', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin],
  } as unknown as ResolvedConfig);

  await expect(
    callHook<Promise<unknown>>(
      plugin.transform,
      'const macro = defineI18nMessages',
      '/workspace/src/invalid-macro.ts',
    ),
  ).rejects.toThrow('do not reference, pass, or store the macro function');
});

test('Vitest plugin skips definePage submodules but transforms external Vue scripts', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
    framework: 'vue',
  });

  await expect(
    callHook<Promise<unknown>>(
      plugin.transform,
      'export default () => <main />',
      '/workspace/src/Page.vue?definePage&vue&lang.tsx',
    ),
  ).resolves.toBeNull();
  await expect(
    callHook<Promise<unknown>>(
      plugin.transform,
      "<template>{{ t('raw') }}</template>",
      '/workspace/src/Page.vue?raw',
    ),
  ).resolves.toBeNull();

  const external = await callHook<
    Promise<{ code: string; map: unknown } | null>
  >(
    plugin.transform,
    "const messages = defineI18nMessages({ save: '保存' })",
    '/workspace/src/page.ts?vue&type=script&src=true&lang.ts',
  );
  expect(external?.code).toBe("const messages = ({ save: '保存' })");
});

function callHook<T>(hook: Plugin[keyof Plugin], ...args: unknown[]): T {
  const handler =
    typeof hook === 'function'
      ? hook
      : (hook as { handler: (...values: unknown[]) => T }).handler;
  return handler.apply({}, args) as T;
}
