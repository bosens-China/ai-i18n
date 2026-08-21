import { describe, expect, it } from 'vitest';
import { resolveReviewLayoutMode } from '../src/review-layout';

describe('resolveReviewLayoutMode', () => {
  it('当前页面始终两栏', () => {
    expect(resolveReviewLayoutMode(1200, 'page')).toBe('page');
  });

  it('宽度够时使用三段式', () => {
    expect(resolveReviewLayoutMode(1200, 'all')).toBe('all-wide');
    expect(resolveReviewLayoutMode(800, 'all')).toBe('all-wide');
    expect(resolveReviewLayoutMode(720, 'all')).toBe('all-wide');
  });

  it('宽度中等时使用两栏', () => {
    expect(resolveReviewLayoutMode(719, 'all')).toBe('all-compact');
    expect(resolveReviewLayoutMode(480, 'all')).toBe('all-compact');
  });

  it('宽度过窄时上下堆叠', () => {
    expect(resolveReviewLayoutMode(479, 'all')).toBe('all-stacked');
  });
});
