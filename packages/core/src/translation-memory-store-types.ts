export interface TranslationMemoryCandidateTarget {
  sourceLang: string;
  targetLang: string;
  source: string;
  comment?: string;
}

export interface TranslationMemoryCandidate extends TranslationMemoryCandidateTarget {
  value: string;
}

export interface TranslationMemoryCandidateState extends TranslationMemoryCandidateTarget {
  value: string | null;
  kind?: 'automatic' | 'reviewed';
  file?: string;
  location?: { line: number; column: number };
}

export interface TranslationMemoryCandidateSource {
  project: string;
  kind: 'automatic' | 'reviewed';
  file?: string;
  location?: { line: number; column: number };
}

export interface TranslationMemoryCandidateDetails {
  value: string;
  sources: TranslationMemoryCandidateSource[];
  sourcesHasMore: boolean;
}

export interface TranslationMemoryCandidatePage {
  candidates: TranslationMemoryCandidateDetails[];
  hasMore: boolean;
  automaticValue?: string;
}

export interface TranslationMemoryCandidateQuery {
  offset?: number;
  sourceOffset?: number;
  value?: string;
}

export interface TranslationMemoryCandidateCache {
  findUnique(
    targets: readonly TranslationMemoryCandidateTarget[],
  ): Promise<Array<string | undefined>>;
  sync(candidates: readonly TranslationMemoryCandidateState[]): Promise<void>;
  list(
    target: TranslationMemoryCandidateTarget,
    query?: TranslationMemoryCandidateQuery,
  ): Promise<TranslationMemoryCandidatePage>;
  close(): void;
}

export interface TranslationMemoryCandidateCacheAdapter {
  readonly cache: 'sqlite';
  list(
    target: TranslationMemoryCandidateTarget,
    query?: TranslationMemoryCandidateQuery,
  ): Promise<TranslationMemoryCandidatePage>;
  open(projectDirectory: string): Promise<TranslationMemoryCandidateCache>;
}
