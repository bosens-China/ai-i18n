import { describe, expect, it } from 'vitest';
import type { ReviewMessage } from '@ai-i18n/core';
import {
  matchesReviewFileSuffix,
  reviewFileSuffix,
  reviewFileSuffixes,
} from '../src/review-files';

function message(...sourceFiles: string[]): ReviewMessage {
  return {
    message: { source: '保存' },
    translations: {},
    overrides: [],
    occurrences: sourceFiles.map((sourceFile) => ({
      sourceFile,
      locations: [{ line: 1, column: 0 }],
    })),
  };
}

describe('review file suffix filters', () => {
  it('normalizes the final file suffix', () => {
    expect(reviewFileSuffix('src/App.VUE')).toBe('.vue');
    expect(reviewFileSuffix('src/types.d.ts')).toBe('.ts');
    expect(reviewFileSuffix('src\\page.HTML')).toBe('.html');
    expect(reviewFileSuffix('src/.env')).toBeUndefined();
  });

  it('lists only suffixes present in message occurrences', () => {
    expect(
      reviewFileSuffixes([
        message('src/page.ts', 'src/page.html'),
        message('src/other.TS', 'README'),
      ]),
    ).toEqual(['.html', '.ts']);
  });

  it('keeps a message when any occurrence matches', () => {
    const target = message('src/page.ts', 'src/page.html');
    expect(matchesReviewFileSuffix(target, '.html')).toBe(true);
    expect(matchesReviewFileSuffix(target, '.vue')).toBe(false);
    expect(matchesReviewFileSuffix(target, '')).toBe(true);
  });
});
