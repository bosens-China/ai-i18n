import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '../src';
import {
  extractFrameworkSource,
  frameworkTranslationHooks,
} from '../src/framework';

describe('Vue source extraction', () => {
  it('extracts script and template calls with original SFC locations', async () => {
    const source = `<script lang="ts">
import { t as tr } from 'virtual:ai-i18n'
export const scriptText = tr('脚本文案')
</script>
<script setup lang="ts">
const LABEL = '标题'
const { t: translate } = useI18n()
const i18n = useI18n()
const hookText = translate('Hook 文案')
</script>
<template>
  <h1>{{ translate(LABEL, '标题上下文') }}</h1>
  <p :title="i18n.t('提示')">普通文本</p>
  <span title="t('静态属性不提取')">普通 t('文本不提取')</span>
</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/App.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/App.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );
    const messages = result.messages.map((message) => ({
      ...message,
      locations: message.locations.map(extraction.mapLocation),
    }));

    expect(messages.map((message) => message.id)).toEqual([
      '脚本文案',
      'Hook 文案',
      '标题#标题上下文',
      '提示',
    ]);
    expect(messages.map((message) => message.locations[0])).toEqual([
      locationOf(source, "tr('脚本文案')"),
      locationOf(source, "translate('Hook 文案')"),
      locationOf(source, "translate(LABEL, '标题上下文')"),
      locationOf(source, "i18n.t('提示')"),
    ]);
    expect(extraction.registration?.offset).toBe(source.indexOf('\n'));
  });

  it('respects template aliases and local shadowing', async () => {
    const source = `<script setup lang="ts">
const { t: translate } = useI18n()
const items = [() => 'local']
</script>
<template>
  <p>{{ translate('提取别名') }}</p>
  <p>{{ t('组件上下文不提取') }}</p>
  <p v-for="translate in items">{{ translate('循环局部不提取') }}</p>
  <Panel v-slot="{ translate }">{{ translate('插槽局部不提取') }}</Panel>
</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/Scope.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/Scope.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
    );

    expect(result.warnings).toEqual([]);
    expect(result.messages.map((message) => message.source)).toEqual([
      '提取别名',
    ]);
  });

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
});

function locationOf(source: string, value: string) {
  const lines = source.slice(0, source.indexOf(value)).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
