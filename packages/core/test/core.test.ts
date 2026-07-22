import { describe, expect, it, vi } from 'vitest';
import {
  AiI18nSchemaError,
  TranslationConflictError,
  createI18nRuntime,
  createMessageId,
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

describe('@ai-i18n/core message IDs', () => {
  it('preserves source and normalizes optional comments', () => {
    expect(createMessageId(' 保存 ', '  按钮  ')).toBe(' 保存 #按钮');
    expect(createMessageId('保存', '   ')).toBe('保存');
    expect(createMessageId('A#B\\C', 'D#E')).toBe('A\\#B\\\\C#D\\#E');
  });

  it('round-trips escaped IDs', () => {
    const id = createMessageId('A#B\\C', 'D#E');
    expect(parseMessageId(id)).toEqual({ source: 'A#B\\C', comment: 'D#E' });
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
    expect(() =>
      parseCacheFile({ version: 2, files: {}, messages: {} }),
    ).toThrow(new AiI18nSchemaError('cache schema version must be 1; received 2'));
  });

  it('migrates legacy context metadata to comment', () => {
    const cache = parseCacheFile({
      version: 1,
      files: {},
      messages: {
        '保存#按钮': {
          source: '保存',
          context: '按钮',
          translations: { 'en-US': 'Save' },
        },
      },
    });
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

    expect(cache.messages['保存#按钮']).toMatchObject({ comment: '按钮' });
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

  it('merges global Translation Memory without losing non-null values', () => {
    const result = mergeCacheMessages(
      {
        保存: {
          source: '保存',
          translations: { 'en-US': 'Save', ja: null },
        },
      },
      {
        保存: {
          source: '保存',
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
        { 保存: { source: '保存', translations: { en: 'Save' } } },
        { 保存: { source: '保存', translations: { en: 'Store' } } },
      ),
    ).toThrow(TranslationConflictError);
  });
});

describe('@ai-i18n/core runtime', () => {
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
});
