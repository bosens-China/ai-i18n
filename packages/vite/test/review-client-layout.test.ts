import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_PANEL_PREFERENCES,
  parseReviewPanelPreferences,
  resizeReviewPanel,
  reviewPanelSize,
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
    ).toEqual({ dock: 'bottom', bottomSize: 420, rightSize: 640 });
  });

  it('clamps stored sizes to the current viewport', () => {
    expect(
      reviewPanelSize(
        { dock: 'bottom', bottomSize: 900, rightSize: 560 },
        'bottom',
        { width: 1280, height: 800 },
      ),
    ).toBe(776);
  });

  it('resizes the active dock without changing the other remembered size', () => {
    expect(
      resizeReviewPanel(
        DEFAULT_REVIEW_PANEL_PREFERENCES,
        'right',
        { x: 700, y: 0 },
        { width: 1280, height: 800 },
      ),
    ).toEqual({ dock: 'bottom', bottomSize: 420, rightSize: 568 });
  });
});
