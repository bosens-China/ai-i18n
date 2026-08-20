import {
  createI18nRuntime,
  createScopedTranslate,
  runtimeMessageId,
} from '@ai-i18n/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReactI18n } from '../src/react';

const reactHooks = vi.hoisted(() => ({
  callback: undefined as unknown,
  dependencies: undefined as readonly unknown[] | undefined,
  subscribe: undefined as ((listener: () => void) => () => unknown) | undefined,
}));

vi.mock('react', () => ({
  useCallback<T>(callback: T, dependencies: readonly unknown[]): T {
    const changed =
      !reactHooks.dependencies ||
      dependencies.length !== reactHooks.dependencies.length ||
      dependencies.some(
        (value, index) => !Object.is(value, reactHooks.dependencies?.[index]),
      );
    if (changed) {
      reactHooks.callback = callback;
      reactHooks.dependencies = [...dependencies];
    }
    return reactHooks.callback as T;
  },
  useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => unknown,
    getSnapshot: () => T,
  ): T {
    reactHooks.subscribe = subscribe;
    return getSnapshot();
  },
}));

beforeEach(() => {
  reactHooks.callback = undefined;
  reactHooks.dependencies = undefined;
  reactHooks.subscribe = undefined;
});

describe('React runtime adapter', () => {
  it('keeps occurrence binding through the React callback', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.tsx', {
      'zh-CN': {},
      'en-US': {
        [runtimeMessageId('App.tsx', '保存', '1:8')]: 'Save this button',
      },
    });
    const useI18n = createReactI18n(
      runtime,
      createScopedTranslate(runtime, 'App.tsx'),
    );

    expect(useI18n().t.__aiI18nAt('1:8')('保存')).toBe('Save this button');
  });

  it('subscribes to Core updates and invalidates cached translations', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.tsx', {
      'zh-CN': { 标题: '标题' },
      'en-US': { 标题: 'Title' },
    });
    const useI18n = createReactI18n(runtime);
    const first = useI18n();
    const listener = vi.fn();
    const unsubscribe = reactHooks.subscribe!(listener);

    expect(first.currentLang).toBe('zh-CN');
    expect(first.t('标题')).toBe('标题');
    await runtime.setLang('en-US');
    expect(listener).toHaveBeenCalledOnce();

    const second = useI18n();
    expect(second.currentLang).toBe('en-US');
    expect(second.t('标题')).toBe('Title');
    expect(
      second.t({
        heading: '标题',
        actions: ['标题'],
        count: 1,
      }),
    ).toEqual({
      heading: 'Title',
      actions: ['Title'],
      count: 1,
    });
    expect(second.t).not.toBe(first.t);

    unsubscribe();
    await runtime.setLang('zh-CN');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('exposes language loading and error snapshots', async () => {
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
    const useI18n = createReactI18n(runtime);

    const idle = useI18n();
    expect(idle).toMatchObject({
      isLangLoading: false,
      langLoadError: null,
    });
    expect(useI18n().langLoadState).toBe(idle.langLoadState);
    const listener = vi.fn();
    const unsubscribe = reactHooks.subscribe!(listener);
    const request = runtime.setLang('en-US');
    expect(listener).toHaveBeenCalledOnce();
    expect(useI18n()).toMatchObject({
      langLoadState: { status: 'loading', targetLang: 'en-US', error: null },
      isLangLoading: true,
      langLoadError: null,
    });

    fail(error);
    await expect(request).rejects.toBe(error);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(useI18n()).toMatchObject({
      langLoadState: { status: 'error', targetLang: 'en-US', error },
      isLangLoading: false,
      langLoadError: error,
    });
    unsubscribe();
  });
});
