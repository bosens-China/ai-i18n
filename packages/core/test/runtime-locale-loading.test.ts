import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18nRuntime } from '../src/index';
import { lazyLocales, locales } from './runtime-test-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('@ai-i18n/core runtime locale loading', () => {
  it('loads target locales once and keeps source fallback until commit', async () => {
    let finish!: (messages: { 保存: string; 缺失: null }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ 保存: string; 缺失: null }>((resolve) => {
          finish = resolve;
        }),
    );
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: { 'en-US': loader },
    });
    runtime.registerModule('src/app.ts', {
      'zh-CN': { 保存: '保存', 缺失: '缺失' },
    });
    const listener = vi.fn();
    runtime.subscribe(listener);

    await runtime.setLang('zh-CN');
    expect(loader).not.toHaveBeenCalled();
    const first = runtime.setLang('en-US');
    const second = runtime.setLang('en-US');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(runtime.getLang()).toBe('zh-CN');
    expect(runtime.t('保存')).toBe('保存');

    finish({ 保存: 'Save', 缺失: null });
    await Promise.all([first, second]);
    expect(runtime.getLang()).toBe('en-US');
    expect(runtime.t('保存')).toBe('Save');
    expect(runtime.t('缺失')).toBe('缺失');
    expect(listener).toHaveBeenCalledTimes(2);
    await runtime.setLang('zh-CN');
    await runtime.setLang('en-US');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('uses the last language request and keeps failed loads atomic', async () => {
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
      locales: lazyLocales,
      localeLoaders: {
        'en-US': loader('en-US'),
        'ja-JP': loader('ja-JP'),
      },
    });
    runtime.registerModule('src/app.ts', { 'zh-CN': { 保存: '保存' } });

    const english = runtime.setLang('en-US');
    const japanese = runtime.setLang('ja-JP');
    pending.get('en-US')!.resolve({ 保存: 'Save' });
    await english;
    expect(runtime.getLang()).toBe('zh-CN');
    pending.get('ja-JP')!.resolve({ 保存: '保存する' });
    await japanese;
    expect(runtime.getLang()).toBe('ja-JP');

    await runtime.setLang('zh-CN');
    const retryRuntime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: {
        'en-US': async () => {
          throw new Error('offline');
        },
      },
    });
    await expect(retryRuntime.setLang('en-US')).rejects.toThrow('offline');
    expect(retryRuntime.getLang()).toBe('zh-CN');
  });

  it('loads a target default in the background and ignores HMR for unloaded locales', async () => {
    const listener = vi.fn();
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
      localeLoaders: { 'en-US': async () => ({ 标题: 'Title' }) },
    });
    runtime.registerModule('src/app.ts', { 'zh-CN': { 标题: '标题' } });
    runtime.subscribe(listener);

    expect(runtime.getLang()).toBe('zh-CN');
    expect(runtime.t('标题')).toBe('标题');
    await vi.waitFor(() => expect(runtime.getLang()).toBe('en-US'));
    expect(runtime.t('标题')).toBe('Title');
    expect(runtime.replaceLocale('en-US', { 标题: 'Heading' })).toBe(true);
    expect(runtime.t('标题')).toBe('Heading');

    const unloaded = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      localeLoaders: { 'en-US': async () => ({ 标题: 'Title' }) },
    });
    expect(unloaded.replaceLocale('en-US', { 标题: 'Ignored' })).toBe(false);
    await unloaded.setLang('en-US');
    expect(unloaded.t('标题')).toBe('Ignored');
    expect(listener).toHaveBeenCalled();
  });

  it('warns when the initial lazy locale cannot be loaded', async () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');
    const error = new Error('offline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
      localeLoaders: {
        'en-US': async () => {
          throw error;
        },
      },
    });

    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(runtime.getLang()).toBe('zh-CN');
    expect(runtime.getLangLoadState()).toEqual({
      status: 'error',
      targetLang: 'en-US',
      error,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load initial locale "en-US"'),
      error,
    );
  });
});
