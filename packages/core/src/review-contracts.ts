export interface ReviewMessageReference {
  source: string;
  comment?: string;
}

export interface ReviewOccurrence {
  sourceFile: string;
  locations: ReviewSourceLocation[];
}

export interface ReviewSourceLocation {
  line: number;
  column: number;
}

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

export interface ReviewWorkbenchOptions {
  mode?: 'embedded' | 'standalone';
  onLocateMessage?: (messageKey: string) => void;
}

export interface ReviewWorkbenchModule {
  mountReviewWorkbench(
    container: HTMLElement,
    options?: ReviewWorkbenchOptions,
  ): ReviewWorkbenchController;
}

export interface ReviewOverride {
  locale: string;
  value: string;
  file?: string;
  location?: ReviewSourceLocation;
}

export interface ReviewMessage {
  message: ReviewMessageReference;
  translations: Record<string, string | null>;
  overrides: ReviewOverride[];
  occurrences: ReviewOccurrence[];
}

export interface ReviewLocale {
  value: string;
  label: string;
}

export interface ReviewSnapshot {
  sourceLang: string;
  locales: ReviewLocale[];
  messages: ReviewMessage[];
}

export interface ReviewMutation {
  message: ReviewMessageReference;
  locale: string;
  method: 'POST' | 'DELETE';
  file?: string;
  location?: ReviewSourceLocation;
  value?: string;
}

export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed';
