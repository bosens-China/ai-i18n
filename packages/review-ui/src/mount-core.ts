import { createApp, reactive } from 'vue';
import {
  readResolvedReviewUiTheme,
  type ReviewWorkbenchController,
  type ReviewWorkbenchOptions,
} from '@ai-i18n/core';
import App from './App.vue';
import type { ReviewHostState } from './host-state';

export type { ReviewWorkbenchOptions } from '@ai-i18n/core';

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
  root.dataset.mode = options.mode ?? 'embedded';
  root.dataset.theme = readResolvedReviewUiTheme();
  container.replaceChildren(root);
  const app = createApp(App, {
    host: state,
    mode: options.mode ?? 'embedded',
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
