export type ReviewWorkbenchMode = 'embedded' | 'standalone';

export function initialReviewWorkbenchTab(
  mode: ReviewWorkbenchMode,
): 'page' | 'all' {
  return mode === 'standalone' ? 'all' : 'page';
}

export function hasReviewPageContext(mode: ReviewWorkbenchMode): boolean {
  return mode === 'embedded';
}
