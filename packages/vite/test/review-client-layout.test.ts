import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_PANEL_PREFERENCES,
  parseReviewPanelPreferences,
  resizeReviewPanelHeight,
  reviewPanelHeight,
} from '../src/review-client-layout';

describe('review client panel layout', () => {
  it('falls back safely when persisted preferences are invalid', () => {
    expect(parseReviewPanelPreferences('{broken')).toEqual(
      DEFAULT_REVIEW_PANEL_PREFERENCES,
    );
    expect(
      parseReviewPanelPreferences(
        JSON.stringify({ dock: 'floating', bottomSize: -1, rightSize: 640 }),
      ),
    ).toEqual({ height: 420 });
    expect(
      parseReviewPanelPreferences(
        JSON.stringify({ dock: 'right', bottomSize: 360, rightSize: 640 }),
      ),
    ).toEqual({ height: 360 });
  });

  it('clamps the stored height to the current viewport', () => {
    expect(reviewPanelHeight({ height: 900 }, { height: 800 })).toBe(788);
  });

  it('resizes the bottom panel from its top edge', () => {
    expect(resizeReviewPanelHeight(300, { height: 800 })).toEqual({
      height: 500,
    });
  });
});
