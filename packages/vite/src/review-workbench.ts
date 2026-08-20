import type { ReviewSourceLocation } from '@ai-i18n/core';

export interface ReviewWorkbenchTarget {
  key: string;
  file: string;
  location: ReviewSourceLocation;
}

export interface ReviewWorkbenchSelection {
  candidateKeys: string[];
  exact?: ReviewWorkbenchTarget;
}

export interface ReviewWorkbenchController {
  setPageMessageKeys(messageKeys: readonly string[]): void;
  setSelection(selection: ReviewWorkbenchSelection): void;
  destroy(): void;
}

export interface ReviewWorkbenchModule {
  mountReviewWorkbench(container: HTMLElement): ReviewWorkbenchController;
}
