import { describe, expect, it } from 'vitest';
import { reviewOverlayCopy } from '../src/review-client-copy';

describe('review client copy', () => {
  it('uses the selected interface language for the outer shell', () => {
    expect(reviewOverlayCopy('zh-CN').openReview).toBe('打开翻译校对');
    expect(reviewOverlayCopy('en-US').openReview).toBe(
      'Open translation review',
    );
  });
});
