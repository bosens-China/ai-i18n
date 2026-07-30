import { describe, expect, it, vi } from 'vitest';
import { aiI18n, type AiI18nOptions } from '../src/index';
import {
  callHook,
  objectHandler,
  options,
  setupPlugin,
} from './plugin-test-utils';

describe('@ai-i18n/vite plugin', () => {
  it('validates locale and persistence options', () => {
    const base = { sourceLang: 'zh-CN', locales: options.locales };

    expect(() => aiI18n({ ...base, locales: [] })).toThrow(
      'locales must not be empty',
    );
    expect(() =>
      aiI18n({ ...base, locales: [options.locales[0]!, options.locales[0]!] }),
    ).toThrow('locale values must be unique');
    expect(() => aiI18n({ ...base, sourceLang: 'ja-JP' })).toThrow(
      'sourceLang must match a value in locales',
    );
    expect(() => aiI18n({ ...base, defaultLang: 'ja-JP' })).toThrow(
      'defaultLang must match a value in locales',
    );
    expect(() => aiI18n({ ...base, persist: { key: ' ' } })).toThrow(
      'persist.key must not be empty',
    );
  });

  it('rejects a provider without a translator during config resolution', () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');

    expect(() =>
      setupPlugin([], undefined, {
        ...options,
        provider: {} as NonNullable<AiI18nOptions['provider']>,
      }),
    ).toThrow('[ai-i18n] provider.translator must be a function.');
  });

  it('injects a stable register import after shebang and directives', async () => {
    const { plugin, transform } = setupPlugin();
    const code = `#!/usr/bin/env node\n'use strict';\nimport { t as tr } from 'virtual:ai-i18n';\nconsole.log(tr('保存', { comment: '按钮' }));`;
    const result = await transform(code, '/workspace/src/main.ts');

    expect(result?.code).toMatch(
      /^#!\/usr\/bin\/env node\n'use strict';\nimport \{ t as tr \} from 'virtual:ai-i18n';\nimport "virtual:ai-i18n\/register\?module=src%2Fmain.ts";/,
    );
    expect(result?.map).toMatchObject({
      sources: ['/workspace/src/main.ts'],
      sourcesContent: [code],
    });

    const registerId = 'virtual:ai-i18n/register?module=src%2Fmain.ts';
    const resolved = callHook<string | undefined>(plugin.resolveId, registerId);
    expect(resolved).toBe(`\0${registerId}`);
    const registration = await callHook<Promise<string>>(
      plugin.load,
      resolved!,
    );
    expect(registration).toContain('"zh-CN":{"保存#按钮":"保存"}');
    expect(registration).toContain('"en-US":{"保存#按钮":null}');
    expect(registration).toContain('import.meta.hot.dispose');
  });

  it('normalizes resolved Windows IDs before loading pending static dependencies', async () => {
    const root = String.raw`E:\DropRoom\apps\web`;
    const dependency = String.raw`E:\DropRoom\apps\web\src\labels.ts`;
    const { transform, dependencyLoad } = setupPlugin(
      [],
      async (specifier) =>
        specifier === './labels' ? { id: dependency } : null,
      options,
      [],
      root,
    );

    await transform(
      `import { t } from 'virtual:ai-i18n'
import { label } from './labels'
t(label)`,
      `${root}\\src\\main.ts`,
    );

    expect(dependencyLoad).toHaveBeenCalledWith({
      id: 'E:/DropRoom/apps/web/src/labels.ts',
    });
  });

  it('does not change modules without an imported t call', async () => {
    const { transform } = setupPlugin();
    expect(
      await transform(
        'const t = (value) => value; t("ignored")',
        '/workspace/src/plain.ts',
      ),
    ).toBeNull();
  });

  it('erases defineI18nMessages while extracting collection members', async () => {
    const { transform } = setupPlugin();
    const result = await transform(
      `import { t } from 'virtual:ai-i18n'
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中'],
})
t(messages.save)
t(messages.states[index])`,
      '/workspace/src/messages.ts',
    );

    expect(result?.code).not.toContain('defineI18nMessages');
    expect(result?.code).toContain("const messages = ({\n  save: '保存'");
    expect(result?.code).toContain('register?module=src%2Fmessages.ts');
  });

  it('does not erase a local defineI18nMessages binding', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform(
        'const defineI18nMessages = (value) => value; defineI18nMessages({ local: true })',
        '/workspace/src/local-macro.ts',
      ),
    ).resolves.toBeNull();
  });

  it('rejects using defineI18nMessages as a runtime value', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform(
        'const macro = defineI18nMessages',
        '/workspace/src/invalid-macro.ts',
      ),
    ).rejects.toThrow('must be called directly');
  });

  it('erases defineI18nMessages inside Vue script setup', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const result = await transform(
      `<script setup lang="ts">
const { t } = useI18n()
const messages = defineI18nMessages({ save: '保存' })
</script>
<template>{{ t(messages.save) }}</template>`,
      '/workspace/src/App.vue',
    );

    expect(result?.code).not.toContain('defineI18nMessages');
    expect(result?.code).toContain("const messages = ({ save: '保存' })");
    expect(result?.code).toContain('register?module=src%2FApp.vue');
  });

  it('skips Vue Router definePage submodules without skipping external scripts', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    await expect(
      transform(
        'export default () => <main />',
        '/workspace/src/Page.vue?definePage&vue&lang.tsx',
      ),
    ).resolves.toBeNull();
    await expect(
      transform(
        "<template>{{ t('raw') }}</template>",
        '/workspace/App.vue?raw',
      ),
    ).resolves.toBeNull();
    await expect(
      transform("t('url')", '/workspace/src/messages.ts?url'),
    ).resolves.toBeNull();

    const external = await transform(
      "const messages = defineI18nMessages({ save: '保存' })",
      '/workspace/src/page.ts?vue&type=script&src=true&lang.ts',
    );
    expect(external?.code).toBe("const messages = ({ save: '保存' })");
  });

  it('auto-imports the Vanilla runtime without changing local bindings', async () => {
    const { transform } = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    const result = await transform(
      "t('自动导入'); setLang('en-US')",
      '/workspace/src/main.ts',
    );

    expect(result?.code).toContain(
      'import { t, setLang } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('register?module=src%2Fmain.ts');
  });

  it.each([
    ['vue', { name: 'vite:vue' }],
    ['react', { name: 'vite:react-babel' }],
  ] as const)(
    'auto-imports Runtime value references in %s mode',
    async (_framework, hostPlugin) => {
      const { transform } = setupPlugin(
        [],
        undefined,
        { ...options, autoImport: true },
        [hostPlugin],
      );
      const result = await transform(
        'const switchLanguage = setLang; const runtime = { getLang }',
        '/workspace/src/runtime.ts',
      );

      expect(result?.code).toContain(
        'import { setLang, getLang } from "virtual:ai-i18n";',
      );
    },
  );

  it('keeps auto import disabled when it is not explicitly configured', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'host-plugin' },
    ]);
    await expect(
      transform("t('需要显式导入')", '/workspace/src/main.ts'),
    ).resolves.toBeNull();
  });

  it('enables auto import only when explicitly configured', async () => {
    const enabled = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    expect(
      await enabled.transform("t('显式开启')", '/workspace/src/enabled.ts'),
    ).not.toBeNull();

    const disabled = setupPlugin([], undefined, {
      ...options,
      autoImport: false,
    });
    await expect(
      disabled.transform("t('显式关闭')", '/workspace/src/disabled.ts'),
    ).resolves.toBeNull();
  });

  it('does not treat JSX as Vanilla source', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform(
        "export const view = <p>{t('JSX 文案')}</p>",
        '/workspace/src/View.jsx',
      ),
    ).resolves.toBeNull();
  });

  it('detects Vue JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true, loading: {} },
      [{ name: 'vite:vue' }, { name: 'vite:vue-jsx' }],
    );
    const vue = await transform(
      `const { t: hookT } = useI18n()
export const label = t('Vue TS')
export const View = () => <p>{hookT('Vue JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(vue?.code).toContain(
      'import { useI18n, t } from "virtual:ai-i18n";',
    );
    expect(vue?.code).toContain('register?module=src%2FView.tsx');
  });

  it('keeps the explicit Hook import when auto import is disabled', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);
    const vue = await transform(
      `import { useI18n } from 'virtual:ai-i18n'
const { t } = useI18n()
export const label = t('显式 Hook')`,
      '/workspace/src/useLabel.ts',
    );

    expect(vue?.code).toContain("import { useI18n } from 'virtual:ai-i18n'");
    expect(vue?.code).not.toContain(
      'import { useI18n } from "virtual:ai-i18n";',
    );
    expect(vue?.code).toContain('register?module=src%2FuseLabel.ts');
  });

  it('detects React JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true, loading: {} },
      [{ name: 'vite:react-babel' }],
    );
    const react = await transform(
      `const { t: hookT } = useI18n()
export const label = t('React TS')
export const View = () => <p>{hookT('React JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(react?.code).toContain(
      'import { useI18n, t } from "virtual:ai-i18n";',
    );
    expect(react?.code).toContain('register?module=src%2FView.tsx');
  });

  it('reports dynamic arguments with source locations', async () => {
    const warnings: unknown[] = [];
    const { transform } = setupPlugin(warnings, undefined, {
      ...options,
      autoImport: true,
    });
    const result = await transform(
      't(props.label)',
      '/workspace/src/dynamic.ts',
    );
    expect(result?.code).toContain('import { t } from "virtual:ai-i18n";');
    expect(warnings).toMatchObject([
      { id: '/workspace/src/dynamic.ts', loc: { line: 1, column: 0 } },
    ]);
  });

  it('returns a stateless stub and skips transforms for SSR', async () => {
    const warnings: unknown[] = [];
    const { plugin, transform } = setupPlugin(warnings);
    await expect(
      transform(
        "import { t } from 'virtual:ai-i18n'; t('服务端')",
        '/workspace/src/ssr.ts',
        { ssr: true },
      ),
    ).resolves.toBeNull();
    await expect(
      transform(
        "const messages = defineI18nMessages({ save: '保存' })",
        '/workspace/src/ssr-messages.ts',
        { ssr: true },
      ),
    ).resolves.toMatchObject({
      code: "const messages = ({ save: '保存' })",
    });

    const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
    const load = objectHandler<
      (this: unknown, id: string, options: { ssr: boolean }) => Promise<string>
    >(plugin.load);
    const stub = await load.call(
      {
        environment: { name: 'ssr' },
        warn: (value: unknown) => warnings.push(value),
      },
      runtimeId,
      { ssr: true },
    );

    expect(stub).toContain('export const t = (source, ...values)');
    expect(stub).toContain('export const getLangLoadState');
    expect(stub).not.toContain('createI18nRuntime');
    expect(warnings).toHaveLength(1);
  });

  it('uses framework adapters for SSR Hook stub shapes', async () => {
    for (const item of [
      {
        adapter: 'createVueI18nAdapter',
        hook: 'export const { useI18n, tRef } = createVueI18nAdapter(runtime)',
        frameworkPlugin: { name: 'vite:vue' },
        module: '@ai-i18n/vite/vue',
      },
      {
        adapter: 'createReactI18n',
        hook: 'export const useI18n = createReactI18n(runtime)',
        frameworkPlugin: { name: 'vite:react-babel' },
        module: '@ai-i18n/vite/react',
      },
    ]) {
      const { plugin } = setupPlugin([], undefined, options, [
        item.frameworkPlugin,
      ]);
      const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
      const load = objectHandler<
        (
          this: unknown,
          id: string,
          options: { ssr: boolean },
        ) => Promise<string>
      >(plugin.load);
      const stub = await load.call(
        { environment: { name: 'ssr' }, warn: () => {} },
        runtimeId,
        { ssr: true },
      );

      expect(stub).toContain(
        `import { ${item.adapter} } from '${item.module}'`,
      );
      expect(stub).toContain(item.hook);
    }
  });
});
