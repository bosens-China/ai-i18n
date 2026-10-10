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
}

export interface TranslationMemoryCandidateCache {
  findUnique(
    targets: readonly TranslationMemoryCandidateTarget[],
  ): Promise<Array<string | undefined>>;
  sync(candidates: readonly TranslationMemoryCandidateState[]): Promise<void>;
  close(): void;
}

export interface TranslationMemoryCandidateCacheAdapter {
  readonly cache: 'sqlite';
  open(projectDirectory: string): Promise<TranslationMemoryCandidateCache>;
}
