import { describe, expect, it } from 'vitest';
import {
  AiI18nSchemaError,
  createMessageId,
  hasSameTemplateTokens,
  parseExtractedFile,
  parseLocaleFile,
  parseTranslationOverridesFile,
  parseTranslationMemoryFile,
  templateTokens,
} from '../src/index';
import { locales } from './runtime-test-fixtures';

describe('@ai-i18n/core message IDs', () => {
  it('includes normalized comments in collision-free readable IDs', () => {
    expect(createMessageId(' 保存 ', { comment: '  按钮  ' })).toBe(
      ' 保存 #按钮',
    );
    expect(createMessageId('保存', { comment: '   ' })).toBe('保存');
    expect(createMessageId('A#B\\C', { comment: 'D#E' })).toBe(
      'A\\#B\\\\C#D\\#E',
    );
    expect(createMessageId('A#B', { comment: 'C' })).not.toBe(
      createMessageId('A', { comment: 'B#C' }),
    );
    expect(createMessageId('提交', { comment: '按钮' })).not.toBe(
      createMessageId('提交', { comment: '菜单项' }),
    );
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
      parseTranslationMemoryFile({
        version: 2,
        revision: 0,
        messages: {},
      }),
    ).toThrow(
      new AiI18nSchemaError(
        'translation memory schema version must be 1; received 2',
      ),
    );
  });

  it.each([
    {
      path: 'translation memory.unknown',
      parse: parseTranslationMemoryFile,
      value: { version: 1, revision: 0, messages: {}, unknown: true },
    },
    {
      path: 'translation memory.messages.保存.unknown',
      parse: parseTranslationMemoryFile,
      value: {
        version: 1,
        revision: 0,
        messages: {
          保存: {
            sourceLang: 'zh-CN',
            translations: {},
            unknown: true,
          },
        },
      },
    },
    {
      path: 'extracted.unknown',
      parse: parseExtractedFile,
      value: {
        version: 1,
        source: 'src/app.ts',
        messages: [],
        unknown: true,
      },
    },
    {
      path: 'extracted.messages.0.unknown',
      parse: parseExtractedFile,
      value: {
        version: 1,
        source: 'src/app.ts',
        messages: [
          {
            id: '保存',
            source: '保存',
            locations: [],
            unknown: true,
          },
        ],
      },
    },
    {
      path: 'extracted.messages.0.locations.0.unknown',
      parse: parseExtractedFile,
      value: {
        version: 1,
        source: 'src/app.ts',
        messages: [
          {
            id: '保存',
            source: '保存',
            locations: [{ line: 1, column: 0, unknown: true }],
          },
        ],
      },
    },
    {
      path: 'locale.unknown',
      parse: parseLocaleFile,
      value: {
        version: 1,
        locale: locales[1],
        messages: {},
        unknown: true,
      },
    },
    {
      path: 'locale.locale.unknown',
      parse: parseLocaleFile,
      value: {
        version: 1,
        locale: { ...locales[1], unknown: true },
        messages: {},
      },
    },
  ])('rejects unknown schema field $path', ({ parse, value, path }) => {
    expect(() => parse(value)).toThrow(`${path} is not part of the schema`);
  });

  it('strictly parses string-only translation overrides', () => {
    expect(() =>
      parseTranslationOverridesFile({ version: 1, rules: [] }),
    ).toThrow('schema version must be 2');
    expect(() =>
      parseTranslationOverridesFile({ version: 1, messages: {} }),
    ).toThrow('schema version must be 2');
    expect(
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            translations: { 'en-US': 'Submit', ja: '' },
          },
          {
            source: '提交',
            comment: '结账按钮',
            files: ['src/checkout.ts', 'src/cart.ts', 'src/cart.ts'],
            translations: { 'en-US': 'Place order' },
          },
          {
            source: '提交',
            occurrences: [
              { file: 'src/cart.ts', line: 3, column: 25 },
              { file: 'src/cart.ts', line: 3, column: 8 },
              { file: 'src/cart.ts', line: 3, column: 8 },
            ],
            translations: { 'en-US': 'Submit cart' },
          },
        ],
      }).rules,
    ).toEqual([
      {
        source: '提交',
        translations: { 'en-US': 'Submit', ja: '' },
      },
      {
        source: '提交',
        occurrences: [
          { file: 'src/cart.ts', line: 3, column: 8 },
          { file: 'src/cart.ts', line: 3, column: 25 },
        ],
        translations: { 'en-US': 'Submit cart' },
      },
      {
        source: '提交',
        comment: '结账按钮',
        files: ['src/cart.ts', 'src/checkout.ts'],
        translations: { 'en-US': 'Place order' },
      },
    ]);
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [{ source: '提交', translations: { 'en-US': null } }],
      }),
    ).toThrow('must be a string');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [],
        revision: 1,
      }),
    ).toThrow('revision is not part of the schema');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            files: [],
            translations: { 'en-US': 'Submit' },
          },
        ],
      }),
    ).toThrow('files must be a non-empty array');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            files: ['src/cart.ts'],
            occurrences: [{ file: 'src/cart.ts', line: 1, column: 0 }],
            translations: { 'en-US': 'Submit' },
          },
        ],
      }),
    ).toThrow('scoped by either files or occurrences, not both');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            occurrences: [{ file: 'src/cart.ts', line: 0, column: 0 }],
            translations: { 'en-US': 'Submit' },
          },
        ],
      }),
    ).toThrow('line must be an integer >= 1');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            files: ['src/../checkout.ts'],
            translations: { 'en-US': 'Submit' },
          },
        ],
      }),
    ).toThrow('a normalized POSIX path relative to the Vite root');
    expect(
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            files: ['../shared/checkout.ts'],
            translations: { 'en-US': 'Submit' },
          },
        ],
      }).rules[0]?.files,
    ).toEqual(['../shared/checkout.ts']);
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          {
            source: '提交',
            files: ['src/cart.ts'],
            translations: { 'en-US': 'Submit' },
          },
          {
            source: '提交',
            files: ['src/cart.ts', 'src/checkout.ts'],
            translations: { 'en-US': 'Place order' },
          },
        ],
      }),
    ).toThrow('received conflicting translations');
    expect(() =>
      parseTranslationOverridesFile({
        version: 2,
        rules: [
          { source: '提交', translations: { 'en-US': 'Submit' } },
          { source: '提交', translations: { 'en-US': 'Submit' } },
        ],
      }),
    ).toThrow('received a duplicate target');
  });

  it('distinguishes runtime and escaped literal template tokens', () => {
    expect(templateTokens('当前 {{1}} / {{0}} / {{0}}')).toEqual([
      '{{0}}',
      '{{0}}',
      '{{1}}',
    ]);
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
});
