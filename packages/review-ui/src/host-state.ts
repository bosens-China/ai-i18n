import type { ReviewSourceLocation } from '@ai-i18n/core';

export interface ReviewHostTarget {
  key: string;
  file: string;
  location: ReviewSourceLocation;
}

export interface ReviewHostSelection {
  candidateKeys: string[];
  exact?: ReviewHostTarget;
}

export interface ReviewHostState {
  pageMessageKeys: string[];
  selection: ReviewHostSelection | null;
}
