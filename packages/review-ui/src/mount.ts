import reviewStyles from '/review-ui.css?inline';
import { mountReviewWorkbench as mountWorkbench } from './mount-core';

export function mountReviewWorkbench(container: HTMLElement) {
  const controller = mountWorkbench(container);
  const style = document.createElement('style');
  style.dataset.aiI18nReview = '';
  style.textContent = reviewStyles;
  container.prepend(style);
  return controller;
}
