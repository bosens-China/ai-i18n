import { createI18nRuntime } from '@ai-i18n/core';
import { computed } from 'vue';
import { describe, expect, it, vi } from 'vitest';
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

  it('reacts after a lazy locale finishes loading', async () => {
    let finish!: (messages: { 标题: string }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ 标题: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      localeLoaders: { 'en-US': loader },
    });
    runtime.registerModule('App.vue', { 'zh-CN': { 标题: '标题' } });
    const i18n = createVueI18n(runtime)();
    const text = computed(() => i18n.t('标题'));

    const switching = i18n.setLang('en-US');
    expect(text.value).toBe('标题');
    finish({ 标题: 'Title' });
    await switching;
    expect(i18n.currentLang.value).toBe('en-US');
    expect(text.value).toBe('Title');
    expect(loader).toHaveBeenCalledOnce();
  });
});
