import {
  runtimeMessageId,
  translationOccurrenceKey,
  type TranslationValue,
} from '@ai-i18n/core';
import type { ExtractedMessage } from './yuku-analyzer.js';

export function occurrenceMessageEntries(
  moduleId: string,
  message: ExtractedMessage,
  value: (location?: { line: number; column: number }) => TranslationValue,
): Array<[string, TranslationValue]> {
  return [
    [runtimeMessageId(moduleId, message.id), value()],
    ...message.locations.map(
      (location) =>
        [
          runtimeMessageId(
            moduleId,
            message.id,
            translationOccurrenceKey(location),
          ),
          value(location),
        ] satisfies [string, TranslationValue],
    ),
  ];
}
