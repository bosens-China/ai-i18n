import { expect, test } from 'vitest';
import {
  resolveTranslation,
  validateTranslationSnapshot,
  type TranslationCatalog,
} from '../src/translation-adapter.js';

const catalog: TranslationCatalog = {
  sourceLang: 'zh-CN',
  locales: ['zh-CN', 'en-US'],
  messages: [
    { key: '保存', source: '保存', scope: 'global' },
    { key: '保存#按钮', source: '保存', comment: '按钮', scope: 'global' },
    {
      key: 'f:123:保存#按钮',
      source: '保存',
      comment: '按钮',
      scope: 'file',
      file: { id: '123', path: 'src/Settings.vue' },
    },
  ],
};

test('manual translations win across eligible identities and comments never borrow plain values', () => {
  const [plain, commented, file] = catalog.messages;
  const snapshot = validateTranslationSnapshot(catalog, {
    'en-US': {
      保存: 'Save',
      '保存#按钮': 'Save button',
      'f:123:保存#按钮': 'Save file button',
    },
  });
  expect(resolveTranslation(plain!, 'en-US', {}, {}, snapshot)).toBe('Save');
  expect(resolveTranslation(commented!, 'en-US', {}, {}, snapshot)).toBe(
    'Save button',
  );
  expect(resolveTranslation(file!, 'en-US', {}, {}, snapshot)).toBe(
    'Save file button',
  );
  expect(
    resolveTranslation(
      file!,
      'en-US',
      { '保存#按钮': 'Manual global' },
      {},
      snapshot,
    ),
  ).toBe('Manual global');
  expect(
    resolveTranslation(file!, 'en-US', {}, { 'f:123:保存#按钮': '' }, snapshot),
  ).toBe('');
  expect(
    resolveTranslation(
      commented!,
      'en-US',
      {},
      {},
      { 'en-US': { 保存: 'Save' } },
    ),
  ).toBe('保存');
  expect(
    resolveTranslation(
      file!,
      'en-US',
      {},
      {},
      { 'en-US': { '保存#按钮': 'Save global button' } },
    ),
  ).toBe('Save global button');
  expect(
    resolveTranslation(file!, 'en-US', {}, {}, { 'en-US': { 保存: 'Save' } }),
  ).toBe('保存');
});

test('rejects unknown and invalid adapter values before applying a snapshot', () => {
  expect(validateTranslationSnapshot(catalog, null)).toEqual({});
  expect(() =>
    validateTranslationSnapshot(catalog, { 'en-US': { missing: 'x' } }),
  ).toThrow();
  expect(() => validateTranslationSnapshot(catalog, { 'fr-FR': {} })).toThrow();
  expect(() =>
    validateTranslationSnapshot(catalog, { 'en-US': { 保存: 3 as never } }),
  ).toThrow();
  expect(() =>
    validateTranslationSnapshot(
      {
        ...catalog,
        messages: [
          { key: '你好 {{0}}', source: '你好 {{0}}', scope: 'global' },
        ],
      },
      { 'en-US': { '你好 {{0}}': 'Hello' } },
    ),
  ).toThrow();
});
