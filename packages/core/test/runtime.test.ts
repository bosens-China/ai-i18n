import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationConflictError, createI18nRuntime } from '../src/index';

const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('@ai-i18n/core runtime', () => {
  it('does not expose its internal locale objects', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
    });

    runtime.getLangs()[0]!.value = 'changed';

    expect(runtime.getLangs()).toEqual(locales);
    await expect(runtime.setLang('changed')).rejects.toThrow(
      '[ai-i18n] unsupported locale "changed"',
    );
  });

  it('uses comment-specific IDs', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/app.ts', {
      'zh-CN': { '提交#结算按钮': '提交', '保存#按钮': '保存' },
      'en-US': { '提交#结算按钮': 'Place order', '保存#按钮': 'Save' },
    });

    expect(runtime.t('提交', { comment: '结算按钮' })).toBe('Place order');
    expect(runtime.t('保存', { comment: '按钮' })).toBe('Save');
  });

  it('translates tagged templates and lets targets reorder placeholders', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/app.ts', {
      'zh-CN': { '你好 {{0}}，共有 {{1}} 项': '你好 {{0}}，共有 {{1}} 项' },
      'en-US': { '你好 {{0}}，共有 {{1}} 项': '{{1}} items for {{0}}' },
    });
    const name = 'Ada';
    const count = 2;

    expect(runtime.t`你好 ${name}，共有 ${count} 项`).toBe('2 items for Ada');
  });

  it('warns once per locale, message, and mismatched translation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [...locales, { value: 'ja-JP', label: '日本語' }],
    });
    runtime.registerModule('src/app.ts', {
      'zh-CN': { '欢迎 {{0}}': '欢迎 {{0}}' },
      'en-US': { '欢迎 {{0}}': 'Welcome' },
      'ja-JP': { '欢迎 {{0}}': 'ようこそ {{1}}' },
    });

    expect(runtime.t`欢迎 ${'Ada'}`).toBe('Welcome');
    expect(runtime.t`欢迎 ${'Ada'}`).toBe('Welcome');
    expect(warn).toHaveBeenCalledTimes(1);

    await runtime.setLang('ja-JP');
    expect(runtime.t`欢迎 ${'Ada'}`).toBe('ようこそ {{1}}');
    expect(warn).toHaveBeenCalledTimes(2);

    runtime.replaceModule('src/app.ts', {
      'zh-CN': { '欢迎 {{0}}': '欢迎 {{0}}' },
      'en-US': { '欢迎 {{0}}': 'Welcome' },
      'ja-JP': { '欢迎 {{0}}': '変更 {{2}}' },
    });
    expect(runtime.t`欢迎 ${'Ada'}`).toBe('変更 {{2}}');
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenLastCalledWith(
      '[ai-i18n] locale "ja-JP" message "欢迎 {{0}}" 的模板占位符与源文不一致 / template placeholders differ from source',
    );
  });

  it('keeps literal template tokens separate from runtime values', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/template-literals.ts', {
      'zh-CN': {
        '占位符是 {{=0}}，当前值为 {{0}}': '占位符是 {{=0}}，当前值为 {{0}}',
        '仅显示 {{=0}}': '仅显示 {{=0}}',
        '转义示例 {{==0}}': '转义示例 {{==0}}',
        '表达式值为 {{0}}': '表达式值为 {{0}}',
      },
      'en-US': {
        '占位符是 {{=0}}，当前值为 {{0}}':
          'Current value: {{0}}; placeholder: {{=0}}',
        '仅显示 {{=0}}': 'Display {{=0}}',
        '转义示例 {{==0}}': 'Escaped {{==0}}',
        '表达式值为 {{0}}': 'Expression: {{0}}',
      },
    });

    expect(runtime.t`占位符是 {{0}}，当前值为 ${'saved'}`).toBe(
      'Current value: saved; placeholder: {{0}}',
    );
    expect(runtime.t('仅显示 {{0}}')).toBe('Display {{0}}');
    expect(runtime.t('转义示例 {{=0}}')).toBe('Escaped {{=0}}');
    expect(runtime.t`表达式值为 ${'{{0}}'}`).toBe('Expression: {{0}}');
  });

  it('persists supported language preferences and falls back to default', async () => {
    const values = new Map<string, string>([['preferred', 'zh-CN']]);
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    };
    vi.stubGlobal('localStorage', storage);

    const persisted = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
      persist: { key: 'preferred' },
    });
    expect(persisted.getLang()).toBe('zh-CN');
    await persisted.setLang('en-US');
    expect(values.get('preferred')).toBe('en-US');

    values.set('preferred', 'unsupported');
    const fallback = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
      persist: { key: 'preferred' },
    });
    expect(fallback.getLang()).toBe('en-US');
  });

  it('registers all locales and falls back only for null or missing values', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/app.ts', {
      'zh-CN': { 保存: '保存', 省略: '省略' },
      'en-US': { 保存: null, 省略: '' },
    });

    expect(runtime.t('保存')).toBe('保存');
    expect(runtime.t('省略')).toBe('');
    await runtime.setLang('zh-CN');
    expect(runtime.t('保存')).toBe('保存');
  });

  it('replaces and unregisters modules without leaking stale messages', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/a.ts', {
      'zh-CN': { 保存: '保存' },
      'en-US': { 保存: 'Save' },
    });
    runtime.replaceModule('src/a.ts', {
      'zh-CN': { 取消: '取消' },
      'en-US': { 取消: 'Cancel' },
    });

    expect(runtime.t('保存')).toBe('保存');
    expect(runtime.t('取消')).toBe('Cancel');
    runtime.unregisterModule('src/a.ts');
    expect(runtime.t('取消')).toBe('取消');
  });

  it('keeps shared messages until their last module is removed', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    const messages = {
      'zh-CN': { 保存: '保存' },
      'en-US': { 保存: 'Save' },
    };
    runtime.registerModule('src/a.ts', messages);
    runtime.registerModule('src/b.ts', messages);
    runtime.unregisterModule('src/a.ts');
    expect(runtime.t('保存')).toBe('Save');
    runtime.unregisterModule('src/b.ts');
    expect(runtime.t('保存')).toBe('保存');
  });

  it('rejects conflicting modules atomically', () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales,
    });
    runtime.registerModule('src/a.ts', {
      'zh-CN': { 保存: '保存' },
      'en-US': { 保存: 'Save' },
    });

    expect(() =>
      runtime.registerModule('src/b.ts', {
        'zh-CN': { 保存: '保存' },
        'en-US': { 保存: 'Store' },
      }),
    ).toThrow(TranslationConflictError);
    expect(runtime.t('保存')).toBe('Save');
  });

  it('notifies subscribers for language and module changes', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
    });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    runtime.registerModule('src/a.ts', { 'zh-CN': {}, 'en-US': {} });
    await runtime.setLang('en-US');
    unsubscribe();
    runtime.unregisterModule('src/a.ts');
    expect(listener).toHaveBeenCalledTimes(2);
  });

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
    expect(listener).toHaveBeenCalledOnce();
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
    const lazyLocales = [...locales, { value: 'ja-JP', label: '日本語' }];
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
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load initial locale "en-US"'),
      error,
    );
  });
});
