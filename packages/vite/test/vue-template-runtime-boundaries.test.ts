import { describe, expect, it } from 'vitest';
import { compileScript, parse } from '@vue/compiler-sfc';
import { analyzeModule, extractMessages } from '../src';
import {
  extractFrameworkSource,
  frameworkTranslationHooks,
} from '../src/framework';
import { options, setupPlugin } from './plugin-test-utils';

describe('Vue Options template Runtime boundaries', () => {
  it.each([
    [
      'an explicit import without a methods bridge',
      `<script>
import { t } from 'virtual:ai-i18n'
export default {}
</script>
<template>{{ t('显式 import 不建桥') }}</template>`,
    ],
    [
      'an identifier default export',
      `<script>
const options = {}
export default options
</script>
<template>{{ t('动态 Options 不提取') }}</template>`,
    ],
    [
      'a local method in an auto-imported defineComponent',
      `<script>
export default defineComponent({
  methods: {
    t(value) { return value },
  },
})
</script>
<template>{{ t('本地方法不提取') }}</template>`,
    ],
    [
      'an ambiguous nested methods object',
      `<script>
const extra = {}
export default defineComponent({ methods: { ...extra } })
</script>
<template>{{ t('动态 methods 不提取') }}</template>`,
    ],
  ])('does not extract template t for %s', async (_, source) => {
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Boundary.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Boundary.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
      true,
    );

    expect(result.messages).toEqual([]);
    expect(extraction.templateImports).toBeUndefined();
    expect(extraction.templateAutoImportCandidates).toBeUndefined();
  });

  it('extracts a safe bare defineComponent template as an auto-import candidate', async () => {
    const source = `<script>
export default defineComponent({ name: 'OptionsPanel' })
</script>
<template>{{ t('裸 defineComponent') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/BareDefineComponent.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/BareDefineComponent.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
      true,
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '裸 defineComponent',
    ]);
    expect(extraction.templateAutoImportCandidates).toEqual(['t']);
  });

  it('keeps explicit Options imports inert without a methods bridge', async () => {
    const source = `<script>
import { t } from 'virtual:ai-i18n'
export default {}
</script>
<template>{{ t('显式模式不注入') }}</template>`;
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);

    await expect(
      transform(source, '/workspace/src/ExplicitOptions.vue'),
    ).resolves.toBeNull();
  });

  it.each([
    [
      'an ambiguous default export',
      `<script>
const options = {}
export default options
</script>
<template>{{ t('动态 Options 不注入') }}</template>`,
    ],
    [
      'a local t method',
      `<script>
export default defineComponent({
  methods: { t(value) { return value } },
})
</script>
<template>{{ t('本地方法不注入') }}</template>`,
    ],
    [
      'an ambiguous default export beside script setup',
      `<script>
const options = {}
export default options
</script>
<script setup>const ready = true</script>
<template>{{ ready && t('混合 SFC 不注入') }}</template>`,
    ],
  ])('does not auto-import template t for %s', async (_, source) => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    await expect(
      transform(source, '/workspace/src/ShadowedOptions.vue'),
    ).resolves.toBeNull();
  });

  it('auto-imports template t for a safe bare defineComponent', async () => {
    const source = `<script>
export default defineComponent({ name: 'OptionsPanel' })
</script>
<template>{{ t('裸 defineComponent 自动导入') }}</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(
      source,
      '/workspace/src/BareDefineComponent.vue',
    );

    expect(result?.code).toContain(
      '<script setup>\nimport { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('const t = __aiI18nTemplateT;');
    expect(result?.code).toContain(
      'register?module=src%2FBareDefineComponent.vue',
    );

    const descriptor = parse(result!.code, {
      filename: 'BareDefineComponent.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, {
      id: 'bare-define-component',
    });
    expect(descriptor.script?.content).not.toContain('import { t }');
    expect(compiled.content).toMatch(/const __returned__ = \{[^}]*\bt\b/);
    expect(compiled.content).not.toContain('get t() { return t }');
  });

  it('auto-imports template t beside the Options i18n computed helpers', async () => {
    const source = `<script lang="ts">
import { i18nComputed as runtimeState, setLang, tComputed } from 'virtual:ai-i18n'
import { defineComponent } from 'vue'

export default defineComponent({
  computed: {
    ...runtimeState(),
    translatedMessage: tComputed('响应式文案'),
    languageTransition(): string {
      return t('尚未发生语言变化')
    },
  },
  methods: {
    async switchLanguage(locale: string): Promise<void> {
      await setLang(locale)
    },
  },
})
</script>
<template>
  <p>{{ t('完整兼容') }} · {{ translatedMessage }} · {{ currentLang }}</p>
</template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );

    const result = await transform(source, '/workspace/src/OptionsPanel.vue');
    const descriptor = parse(result!.code, {
      filename: 'OptionsPanel.vue',
    }).descriptor;
    const compiled = compileScript(descriptor, { id: 'options-panel' });

    expect(descriptor.script?.content).toContain(
      'import { t } from "virtual:ai-i18n";',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'import { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'const t = __aiI18nTemplateT;',
    );
    expect(compiled.content).toMatch(/const __returned__ = \{[^}]*\bt\b/);
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
      'import { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
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

    expect(descriptor.script?.content).toMatch(
      /import \{ (?=[^}]*\bgetLang\b)(?=[^}]*\bsetLang\b)[^}]+ \} from "virtual:ai-i18n";/,
    );
    expect(descriptor.scriptSetup?.content).toContain(
      'import { t as __aiI18nTemplateT } from "virtual:ai-i18n";',
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
      'import { setLang } from "virtual:ai-i18n";',
    );
    expect(descriptor.scriptSetup?.content).not.toContain(
      'import { setLang } from "virtual:ai-i18n";',
    );
    expect(compiled.content).toContain("const result = setLang('en-US')");
    expect(compiled.content).toContain('const setLang = (value) => value');
  });
});
