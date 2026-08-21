import reviewStyles from '/review-ui.css?inline';
import {
  mountReviewWorkbench as mountWorkbench,
  type ReviewWorkbenchOptions,
} from './mount-core';

export function mountReviewWorkbench(
  container: HTMLElement,
  options?: ReviewWorkbenchOptions,
) {
  const controller = mountWorkbench(container, options);
  const style = document.createElement('style');
  style.dataset.aiI18nReview = '';
  style.textContent = reviewStyles;
  container.prepend(style);
  return controller;
}
