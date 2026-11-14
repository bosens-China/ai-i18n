import { expect, test } from 'vitest';
import { materializeLocale } from '../src/locale-materialization.js';
import type { TranslationCatalog } from '../src/translation-adapter.js';

const catalog: TranslationCatalog = {
  sourceLang: 'zh-CN',
  locales: ['zh-CN', 'en-US'],
  messages: [
    { key: '保存#按钮', source: '保存', comment: '按钮', scope: 'global' },
    {
      key: 'f:abc:保存#按钮',
      source: '保存',
      comment: '按钮',
      scope: 'file',
      file: { id: 'abc', path: 'src/Settings.vue' },
    },
    { key: '缺失', source: '缺失', scope: 'global' },
  ],
};

test('emits only translated keys and preserves manual priority over file adapter output', () => {
  const adapted = {
    'en-US': {
      '保存#按钮': 'Save button',
      'f:abc:保存#按钮': 'Save settings',
      缺失: null,
    },
  };
  expect(
    materializeLocale(
      catalog,
      'en-US',
      { '保存#按钮': 'Manual global' },
      {},
      adapted,
    ),
  ).toEqual({
    global: { '保存#按钮': 'Manual global' },
    files: {},
  });
  expect(materializeLocale(catalog, 'en-US', {}, {}, adapted)).toEqual({
    global: { '保存#按钮': 'Save button' },
    files: { abc: { 'f:abc:保存#按钮': 'Save settings' } },
  });
  expect(
    materializeLocale(catalog, 'en-US', {}, { 'f:abc:保存#按钮': '' }, adapted),
  ).toEqual({
    global: { '保存#按钮': 'Save button' },
    files: { abc: { 'f:abc:保存#按钮': '' } },
  });
});

test('rejects manual translations with different template placeholders', () => {
  const messages: TranslationCatalog = {
    ...catalog,
    messages: [
      {
        key: '你好 {{0}}',
        source: '你好 {{0}}',
        scope: 'global',
      },
    ],
  };
  expect(() =>
    materializeLocale(messages, 'en-US', { '你好 {{0}}': 'Hello' }, {}, {}),
  ).toThrow(/占位符|placeholders/);
});
