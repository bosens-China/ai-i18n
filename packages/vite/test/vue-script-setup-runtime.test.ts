import { compileScript, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import { options, setupPlugin } from './plugin-test-utils';

describe('Vue script setup Runtime boundaries', () => {
  it('keeps auto-imported t usable from hoisted script-setup macro defaults', async () => {
    const source = `<script setup lang="ts">
interface Props { searchText?: string }
withDefaults(defineProps<Props>(), { searchText: t('查询') })
</script>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/SearchButtons.vue');
    const descriptor = parse(result!.code, {
      filename: 'SearchButtons.vue',
    }).descriptor;

    expect(descriptor.scriptSetup?.content).toContain(
      'import { t } from "virtual:ai-i18n";',
    );
    expect(() =>
      compileScript(descriptor, { id: 'macro-defaults' }),
    ).not.toThrow();
  });

  it('keeps an explicit aliased import used by a hoisted macro default', async () => {
    const source = `<script setup lang="ts">
import { t as translate } from 'virtual:ai-i18n'
interface Props { searchText?: string }
withDefaults(defineProps<Props>(), { searchText: translate('查询') })
</script>`;
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);

    const result = await transform(
      source,
      '/workspace/src/ExplicitSearchButtons.vue',
    );
    const descriptor = parse(result!.code, {
      filename: 'ExplicitSearchButtons.vue',
    }).descriptor;

    expect(descriptor.scriptSetup?.content).toContain(
      "import { t as translate } from 'virtual:ai-i18n'",
    );
    expect(descriptor.scriptSetup?.content).not.toContain(
      'const translate = __aiI18nPrimaryScope.t;',
    );
    expect(() =>
      compileScript(descriptor, { id: 'explicit-macro-defaults' }),
    ).not.toThrow();
  });

  it('keeps an inlined explicit import inside dual-script setup scope', async () => {
    const source = `<script lang="ts">
export default { name: 'DualExplicit' }
</script>
<script setup lang="ts">
import { t } from 'virtual:ai-i18n'
const label = t('脚本文案')
</script>
<template>{{ label }} / {{ t('模板文案') }}</template>`;
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);

    const result = await transform(source, '/workspace/src/DualExplicit.vue');
    const descriptor = parse(result!.code, {
      filename: 'DualExplicit.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, {
      id: 'dual-explicit',
      inlineTemplate: true,
    });

    expect(descriptor.script?.content).not.toContain(
      'const t = __aiI18nPrimaryScope.t;',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const t = __aiI18nTemplateScope.t;',
    );
    expect(compiled.content).toContain(
      '_unref(t).__aiI18nAt("8:27")(\'模板文案\')',
    );
  });

  it('uses a local setup bridge for an auto-imported template t', async () => {
    const source = `<script setup lang="ts">
const ready = true
</script>
<template>{{ ready && t('setup 自动导入') }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/Setup.vue');
    const descriptor = parse(result!.code, {
      filename: 'Setup.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, { id: 'setup' });

    expect(descriptor.scriptSetup?.content).toContain(
      'import * as __aiI18nPrimaryRuntime from "virtual:ai-i18n/internal";',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const __aiI18nTemplateT = __aiI18nPrimaryScope.t;',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const t = __aiI18nTemplateT;',
    );
    expect(compiled.content).toMatch(/const __returned__ = \{[^}]*\bt\b/);
    expect(compiled.content).not.toContain('get t() { return t }');
  });

  it('injects dual-script APIs at module scope and template t into setup', async () => {
    const source = `<script>
const scriptLang = getLang()
export default { data: () => ({ scriptLang }) }
</script>
<script setup>
const setupResult = setLang('en-US')
</script>
<template>{{ t('双 script') }} {{ scriptLang }} {{ setupResult }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/Dual.vue');
    const descriptor = parse(result!.code, {
      filename: 'Dual.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, { id: 'dual' });

    expect(descriptor.script?.content).toContain(
      'import * as __aiI18nPrimaryRuntime from "virtual:ai-i18n/internal";',
    );
    expect(descriptor.script?.content).toContain(
      'const setLang = __aiI18nPrimaryRuntime.setLang;',
    );
    expect(descriptor.script?.content).toContain(
      'const getLang = __aiI18nPrimaryRuntime.getLang;',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'import * as __aiI18nTemplateRuntime from "virtual:ai-i18n/internal";',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const __aiI18nTemplateT = __aiI18nTemplateScope.t;',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const t = __aiI18nTemplateT;',
    );
    expect(compiled.content).toContain('const scriptLang = getLang()');
    expect(compiled.content).toContain("const setupResult = setLang('en-US')");
    expect(compiled.content).toMatch(/const __returned__ = \{[^}]*\bt\b/);
    expect(compiled.content).not.toContain('get t() { return t }');
  });

  it('keeps setup locals from shadowing ordinary-script auto imports', async () => {
    const source = `<script>
const result = setLang('en-US')
export default { data: () => ({ result }) }
</script>
<script setup>
const setLang = (value) => value
</script>
<template>{{ result }} {{ setLang('local') }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/DualShadow.vue');
    const descriptor = parse(result!.code, {
      filename: 'DualShadow.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, { id: 'dual-shadow' });

    expect(descriptor.script?.content).toContain(
      'const setLang = __aiI18nPrimaryRuntime.setLang;',
    );
    expect(descriptor.scriptSetup?.content).not.toContain(
      'const setLang = __aiI18nTemplateRuntime.setLang;',
    );
    expect(compiled.content).toContain("const result = setLang('en-US')");
    expect(compiled.content).toContain('const setLang = (value) => value');
  });
});
