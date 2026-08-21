import { createApp, reactive } from 'vue';
import { readResolvedReviewUiTheme } from '@ai-i18n/core';
import App from './App.vue';
import type { ReviewHostSelection, ReviewHostState } from './host-state';

export interface ReviewWorkbenchController {
  setPageMessageKeys(messageKeys: readonly string[]): void;
  setSelection(selection: ReviewHostSelection): void;
  destroy(): void;
}

export interface ReviewWorkbenchOptions {
  onLocateMessage?: (messageKey: string) => void;
}

export function mountReviewWorkbench(
  container: HTMLElement,
  options: ReviewWorkbenchOptions = {},
): ReviewWorkbenchController {
  const state = reactive<ReviewHostState>({
    pageMessageKeys: [],
    selection: null,
  });
  const root = document.createElement('div');
  root.className = 'review-root';
  root.dataset.theme = readResolvedReviewUiTheme();
  container.replaceChildren(root);
  const app = createApp(App, {
    host: state,
    root,
    onLocateMessage: options.onLocateMessage,
  });
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
