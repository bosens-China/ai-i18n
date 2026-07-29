import { createI18nRuntime } from '@ai-i18n/core';
import { computed } from 'vue';
import { describe, expect, it } from 'vitest';
import { createVueI18n } from '../src/vue';

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
});
