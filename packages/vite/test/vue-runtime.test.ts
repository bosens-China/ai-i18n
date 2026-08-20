import {
  createI18nRuntime,
  createScopedTranslate,
  runtimeMessageId,
} from '@ai-i18n/core';
import { computed, isReadonly, ref, watch } from 'vue';
import { describe, expect, it } from 'vitest';
import { createVueI18n, createVueI18nAdapter } from '../src/vue';

describe('Vue runtime adapter', () => {
  it('keeps occurrence binding through tracked translation helpers', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.vue', {
      'zh-CN': {},
      'en-US': {
        [runtimeMessageId('App.vue', '保存', '2:10')]: 'Save this button',
      },
    });
    const adapter = createVueI18nAdapter(
      runtime,
      createScopedTranslate(runtime, 'App.vue'),
    );

    expect(adapter.t.__aiI18nAt('2:10')('保存')).toBe('Save this button');
    expect(adapter.tRef.__aiI18nAt('2:10')('保存').value).toBe(
      'Save this button',
    );
    expect(adapter.tComputed.__aiI18nAt('2:10')('保存')()).toBe(
      'Save this button',
    );
  });

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

  it('makes the standalone Vue t reactive in computed render paths', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('Options.vue', {
      'zh-CN': { 保存: '保存' },
      'en-US': { 保存: 'Save' },
    });
    const { t } = createVueI18nAdapter(runtime);
    const label = computed(() => t('保存'));

    expect(label.value).toBe('保存');
    await runtime.setLang('en-US');
    expect(label.value).toBe('Save');
  });

  it('exposes fresh Options computed getters backed by shared reactive state', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('Options.vue', {
      'zh-CN': {
        保存: '保存',
        '你好 {{0}}': '你好 {{0}}',
        取消: '取消',
      },
      'en-US': {
        保存: 'Save',
        '你好 {{0}}': 'Hello {{0}}',
        取消: 'Cancel',
      },
    });
    const adapter = createVueI18nAdapter(runtime);
    const first = adapter.i18nComputed();
    const second = adapter.i18nComputed();
    const firstComposable = adapter.useI18n();
    const secondComposable = adapter.useI18n();
    const currentLang = computed(first.currentLang);
    const label = computed(adapter.tComputed('保存'));
    const name = ref('Ada');
    const greeting = computed(adapter.tComputed`你好 ${name}`);
    const labels = computed(adapter.tComputed({ cancel: '取消' }));
    const changes: string[] = [];
    const stop = watch(
      currentLang,
      (next, previous) => changes.push(`${previous}->${next}`),
      { flush: 'sync' },
    );

    expect(first).not.toBe(second);
    expect(first.currentLang).not.toBe(second.currentLang);
    expect(first.langs()).toHaveLength(2);
    expect(firstComposable.currentLang).toBe(secondComposable.currentLang);
    expect(firstComposable.langLoadState).toBe(secondComposable.langLoadState);
    expect(currentLang.value).toBe('zh-CN');
    expect(label.value).toBe('保存');
    expect(greeting.value).toBe('你好 Ada');
    expect(labels.value.cancel).toBe('取消');

    name.value = 'Lin';
    expect(greeting.value).toBe('你好 Lin');
    await runtime.setLang('en-US');
    expect(currentLang.value).toBe('en-US');
    expect(label.value).toBe('Save');
    expect(greeting.value).toBe('Hello Lin');
    expect(labels.value.cancel).toBe('Cancel');
    expect(changes).toEqual(['zh-CN->en-US']);
    stop();
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
    const adapter = createVueI18nAdapter(runtime);
    const i18n = adapter.useI18n();
    const optionsState = adapter.i18nComputed();
    const optionsLoadState = computed(optionsState.langLoadState);
    const optionsLoading = computed(optionsState.isLangLoading);
    const optionsError = computed(optionsState.langLoadError);

    const request = i18n.setLang('en-US');
    expect(i18n.langLoadState.value).toMatchObject({
      status: 'loading',
      targetLang: 'en-US',
    });
    expect(i18n.isLangLoading.value).toBe(true);
    expect(i18n.langLoadError.value).toBeNull();
    expect(optionsLoadState.value.status).toBe('loading');
    expect(optionsLoading.value).toBe(true);
    expect(optionsError.value).toBeNull();

    fail(error);
    await expect(request).rejects.toBe(error);
    expect(i18n.langLoadState.value).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error,
    });
    expect(i18n.isLangLoading.value).toBe(false);
    expect(i18n.langLoadError.value).toBe(error);
    expect(optionsLoadState.value).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error,
    });
    expect(optionsLoading.value).toBe(false);
    expect(optionsError.value).toBe(error);
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

  it('creates one computed ref for a static message tree', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.vue', {
      'zh-CN': { 保存: '保存', 取消: '取消', 等待中: '等待中' },
      'en-US': { 保存: 'Save', 取消: 'Cancel', 等待中: 'Pending' },
    });
    const { tRef } = createVueI18nAdapter(runtime);
    const labels = tRef({
      buttons: { save: '保存', cancel: '取消' },
      states: ['等待中'],
      count: 1,
    });

    expect(isReadonly(labels)).toBe(true);
    expect(labels.value.buttons.save).toBe('保存');
    await runtime.setLang('en-US');
    expect(labels.value).toEqual({
      buttons: { save: 'Save', cancel: 'Cancel' },
      states: ['Pending'],
      count: 1,
    });
  });
});
