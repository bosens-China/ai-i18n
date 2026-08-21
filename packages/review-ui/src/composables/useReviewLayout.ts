import { watchEffect, shallowRef, type ShallowRef } from 'vue';
import {
  resolveReviewLayoutMode,
  type ReviewLayoutMode,
} from '../review-layout';

export type { ReviewLayoutMode };

export interface ReviewLayoutState {
  height: ShallowRef<number>;
  layoutMode: ShallowRef<ReviewLayoutMode>;
  width: ShallowRef<number>;
}

export function useReviewLayout(
  getWorkspace: () => HTMLElement | undefined,
  scope: () => 'page' | 'all',
): ReviewLayoutState {
  const width = shallowRef(0);
  const height = shallowRef(0);
  const layoutMode = shallowRef<ReviewLayoutMode>('page');

  watchEffect((onCleanup) => {
    const workspace = getWorkspace();
    if (!workspace) return;

    const syncLayout = (): void => {
      const nextWidth = workspace.clientWidth;
      const nextHeight = workspace.clientHeight;
      width.value = nextWidth;
      height.value = nextHeight;
      layoutMode.value = resolveReviewLayoutMode(nextWidth, scope());
    };

    const observer = new ResizeObserver(() => syncLayout());
    observer.observe(workspace);
    syncLayout();

    const stopScope = watchEffect(() => {
      scope();
      syncLayout();
    });

    onCleanup(() => {
      observer.disconnect();
      stopScope();
    });
  });

  return { height, layoutMode, width };
}
