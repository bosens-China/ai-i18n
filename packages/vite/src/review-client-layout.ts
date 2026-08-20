export type ReviewPanelDock = 'bottom' | 'right' | 'full';

export interface ReviewPanelPreferences {
  dock: ReviewPanelDock;
  bottomSize: number;
  rightSize: number;
}

export interface ReviewViewport {
  width: number;
  height: number;
}

export const DEFAULT_REVIEW_PANEL_PREFERENCES: ReviewPanelPreferences = {
  dock: 'bottom',
  bottomSize: 420,
  rightSize: 560,
};

const PANEL_GUTTER = 12;
const PANEL_MIN_BOTTOM = 280;
const PANEL_MIN_RIGHT = 520;

export function parseReviewPanelPreferences(
  value: string | null,
): ReviewPanelPreferences {
  if (!value) return { ...DEFAULT_REVIEW_PANEL_PREFERENCES };
  try {
    const parsed = JSON.parse(value) as Partial<ReviewPanelPreferences>;
    return {
      dock: isReviewPanelDock(parsed.dock)
        ? parsed.dock
        : DEFAULT_REVIEW_PANEL_PREFERENCES.dock,
      bottomSize: finiteSize(
        parsed.bottomSize,
        DEFAULT_REVIEW_PANEL_PREFERENCES.bottomSize,
      ),
      rightSize: finiteSize(
        parsed.rightSize,
        DEFAULT_REVIEW_PANEL_PREFERENCES.rightSize,
      ),
    };
  } catch {
    return { ...DEFAULT_REVIEW_PANEL_PREFERENCES };
  }
}

export function reviewPanelSize(
  preferences: ReviewPanelPreferences,
  dock: Exclude<ReviewPanelDock, 'full'>,
  viewport: ReviewViewport,
): number {
  const requested =
    dock === 'bottom' ? preferences.bottomSize : preferences.rightSize;
  const minimum = dock === 'bottom' ? PANEL_MIN_BOTTOM : PANEL_MIN_RIGHT;
  const available =
    (dock === 'bottom' ? viewport.height : viewport.width) - PANEL_GUTTER * 2;
  return clamp(requested, Math.min(minimum, available), available);
}

export function resizeReviewPanel(
  preferences: ReviewPanelPreferences,
  dock: Exclude<ReviewPanelDock, 'full'>,
  pointer: { x: number; y: number },
  viewport: ReviewViewport,
): ReviewPanelPreferences {
  const requested =
    dock === 'bottom'
      ? viewport.height - pointer.y - PANEL_GUTTER
      : viewport.width - pointer.x - PANEL_GUTTER;
  const next = { ...preferences };
  const minimum = dock === 'bottom' ? PANEL_MIN_BOTTOM : PANEL_MIN_RIGHT;
  const available =
    (dock === 'bottom' ? viewport.height : viewport.width) - PANEL_GUTTER * 2;
  const size = clamp(requested, Math.min(minimum, available), available);
  if (dock === 'bottom') next.bottomSize = size;
  else next.rightSize = size;
  return next;
}

function isReviewPanelDock(value: unknown): value is ReviewPanelDock {
  return value === 'bottom' || value === 'right' || value === 'full';
}

function finiteSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
