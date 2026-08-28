export {
  readJson,
  stableJson,
  withFileLock,
} from './translation-memory-files.js';
export {
  readAtomicTranslationOverrides as readTranslationOverrides,
  transactAtomicTranslationOverrides as transactTranslationOverrides,
  translationOverrideFiles,
} from './translation-overrides-json.js';

export { openTranslationMemoryStore } from './translation-memory-store.js';
export type { JsonTranslationMemoryStore as TranslationMemoryStore } from './translation-memory-json.js';
export type {
  TranslationMemoryCandidate,
  TranslationMemoryCandidateCache,
  TranslationMemoryCandidateCacheAdapter,
  TranslationMemoryCandidateTarget,
} from './translation-memory-store-types.js';
