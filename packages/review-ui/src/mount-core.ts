import { createApp, reactive } from 'vue';
import App from './App.vue';
import type { ReviewHostSelection, ReviewHostState } from './host-state';

export interface ReviewWorkbenchController {
  setPageMessageKeys(messageKeys: readonly string[]): void;
  setSelection(selection: ReviewHostSelection): void;
  destroy(): void;
}

export function mountReviewWorkbench(
  container: HTMLElement,
): ReviewWorkbenchController {
  const state = reactive<ReviewHostState>({
    pageMessageKeys: [],
    selection: null,
  });
  const root = document.createElement('div');
  root.className = 'review-root';
  container.replaceChildren(root);
  const app = createApp(App, { host: state });
  app.mount(root);

  return {
    setPageMessageKeys(messageKeys) {
      state.pageMessageKeys = [...messageKeys];
    },
    setSelection(selection) {
      state.selection = {
        candidateKeys: [...selection.candidateKeys],
        ...(selection.exact
          ? {
              exact: {
                ...selection.exact,
                location: { ...selection.exact.location },
              },
            }
          : {}),
      };
    },
    destroy() {
      app.unmount();
      container.replaceChildren();
    },
  };
}
