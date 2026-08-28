import type { ReviewWorkbenchSelection } from '@ai-i18n/core';

export interface ReviewHostState {
  pageMessageKeys: string[];
  selection: ReviewWorkbenchSelection | null;
}
