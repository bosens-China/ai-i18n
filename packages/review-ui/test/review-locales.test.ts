import { describe, expect, it } from 'vitest';
import { hasMultipleReviewLocales } from '../src/review-locales';

describe('hasMultipleReviewLocales', () => {
  it('only shows a language selector when users can choose', () => {
    expect(hasMultipleReviewLocales(undefined)).toBe(false);
    expect(hasMultipleReviewLocales([])).toBe(false);
    expect(hasMultipleReviewLocales([{ value: 'en', label: 'English' }])).toBe(
      false,
    );
    expect(
      hasMultipleReviewLocales([
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
      ]),
    ).toBe(true);
  });
});
