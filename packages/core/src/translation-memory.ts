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
  TranslationMemoryCandidateSource,
  TranslationMemoryCandidateDetails,
  TranslationMemoryCandidatePage,
  TranslationMemoryCandidateQuery,
  TranslationMemoryCandidateCache,
  TranslationMemoryCandidateCacheAdapter,
  TranslationMemoryCandidateState,
  TranslationMemoryCandidateTarget,
} from './translation-memory-store-types.js';

export { parseProtocolJson, DuplicateJsonKeyError } from './protocol-json.js';

export { translationMemoryCandidates } from './translation-memory-candidates.js';
