import { atomicOverrides } from './override-rules.js';
import type {
  TranslationMemoryFile,
  TranslationOverridesFile,
} from './schema.js';
import type { TranslationMemoryCandidateState } from './translation-memory-store-types.js';

export function translationMemoryCandidates(
  messages: TranslationMemoryFile['messages'],
  overrides: TranslationOverridesFile,
  sourceLang: string,
): TranslationMemoryCandidateState[] {
  const candidates: TranslationMemoryCandidateState[] = [];
  for (const message of Object.values(messages)) {
    for (const [targetLang, value] of Object.entries(message.translations)) {
      candidates.push({
        sourceLang: message.sourceLang,
        targetLang,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        value,
        kind: 'automatic',
      });
    }
  }
  for (const entry of atomicOverrides(overrides).values()) {
    if (entry.locale === sourceLang) continue;
    candidates.push({
      sourceLang,
      targetLang: entry.locale,
      source: entry.source,
      ...(entry.comment ? { comment: entry.comment } : {}),
      value: entry.value,
      kind: 'reviewed',
      ...(entry.file ? { file: entry.file } : {}),
      ...(entry.location ? { location: entry.location } : {}),
    });
  }
  return candidates;
}
