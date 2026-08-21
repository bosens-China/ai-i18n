const REVIEW_LOCATE_PADDING = 20;

export function reviewLocateScrollDelta(
  target: Pick<DOMRect, 'height' | 'top'>,
  pageViewportBottom: number,
): number {
  const availableHeight = Math.max(0, pageViewportBottom);
  const desiredTop = Math.max(
    REVIEW_LOCATE_PADDING,
    (availableHeight - target.height) / 2,
  );
  return target.top - desiredTop;
}
