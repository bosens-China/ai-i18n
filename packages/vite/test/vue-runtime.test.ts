import { createI18nRuntime } from '@ai-i18n/core';
import { computed, isReadonly, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createVueI18n, createVueI18nAdapter } from '../src/vue';

describe('Vue runtime adapter', () => {
  it('updates computed language and translated text', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.vue', {
      'zh-CN': { 标题: '标题' },
      'en-US': { 标题: 'Title' },
    });
    const i18n = createVueI18n(runtime)();
    const text = computed(() => i18n.t('标题'));

    expect(i18n.currentLang.value).toBe('zh-CN');
    expect(text.value).toBe('标题');
    await i18n.setLang('en-US');
    expect(i18n.currentLang.value).toBe('en-US');
    expect(text.value).toBe('Title');
    expect(i18n.langs.value).toHaveLength(2);
  });

  it('exposes reactive language loading and error state', async () => {
    const error = new Error('offline');
    let fail!: (error: Error) => void;
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      localeLoaders: {
        'en-US': () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      },
    });
    const i18n = createVueI18n(runtime)();

    const request = i18n.setLang('en-US');
    expect(i18n.langLoadState.value).toMatchObject({
      status: 'loading',
      targetLang: 'en-US',
    });
    expect(i18n.isLangLoading.value).toBe(true);
    expect(i18n.langLoadError.value).toBeNull();

    fail(error);
    await expect(request).rejects.toBe(error);
    expect(i18n.langLoadState.value).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error,
    });
    expect(i18n.isLangLoading.value).toBe(false);
    expect(i18n.langLoadError.value).toBe(error);
  });

  it('creates a readonly translated ref that follows language and Ref values', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.vue', {
      'zh-CN': { 保存: '保存' },
      'en-US': { 保存: 'Save' },
    });
    const { tRef } = createVueI18nAdapter(runtime);
    const label = tRef('保存');
    const name = ref('Ada');
    const greeting = tRef`你好 ${name}`;

    expect(isReadonly(label)).toBe(true);
    expect(label.value).toBe('保存');
    expect(greeting.value).toBe('你好 Ada');

    name.value = 'Lin';
    expect(greeting.value).toBe('你好 Lin');
    await runtime.setLang('en-US');
    expect(label.value).toBe('Save');
  });
});
