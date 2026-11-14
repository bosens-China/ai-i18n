import { expect, test } from 'vitest';
import type { ExtractedFile, TranslationOverridesFile } from '@ai-i18n/core';
import { planOverrideMigration } from '../src/override-migration.js';

const files: ExtractedFile[] = [
  {
    version: 1,
    source: 'src/a.ts',
    messages: [
      {
        id: '保存',
        source: '保存',
        scope: 'file',
        locations: [
          { line: 2, column: 0 },
          { line: 3, column: 0 },
        ],
      },
      { id: '保存', source: '保存', locations: [{ line: 4, column: 0 }] },
    ],
  },
];

test('converts global and explicit file rules without changing existing manual values', () => {
  const overrides: TranslationOverridesFile = {
    version: 2,
    rules: [
      { source: '保存', translations: { 'en-US': 'Save' } },
      {
        source: '保存',
        files: ['src/a.ts'],
        translations: { 'en-US': 'Save file' },
      },
    ],
  };
  const result = planOverrideMigration('E:/project', files, overrides, [
    'en-US',
  ]);
  expect(result.global['en-US']).toEqual({ 保存: 'Save' });
  expect(Object.values(result.files['en-US']!)).toEqual(['Save file']);
  expect(Object.keys(result.files['en-US']!)[0]).toMatch(
    /^f:[0-9a-f]{16}:保存$/,
  );
});

test('rejects unsafe file or partial occurrence rules while preserving old input', () => {
  expect(() =>
    planOverrideMigration(
      'E:/project',
      files,
      {
        version: 2,
        rules: [
          {
            source: '不存在',
            files: ['src/a.ts'],
            translations: { 'en-US': 'Missing' },
          },
          {
            source: '保存',
            occurrences: [{ file: 'src/a.ts', line: 2, column: 0 }],
            translations: { 'en-US': 'Partial' },
          },
        ],
      },
      ['en-US'],
    ),
  ).toThrow(/src\/a\.ts: 不存在.*src\/a\.ts: 保存/s);
});
