import { describe, expect, it, vi } from 'vitest';
import { aiI18n, type AiI18nOptions } from '../src/index';
import { callHook, options, setupPlugin } from './plugin-test-utils';

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
    expect(() =>
      aiI18n({
        ...base,
        translationMemory: { storage: 'remote' as 'json' },
      }),
    ).toThrow('translationMemory.storage must be "json" or "sqlite"');
    expect(() =>
      aiI18n({
        ...base,
        provider: {
          translator: vi.fn(),
          cache: 'always' as 'reuse',
        },
      }),
    ).toThrow('provider.cache must be "reuse" or "fresh"');
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

  it('auto-imports template t when script setup contains TypeScript syntax', async () => {
    const source = `<script setup lang="ts">
const tabs = [{ id: 'setup' }, { id: 'options' }] as const
type Tab = (typeof tabs)[number]['id']
const activeTab: Tab = 'setup'
</script>
<template>{{ t('TypeScript 模板自动导入') }} {{ activeTab }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/TypedTabs.vue');

    expect(result?.code).toContain(
      'import { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('const t = __aiI18nTemplateT;');
    expect(result?.code).toContain('register?module=src%2FTypedTabs.vue');
  });

  it('bridges direct t into Options API templates', async () => {
    const source = `<script lang="ts">
import { t } from 'virtual:ai-i18n'
export default {
  methods: {
    t,
    label() { return t('方法') },
  },
}
</script>
<template>{{ t('模板') }} {{ label() }}</template>`;
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);
    const result = await transform(source, '/workspace/src/Options.vue');

    expect(
      result?.code.match(/import \{ t \} from ['"]virtual:ai-i18n['"];?/g),
    ).toHaveLength(1);
    expect(result?.code).toContain('register?module=src%2FOptions.vue');
  });

  it('auto-imports t exposed through Options methods', async () => {
    const source = `<script lang="ts">
export default {
  methods: { t },
}
</script>
<template>{{ t('模板自动桥接') }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const result = await transform(source, '/workspace/src/AutoOptions.vue');

    expect(result?.code).toContain(
      '<script lang="ts">\nimport { t } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('register?module=src%2FAutoOptions.vue');
  });

  it('auto-imports direct t used by a template-only SFC', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const result = await transform(
      `<template>{{ t('模板自动导入') }}</template>`,
      '/workspace/src/TemplateOnly.vue',
    );

    expect(result?.code).toContain(
      '<script setup>\nimport { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('const t = __aiI18nTemplateT;');
    expect(result?.code).toContain('register?module=src%2FTemplateOnly.vue');
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
});
