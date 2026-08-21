import { describe, expect, it } from 'vitest';
import { reviewLocateScrollDelta } from '../src/review-client-locate';

describe('review client page locate', () => {
  it('centers the target in the page area above the review panel', () => {
    expect(reviewLocateScrollDelta({ top: 900, height: 40 }, 400)).toBe(720);
  });

  it('keeps a minimum top padding for targets taller than the page area', () => {
    expect(reviewLocateScrollDelta({ top: 120, height: 500 }, 300)).toBe(100);
  });
});
