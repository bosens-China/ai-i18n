export interface TranslationMemoryCandidateTarget {
  sourceLang: string;
  targetLang: string;
  source: string;
  comment?: string;
}

export interface TranslationMemoryCandidate extends TranslationMemoryCandidateTarget {
  value: string;
}

export interface TranslationMemoryCandidateCache {
  findUnique(
    targets: readonly TranslationMemoryCandidateTarget[],
  ): Promise<Array<string | undefined>>;
  remember(candidates: readonly TranslationMemoryCandidate[]): Promise<void>;
  close(): void;
}

export interface TranslationMemoryCandidateCacheAdapter {
  readonly cache: 'sqlite';
  open(): Promise<TranslationMemoryCandidateCache>;
}
