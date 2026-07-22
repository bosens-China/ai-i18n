import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '@ai-i18n/vite';
import { vue } from '../src/vite';

describe('@ai-i18n/vue/vite', () => {
  it('extracts script and explicit template calls with original SFC locations', () => {
    const source = `<script lang="ts">
import { t as tr } from 'virtual:ai-i18n'
export const scriptText = tr('脚本文案')
</script>
<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'
const LABEL = '标题'
const { t: translate } = useI18n()
export const hookText = translate('Hook 文案')
</script>
<template>
  <h1>{{ t(LABEL, '标题上下文') }}</h1>
  <p :title="t('提示')">普通文本</p>
  <span title="t('静态属性不提取')">普通 t('文本不提取')</span>
</template>`;
    const extraction = vue().extract(source, '/workspace/src/App.vue');
    const result = extractMessages(
      analyzeModule(extraction.analysisCode, 'src/App.vue'),
      undefined,
      extraction.translationHooks,
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
    expect(messages.map((message) => message.locations[0]?.line)).toEqual([
      lineOf(source, "tr('脚本文案')"),
      lineOf(source, "translate('Hook 文案')"),
      lineOf(source, "t(LABEL, '标题上下文')"),
      lineOf(source, "t('提示')"),
    ]);
    expect(extraction.registration.offset).toBe(source.indexOf('\n'));
  });

  it('creates a script setup block when an SFC has no writable script', () => {
    const extraction = vue().extract(
      `<template>{{ t('空脚本') }}</template>`,
      '/workspace/src/Empty.vue',
    );

    expect(extraction.registration).toEqual({
      offset: 0,
      prefix: '<script setup>\n',
      suffix: '</script>\n',
    });
  });
});

function lineOf(source: string, value: string): number {
  return source.slice(0, source.indexOf(value)).split('\n').length;
}
