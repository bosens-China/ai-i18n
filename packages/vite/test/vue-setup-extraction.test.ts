import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '../src';
import {
  extractFrameworkSource,
  frameworkTranslationHooks,
} from '../src/framework';
import { locationOf } from './vue-extraction-test-utils';

describe('Vue setup source extraction', () => {
  it('keeps script and script-setup bindings in their actual scopes', async () => {
    const source = `<script lang="ts">
const LABEL = '普通脚本'
</script>
<script setup lang="ts">
const { t } = useI18n()
const LABEL = 'setup 脚本'
</script>
<template>{{ t(LABEL) }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Dual.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Dual.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );

    expect(result.warnings).toEqual([]);
    expect(result.messages).toMatchObject([{ source: 'setup 脚本' }]);
  });

  it('extracts translations returned from an ordinary setup function', async () => {
    const source = `<script lang="ts">
export default {
  setup() {
    const { t: localT } = useI18n()
    const translate = localT
    const i18n = useI18n()
    const translator = i18n
    return { translate, api: translator }
  },
}
</script>
<template>
  <p>{{ translate('普通 setup') }}</p>
  <p>{{ api.t('对象返回') }}</p>
</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Options.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Options.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '普通 setup',
      '对象返回',
    ]);
    expect(
      result.messages.map((message) =>
        extraction.mapLocation(message.locations[0]!),
      ),
    ).toEqual([
      locationOf(source, "translate('普通 setup')"),
      locationOf(source, "api.t('对象返回')"),
    ]);
  });

  it('supports defineComponent setup without treating Options methods as t', async () => {
    const source = `<script lang="ts">
import { defineComponent } from 'vue'
import { useI18n } from 'virtual:ai-i18n'
export default defineComponent({
  setup() {
    const { t: translate } = useI18n()
    return { translate }
  },
  methods: {
    t(value: string) { return value },
    label() { return this.t('this 不提取') },
  },
})
</script>
<template>
  <p>{{ translate('defineComponent setup') }}</p>
  <p>{{ t('Options method 不提取') }}</p>
</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Defined.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Defined.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', false),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      'defineComponent setup',
    ]);
  });

  it('ignores local, runtime, and ambiguous method bindings returned as t', async () => {
    const source = `<script>
import { t as runtimeT, useI18n } from 'virtual:ai-i18n'
export default {
  setup() {
    const localT = (value) => value
    const { t } = useI18n()
    return { localT, runtimeT, t }
  },
  methods: {
    t(value) { return value },
  },
}
</script>
<template>
  {{ localT('局部不提取') }}
  {{ runtimeT('顶层 runtime 不提取') }}
  {{ t('同名 method 不提取') }}
</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Unsupported.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Unsupported.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', false),
    );

    expect(result.messages).toEqual([]);
  });

  it('rejects setup bindings with conditional return shapes', async () => {
    const source = `<script>
export default {
  setup(useLocal) {
    const localT = (value) => value
    const { t } = useI18n()
    if (useLocal) return { t: localT }
    return { t }
  },
}
</script>
<template>{{ t('条件返回不提取') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Conditional.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Conditional.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );

    expect(result.messages).toEqual([]);
  });

  it('maps an ordinary setup template on the same line as its tags', async () => {
    const source =
      "<script>export default { setup() { const { t } = useI18n(); return { t } } }</script><template>{{ t('同行模板') }}</template>";
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Inline.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Inline.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );

    expect(result.messages).toHaveLength(1);
    expect(extraction.mapLocation(result.messages[0]!.locations[0]!)).toEqual(
      locationOf(source, "t('同行模板')"),
    );
  });

  it('keeps non-HTML ordinary templates on the script-only path', async () => {
    const source = `<script>
import { t } from 'virtual:ai-i18n'
export const label = t('脚本文案')
</script>
<template lang="pug">p {{ t('Pug 模板不分析') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Pug.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Pug.vue',
        undefined,
        extraction.analysisLang,
      ),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '脚本文案',
    ]);
  });

  it('creates a script setup block when an SFC has no writable script', async () => {
    const extraction = await extractFrameworkSource(
      `<template>{{ t('空脚本') }}</template>`,
      '/workspace/src/Empty.vue',
      'vue',
    );

    expect(extraction?.registration).toEqual({
      offset: 0,
      prefix: '<script setup>\n',
      suffix: '</script>\n',
    });
  });

  it('resolves imported props and emits types through the host Vue compiler', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-vue-types-'));
    await fs.writeFile(
      path.join(root, 'contracts.ts'),
      `export interface PanelProps {
  label: string
}
export interface PanelEmits {
  save: [value: string]
}`,
    );
    const source = `<script setup lang="ts">
import type { PanelEmits, PanelProps } from './contracts'
defineProps<PanelProps>()
defineEmits<PanelEmits>()
</script>`;

    try {
      await expect(
        extractFrameworkSource(source, path.join(root, 'Panel.vue'), 'vue'),
      ).resolves.toMatchObject({ analysisLang: 'ts' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
