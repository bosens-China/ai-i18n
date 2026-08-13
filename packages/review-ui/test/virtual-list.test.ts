import { describe, expect, it } from 'vitest';
import {
  scrollTopForIndex,
  virtualRange,
} from '../src/composables/useVirtualList';

describe('virtual range', () => {
  it('renders the visible rows with overscan and an accurate offset', () => {
    expect(
      virtualRange(
        100,
        { height: 168, scrollTop: 840 },
        { itemHeight: 84, overscan: 2 },
      ),
    ).toEqual({ start: 8, end: 14, offset: 672, totalHeight: 8400 });
  });

  it('clamps the visible range to the available items', () => {
    expect(
      virtualRange(3, { height: 400, scrollTop: 999 }, { itemHeight: 84 }),
    ).toEqual({ start: 0, end: 3, offset: 0, totalHeight: 252 });
  });

  it('keeps the final rows rendered when scrolling reaches the bottom', () => {
    expect(
      virtualRange(
        24,
        { height: 420, scrollTop: 1_596 },
        { itemHeight: 84, overscan: 5 },
      ),
    ).toEqual({ start: 14, end: 24, offset: 1_176, totalHeight: 2_016 });
  });

  it('reveals keyboard-selected rows without moving already visible rows', () => {
    expect(scrollTopForIndex(2, 100, { height: 420, scrollTop: 0 }, 84)).toBe(
      0,
    );
    expect(scrollTopForIndex(20, 100, { height: 420, scrollTop: 0 }, 84)).toBe(
      1_344,
    );
    expect(scrollTopForIndex(3, 100, { height: 420, scrollTop: 840 }, 84)).toBe(
      252,
    );
  });
});
