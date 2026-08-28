import { describe, expect, it } from 'vitest';
import {
  hasReviewPageContext,
  initialReviewWorkbenchTab,
} from '../src/review-mode';

describe('Review workbench mode', () => {
  it('starts embedded workbenches from the current page', () => {
    expect(initialReviewWorkbenchTab('embedded')).toBe('page');
    expect(hasReviewPageContext('embedded')).toBe(true);
  });

  it('starts standalone workbenches from all pages without page context', () => {
    expect(initialReviewWorkbenchTab('standalone')).toBe('all');
    expect(hasReviewPageContext('standalone')).toBe(false);
  });
});
