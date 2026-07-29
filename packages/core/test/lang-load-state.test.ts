import { describe, expect, it, vi } from 'vitest';
import { createI18nRuntime } from '../src/index';

const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
];

describe('@ai-i18n/core language load state', () => {
  it('exposes the initial lazy default load', async () => {
    let finish!: (messages: Record<string, string>) => void;
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
      localeLoaders: {
        'en-US': () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        'ja-JP': async () => ({}),
      },
    });

    expect(runtime.getLangLoadState()).toEqual({
      status: 'loading',
      targetLang: 'en-US',
      error: null,
    });

    const listener = vi.fn();
    runtime.subscribe(listener);
    finish({});

    await vi.waitFor(() => {
      expect(runtime.getLang()).toBe('en-US');
      expect(runtime.getLangLoadState()).toEqual({
        status: 'idle',
        targetLang: null,
        error: null,
      });
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('publishes loading and error states for the latest request', async () => {
    const error = new Error('offline');
    let fail!: (error: Error) => void;
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
        'ja-JP': async () => ({}),
      },
    });
    const listener = vi.fn();
    runtime.subscribe(listener);

    const request = runtime.setLang('en-US');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'loading',
      targetLang: 'en-US',
      error: null,
    });

    fail(error);
    await expect(request).rejects.toBe(error);
    expect(runtime.getLang()).toBe('zh-CN');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('uses status to distinguish a falsy rejected value from idle', async () => {
    let fail!: (reason?: unknown) => void;
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
        'ja-JP': async () => ({}),
      },
    });

    const request = runtime.setLang('en-US');
    fail(undefined);
    await expect(request).rejects.toBeUndefined();
    expect(runtime.getLangLoadState()).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error: undefined,
    });
  });

  it('clears an error when retrying and returns to idle after success', async () => {
    const pending: Array<{
      resolve: (messages: Record<string, string>) => void;
      reject: (reason: unknown) => void;
    }> = [];
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': () =>
          new Promise<Record<string, string>>((resolve, reject) => {
            pending.push({ resolve, reject });
          }),
        'ja-JP': async () => ({}),
      },
    });

    const first = runtime.setLang('en-US');
    pending[0]!.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect(runtime.getLangLoadState().status).toBe('error');

    const retry = runtime.setLang('en-US');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'loading',
      targetLang: 'en-US',
      error: null,
    });
    pending[1]!.resolve({});
    await retry;
    expect(runtime.getLangLoadState()).toEqual({
      status: 'idle',
      targetLang: null,
      error: null,
    });
  });

  it('does not let a stale failure replace the latest state', async () => {
    const pending = new Map<
      string,
      {
        resolve: (messages: Record<string, string>) => void;
        reject: (error: Error) => void;
      }
    >();
    const loader = (locale: string) => () =>
      new Promise<Record<string, string>>((resolve, reject) => {
        pending.set(locale, { resolve, reject });
      });
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': loader('en-US'),
        'ja-JP': loader('ja-JP'),
      },
    });

    const english = runtime.setLang('en-US');
    const japanese = runtime.setLang('ja-JP');
    expect(runtime.getLangLoadState()).toMatchObject({
      status: 'loading',
      targetLang: 'ja-JP',
    });

    pending.get('en-US')!.reject(new Error('stale'));
    await expect(english).rejects.toThrow('stale');
    expect(runtime.getLangLoadState()).toMatchObject({
      status: 'loading',
      targetLang: 'ja-JP',
    });

    pending.get('ja-JP')!.resolve({});
    await japanese;
    expect(runtime.getLang()).toBe('ja-JP');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'idle',
      targetLang: null,
      error: null,
    });
  });

  it('does not let a stale success clear the latest failure', async () => {
    const pending = new Map<
      string,
      {
        resolve: (messages: Record<string, string>) => void;
        reject: (error: Error) => void;
      }
    >();
    const loader = (locale: string) => () =>
      new Promise<Record<string, string>>((resolve, reject) => {
        pending.set(locale, { resolve, reject });
      });
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': loader('en-US'),
        'ja-JP': loader('ja-JP'),
      },
    });

    const english = runtime.setLang('en-US');
    const japanese = runtime.setLang('ja-JP');
    pending.get('en-US')!.resolve({});
    await english;
    expect(runtime.getLangLoadState()).toMatchObject({
      status: 'loading',
      targetLang: 'ja-JP',
    });

    const error = new Error('latest');
    pending.get('ja-JP')!.reject(error);
    await expect(japanese).rejects.toBe(error);
    expect(runtime.getLang()).toBe('zh-CN');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'error',
      targetLang: 'ja-JP',
      error,
    });
  });

  it('keeps immutable state snapshots stable until a transition', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
    });
    const first = runtime.getLangLoadState();

    expect(Object.isFrozen(first)).toBe(true);
    expect(runtime.getLangLoadState()).toBe(first);
    await runtime.setLang('zh-CN');
    expect(runtime.getLangLoadState()).toBe(first);
  });
});
