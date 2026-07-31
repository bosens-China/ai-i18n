import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '../src';
import {
  extractFrameworkSource,
  frameworkTranslationHooks,
} from '../src/framework';
import { locationOf } from './vue-extraction-test-utils';

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
  <h1>{{ translate(LABEL, { comment: '标题上下文' }) }}</h1>
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
      locationOf(source, "translate(LABEL, { comment: '标题上下文' })"),
      locationOf(source, "i18n.t('提示')"),
    ]);
    expect(extraction.registration?.offset).toBe(
      source.indexOf('\n', source.indexOf('<script lang="ts">')),
    );
    expect(extraction.templateRegistration?.offset).toBe(
      source.indexOf('\n', source.indexOf('<script setup')),
    );
  });

  it('extracts direct t calls from Options API scripts and templates', async () => {
    const source = `<script lang="ts">
import { defineComponent } from 'vue'
import { t } from 'virtual:ai-i18n'
export default defineComponent({
  computed: {
    label() { return t('计算属性') },
  },
  methods: {
    t,
    notify() { return t('方法') },
  },
})
</script>
<template>
  <button :title="label" @click="notify">{{ t('模板') }}</button>
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
      frameworkTranslationHooks('vue', false),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '计算属性',
      '方法',
      '模板',
    ]);
    expect(extraction.templateImports).toBeUndefined();
    expect(
      result.messages.map((message) =>
        extraction.mapLocation(message.locations[0]!),
      ),
    ).toEqual([
      locationOf(source, "t('计算属性')"),
      locationOf(source, "t('方法')"),
      locationOf(source, "t('模板')"),
    ]);
  });

  it('extracts an aliased runtime t exposed as an Options method', async () => {
    const source = `<script lang="ts">
import { defineComponent } from 'vue'
import { t as translateWithLongName } from 'virtual:ai-i18n'
export default defineComponent({
  methods: {
    t: translateWithLongName,
  },
})
</script>
<template>{{ t('模板别名桥接') }} · {{ t('别名后的定位') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/AliasedOptions.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/AliasedOptions.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', false),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '模板别名桥接',
      '别名后的定位',
    ]);
    expect(extraction.templateImports).toBeUndefined();
    expect(
      result.messages.map((message) =>
        extraction.mapLocation(message.locations[0]!),
      ),
    ).toEqual([
      locationOf(source, "t('模板别名桥接')"),
      locationOf(source, "t('别名后的定位')"),
    ]);
  });

  it('extracts an auto-imported t exposed as an Options method', async () => {
    const source = `<script lang="ts">
export default {
  methods: {
    t,
  },
}
</script>
<template>{{ t('模板自动桥接') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/AutoOptions.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/AutoOptions.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
      true,
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '模板自动桥接',
    ]);
    expect(extraction.templateAutoImportCandidates).toBeUndefined();
    expect(extraction.mapLocation(result.messages[0]!.locations[0]!)).toEqual(
      locationOf(source, "t('模板自动桥接')"),
    );
  });

  it('keeps a local Options method shorthand shadowed', async () => {
    const source = `<script>
const t = (value) => value
export default {
  methods: {
    t,
  },
}
</script>
<template>{{ t('本地方法不提取') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/LocalOptions.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/LocalOptions.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
      true,
    );

    expect(result.messages).toEqual([]);
  });

  it.each([
    ['before', '...extra,\n  methods: { t },'],
    ['after', 'methods: { t },\n  ...extra,'],
  ])(
    'keeps dynamic template arguments local with a root spread %s methods',
    async (_, options) => {
      const source = `<script>
const extra = {}
export default {
  ${options}
}
</script>
<template>{{ t(props.label) }}</template>`;
      const extraction = (await extractFrameworkSource(
        source,
        '/workspace/src/SpreadOptions.vue',
        'vue',
      ))!;
      const result = extractMessages(
        analyzeModule(
          extraction.analysisCode,
          'src/SpreadOptions.vue',
          undefined,
          extraction.analysisLang,
        ),
        undefined,
        frameworkTranslationHooks('vue', true),
        true,
      );

      expect(result).toMatchObject({ messages: [], warnings: [] });
      expect(extraction.templateAutoImportCandidates).toBeUndefined();
      expect(extraction.templateImports).toBeUndefined();
    },
  );

  it('extracts tComputed calls from pure Options API computed entries', async () => {
    const source = `<script lang="ts">
import { defineComponent } from 'vue'
import { i18nComputed, tComputed as translated } from 'virtual:ai-i18n'
export default defineComponent({
  computed: {
    ...i18nComputed(),
    label: translated('保存'),
    greeting: translated\`你好 \${name}\`,
    labels: translated({ cancel: '取消', states: ['等待中'] }),
  },
})
</script>
<template>{{ label }} · {{ currentLang }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/OptionsComputed.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/OptionsComputed.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', false),
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '保存',
      '你好 {{0}}',
      '取消',
      '等待中',
    ]);
    expect(
      result.messages.map((message) =>
        extraction.mapLocation(message.locations[0]!),
      ),
    ).toEqual([
      locationOf(source, "translated('保存')"),
      locationOf(source, 'translated`你好 ${name}`'),
      locationOf(source, "translated({ cancel: '取消'"),
      locationOf(source, "translated({ cancel: '取消'"),
    ]);
  });

  it('extracts a template-only t through Vue auto import', async () => {
    const source = `<template>{{ t('模板自动导入') }}</template>`;
    const extraction = (await extractFrameworkSource(
      source,
      '/workspace/src/TemplateOnly.vue',
      'vue',
    ))!;
    const result = extractMessages(
      analyzeModule(
        extraction.analysisCode,
        'src/TemplateOnly.vue',
        undefined,
        extraction.analysisLang,
      ),
      undefined,
      frameworkTranslationHooks('vue', true),
      true,
    );

    expect(result.messages.map((message) => message.source)).toEqual([
      '模板自动导入',
    ]);
    expect(extraction.templateAutoImportCandidates).toEqual(['t']);
    expect(extraction.mapLocation(result.messages[0]!.locations[0]!)).toEqual(
      locationOf(source, "t('模板自动导入')"),
    );
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
});
