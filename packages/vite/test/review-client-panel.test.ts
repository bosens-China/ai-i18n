import { describe, expect, it } from 'vitest';
import { REVIEW_CLIENT_FONT_STACK } from '../src/review-client-panel';

describe('review client panel', () => {
  it('uses the CJK system font stack for the outer shell', () => {
    expect(REVIEW_CLIENT_FONT_STACK).toContain('PingFang SC');
    expect(REVIEW_CLIENT_FONT_STACK).toContain('Microsoft YaHei UI');
    expect(REVIEW_CLIENT_FONT_STACK).not.toContain('Inter');
  });
});
