import { describe, expect, it } from 'vitest';
import type { ReviewSnapshot } from '@ai-i18n/core';
import {
  createReviewValueIndex,
  matchReviewValue,
  reviewClientMessageKey,
  uniqueReviewTarget,
} from '../src/review-client-matcher';

const snapshot: ReviewSnapshot = {
  sourceLang: 'zh-CN',
  locales: [{ value: 'en-US', label: 'English' }],
  messages: [
    {
      message: { source: '保存', comment: '按钮' },
      translations: { 'en-US': 'Save' },
      overrides: [],
      occurrences: [
        {
          sourceFile: 'src/page.ts',
          locations: [
            { line: 8, column: 2 },
            { line: 8, column: 20 },
          ],
        },
      ],
    },
    {
      message: { source: '保存', comment: '菜单' },
      translations: { 'en-US': 'Save' },
      overrides: [{ locale: 'en-US', value: 'Store' }],
      occurrences: [
        {
          sourceFile: 'src/menu.ts',
          locations: [{ line: 4, column: 1 }],
        },
      ],
    },
    {
      message: { source: '欢迎 {{0}}' },
      translations: { 'en-US': 'Welcome, {{0}}' },
      overrides: [],
      occurrences: [
        {
          sourceFile: 'src/home.ts',
          locations: [{ line: 3, column: 5 }],
        },
      ],
    },
  ],
};

describe('review client matching', () => {
  it('keeps identical rendered values as explicit message candidates', () => {
    const matches = matchReviewValue(createReviewValueIndex(snapshot), 'Save');

    expect(matches).toEqual([
      reviewClientMessageKey({ source: '保存', comment: '按钮' }),
      reviewClientMessageKey({ source: '保存', comment: '菜单' }),
    ]);
  });

  it('matches rendered interpolation values without losing the source target', () => {
    expect(
      matchReviewValue(createReviewValueIndex(snapshot), 'Welcome, Ada'),
    ).toEqual([reviewClientMessageKey({ source: '欢迎 {{0}}' })]);
  });

  it('only infers an occurrence when the candidate has one exact location', () => {
    const ambiguousKey = reviewClientMessageKey({
      source: '保存',
      comment: '按钮',
    });
    const uniqueKey = reviewClientMessageKey({ source: '欢迎 {{0}}' });

    expect(uniqueReviewTarget(snapshot, [ambiguousKey])).toBeUndefined();
    expect(uniqueReviewTarget(snapshot, [uniqueKey])).toEqual({
      key: uniqueKey,
      file: 'src/home.ts',
      location: { line: 3, column: 5 },
    });
  });
});
