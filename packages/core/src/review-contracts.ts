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
