export interface ReviewPanelPreferences {
  height: number;
}

export interface ReviewViewport {
  height: number;
}

export const DEFAULT_REVIEW_PANEL_PREFERENCES: ReviewPanelPreferences = {
  height: 420,
};

const PANEL_TOP_GUTTER = 12;
const PANEL_MIN_BOTTOM = 280;
export function parseReviewPanelPreferences(
  value: string | null,
): ReviewPanelPreferences {
  if (!value) return { ...DEFAULT_REVIEW_PANEL_PREFERENCES };
  try {
    const parsed = JSON.parse(value) as Partial<ReviewPanelPreferences> & {
      bottomSize?: unknown;
    };
    return {
      // 兼容读取旧版本保存的底部高度，停靠方向和右侧宽度不再生效。
      height: finiteSize(
        parsed.height ?? parsed.bottomSize,
        DEFAULT_REVIEW_PANEL_PREFERENCES.height,
      ),
    };
  } catch {
    return { ...DEFAULT_REVIEW_PANEL_PREFERENCES };
  }
}

export function reviewPanelHeight(
  preferences: ReviewPanelPreferences,
  viewport: ReviewViewport,
): number {
  const available = Math.max(0, viewport.height - PANEL_TOP_GUTTER);
  return clamp(
    preferences.height,
    Math.min(PANEL_MIN_BOTTOM, available),
    available,
  );
}

export function resizeReviewPanelHeight(
  pointerY: number,
  viewport: ReviewViewport,
): ReviewPanelPreferences {
  const available = Math.max(0, viewport.height - PANEL_TOP_GUTTER);
  return {
    height: clamp(
      viewport.height - pointerY,
      Math.min(PANEL_MIN_BOTTOM, available),
      available,
    ),
  };
}

function finiteSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
