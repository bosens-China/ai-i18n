import { computed, shallowRef } from 'vue';

export interface VirtualRange {
  start: number;
  end: number;
  offset: number;
  totalHeight: number;
}

export interface VirtualItem<T> {
  index: number;
  item: T;
}

export interface VirtualViewport {
  height: number;
  scrollTop: number;
}

interface VirtualListOptions {
  itemHeight: number;
  overscan?: number;
}

export function virtualRange(
  total: number,
  viewport: VirtualViewport,
  { itemHeight, overscan = 5 }: VirtualListOptions,
): VirtualRange {
  const totalHeight = Math.max(0, total) * itemHeight;
  const maxScrollTop = Math.max(0, totalHeight - viewport.height);
  const scrollTop = Math.min(Math.max(0, viewport.scrollTop), maxScrollTop);
  const visible = Math.ceil(viewport.height / itemHeight);
  const start = Math.min(
    Math.max(0, total),
    Math.max(0, Math.floor(scrollTop / itemHeight) - overscan),
  );
  const end = Math.min(total, start + visible + overscan * 2);
  return {
    start,
    end,
    offset: start * itemHeight,
    totalHeight,
  };
}

export function scrollTopForIndex(
  index: number,
  total: number,
  viewport: VirtualViewport,
  itemHeight: number,
): number {
  if (index < 0 || index >= total || itemHeight <= 0) return viewport.scrollTop;
  const itemTop = index * itemHeight;
  const itemBottom = itemTop + itemHeight;
  const viewportBottom = viewport.scrollTop + viewport.height;
  if (itemTop < viewport.scrollTop) return itemTop;
  if (itemBottom <= viewportBottom) return viewport.scrollTop;
  return Math.min(
    Math.max(0, total * itemHeight - viewport.height),
    itemBottom - viewport.height,
  );
}

export function useVirtualList<T>(
  items: () => readonly T[],
  options: VirtualListOptions,
) {
  const viewport = shallowRef<VirtualViewport>({ height: 0, scrollTop: 0 });
  const range = computed(() =>
    virtualRange(items().length, viewport.value, options),
  );
  const visibleItems = computed<VirtualItem<T>[]>(() =>
    items()
      .slice(range.value.start, range.value.end)
      .map((item, index) => ({ index: range.value.start + index, item })),
  );

  function updateViewport(next: VirtualViewport): void {
    viewport.value = {
      height: Math.max(0, next.height),
      scrollTop: Math.max(0, next.scrollTop),
    };
  }

  return { range, visibleItems, updateViewport };
}
