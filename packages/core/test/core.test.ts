import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiI18nSchemaError,
  TranslationConflictError,
  createI18nRuntime,
  createMessageId,
  hasSameTemplateTokens,
  mergeCacheMessages,
  parseCacheFile,
  parseExtractedFile,
  parseLocaleFile,
  parseMessageId,
} from '../src/index';

const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('@ai-i18n/core message IDs', () => {
  it('keeps IDs stable when comments change', () => {
    expect(createMessageId(' 保存 ', '  按钮  ')).toBe(' 保存 ');
    expect(createMessageId('保存', '   ')).toBe('保存');
    expect(createMessageId('A#B\\C', 'D#E')).toBe('A\\#B\\\\C');
  });

  it('parses current and legacy comment-bearing IDs', () => {
    expect(parseMessageId(createMessageId('A#B\\C'))).toEqual({
      source: 'A#B\\C',
    });
    expect(parseMessageId('A\\#B\\\\C#D\\#E')).toEqual({
      source: 'A#B\\C',
      comment: 'D#E',
    });
  });
});

describe('@ai-i18n/core schemas', () => {
  it('accepts null and intentional empty translations', () => {
    expect(
      parseLocaleFile({
        version: 1,
        locale: locales[1],
        messages: { 保存: null, 省略: '' },
      }).messages,
    ).toEqual({ 保存: null, 省略: '' });
  });

  it('reports unsupported schema versions clearly', () => {
    expect(() => parseCacheFile({ version: 3, messages: {} })).toThrow(
      new AiI18nSchemaError('cache schema version must be 2; received 3'),
    );
  });

  it('migrates legacy context metadata to comment', () => {
    const cache = parseCacheFile(
      {
        version: 1,
        files: {},
        messages: {
          '保存#按钮': {
            source: '保存',
            context: '按钮',
            translations: { 'en-US': 'Save' },
          },
        },
      },
      'zh-CN',
    );
    const extracted = parseExtractedFile({
      version: 1,
      source: 'src/app.ts',
      messages: [
        {
          id: '保存#按钮',
          source: '保存',
          context: '按钮',
          translations: { 'en-US': 'Save' },
          locations: [{ line: 1, column: 0 }],
        },
      ],
    });

    expect(cache.messages['保存#按钮']).toMatchObject({
      sourceLang: 'zh-CN',
      comment: '按钮',
    });
    expect(extracted.messages[0]).toMatchObject({ comment: '按钮' });
    expect(cache.messages['保存#按钮']).not.toHaveProperty('context');
    expect(extracted.messages[0]).not.toHaveProperty('context');
  });

  it('rejects conflicting legacy context and comment metadata', () => {
    expect(() =>
      parseCacheFile({
        version: 1,
        files: {},
        messages: {
          保存: {
            source: '保存',
            comment: '按钮',
            context: '标题',
            translations: {},
          },
        },
      }),
    ).toThrow('comment conflicts with legacy');
  });

  it('distinguishes runtime and escaped literal template tokens', () => {
    expect(
      hasSameTemplateTokens(
        '语法 {{=0}}，当前 {{0}}',
        'Current {{0}}; syntax {{=0}}',
      ),
    ).toBe(true);
    expect(
      hasSameTemplateTokens(
        '语法 {{=0}}，当前 {{0}}',
        'Syntax {{0}}; current {{0}}',
      ),
    ).toBe(false);
  });
  it('merges global Translation Memory without losing non-null values', () => {
    const result = mergeCacheMessages(
      {
        保存: {
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Save', ja: null },
        },
      },
      {
        保存: {
          sourceLang: 'zh-CN',
          translations: { 'en-US': null, ja: '保存する' },
        },
      },
    );
    expect(result.保存?.translations).toEqual({
      'en-US': 'Save',
      ja: '保存する',
    });
  });

  it('rejects conflicting non-null translations', () => {
    expect(() =>
      mergeCacheMessages(
        {
          保存: { sourceLang: 'zh-CN', translations: { en: 'Save' } },
        },
        {
          保存: { sourceLang: 'zh-CN', translations: { en: 'Store' } },
        },
      ),
    ).toThrow(TranslationConflictError);
  });
});

describe('@ai-i18n/core runtime', () => {
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
  it('detects and persists supported browser language preferences', async () => {
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
    vi.stubGlobal('navigator', {
      languages: ['en-GB'],
      language: 'en-GB',
    });

    const persisted = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      persist: { key: 'preferred' },
      detect: 'navigator',
    });
    expect(persisted.getLang()).toBe('zh-CN');
    await persisted.setLang('en-US');
    expect(values.get('preferred')).toBe('en-US');

    values.clear();
    const detected = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales,
      detect: 'navigator',
    });
    expect(detected.getLang()).toBe('en-US');
  });

  it('supports key, marked, and empty missing-translation fallbacks', () => {
    const create = (fallback: 'key' | 'marked' | 'empty') =>
      createI18nRuntime({
        sourceLang: 'zh-CN',
        defaultLang: 'en-US',
        locales,
        fallback,
      });

    expect(create('key').t('A#B')).toBe('A\\#B');
    expect(create('marked').t('缺失')).toBe('⟦缺失⟧');
    expect(create('empty').t('缺失')).toBe('');
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
});
