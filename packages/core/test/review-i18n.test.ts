import { describe, expect, it } from 'vitest';
import { reviewUiCopy } from '../src/review-i18n';

describe('review interface copy', () => {
  it('formats complete Chinese count messages', () => {
    const copy = reviewUiCopy('zh-CN');

    expect(copy.progressSummary({ remaining: 3, total: 8, visible: 5 })).toBe(
      '显示 5/8 条文案 · 3 条待确认',
    );
    expect(copy.candidateSummary(2)).toBe('2 个候选');
  });

  it('formats English grammar without template fragments', () => {
    const copy = reviewUiCopy('en-US');

    expect(copy.progressSummary({ remaining: 0, total: 1, visible: 1 })).toBe(
      'Showing 1 of 1 message',
    );
    expect(copy.candidateSummary(1)).toBe('1 candidate');
    expect(copy.candidateSummary(2)).toBe('2 candidates');
  });
});
