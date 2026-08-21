/** 工作台内容区布局模式 */
export type ReviewLayoutMode =
  'page' | 'all-wide' | 'all-compact' | 'all-stacked';

/** 固定底部布局：宽度够则横向三段（筛选 | 列表 | 编辑） */
const BOTTOM_WIDE_MIN_WIDTH = 720;
const BOTTOM_COMPACT_MIN_WIDTH = 480;

export function resolveReviewLayoutMode(
  width: number,
  scope: 'page' | 'all',
): ReviewLayoutMode {
  if (scope === 'page') return 'page';
  if (width <= 0) return 'all-compact';

  if (width >= BOTTOM_WIDE_MIN_WIDTH) return 'all-wide';
  if (width >= BOTTOM_COMPACT_MIN_WIDTH) return 'all-compact';
  return 'all-stacked';
}
