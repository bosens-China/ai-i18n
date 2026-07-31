import { createI18nRuntime } from '@ai-i18n/core';
import type { LangLoadState, LangOption } from '@ai-i18n/core';
import { defineComponent } from 'vue';
import { expect, expectTypeOf, it } from 'vitest';
import { createVueI18nAdapter } from '../src/vue';
import type { I18nComputed } from '../src/vue';

it('preserves Options API instance types after spreading i18n computed getters', () => {
  const adapter = createVueI18nAdapter(
    createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [{ value: 'zh-CN', label: '中文' }],
    }),
  );
  expectTypeOf(adapter.i18nComputed).toEqualTypeOf<I18nComputed>();
  const { i18nComputed, tComputed } = adapter;

  const component = defineComponent({
    data() {
      return { visits: 0 };
    },

    computed: {
      ...i18nComputed(),
      saveLabel: tComputed('保存'),
      labels: tComputed({
        buttons: { cancel: '取消' },
        count: 1,
      } as const),

      summary(): string {
        return `${this.currentLang}:${this.saveLabel}:${this.visits}`;
      },
    },

    watch: {
      currentLang(next: string, previous: string) {
        expectTypeOf(next).toEqualTypeOf<string>();
        expectTypeOf(previous).toEqualTypeOf<string>();
        expectTypeOf(this.currentLang).toEqualTypeOf<string>();
        expectTypeOf(this.isLangLoading).toEqualTypeOf<boolean>();
        expectTypeOf(this.langLoadState).toEqualTypeOf<LangLoadState>();
      },
    },

    methods: {
      inspectInferredTypes() {
        expectTypeOf(this.currentLang).toEqualTypeOf<string>();
        expectTypeOf(this.langs).toEqualTypeOf<readonly LangOption[]>();
        expectTypeOf(this.langLoadState).toEqualTypeOf<LangLoadState>();
        expectTypeOf(this.isLangLoading).toEqualTypeOf<boolean>();
        expectTypeOf(this.langLoadError).toEqualTypeOf<unknown | null>();
        expectTypeOf(this.saveLabel).toEqualTypeOf<string>();
        expectTypeOf(this.labels.buttons.cancel).toEqualTypeOf<string>();
        expectTypeOf(this.labels.count).toEqualTypeOf<1>();
        expectTypeOf(this.summary).toEqualTypeOf<string>();
        // @ts-expect-error currentLang 会保持 string，不能退化为 any。
        const invalidLang: number = this.currentLang;
        // @ts-expect-error 翻译后的文案树叶子会保持 string。
        const invalidLabel: number = this.labels.buttons.cancel;
        void invalidLang;
        void invalidLabel;
      },
    },
  });

  expect(component).toBeDefined();
});
