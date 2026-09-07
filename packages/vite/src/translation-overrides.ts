import type {
  CacheMessage,
  ExtractedMessage,
  TranslationOverridesFile,
  TranslationValue,
} from '@ai-i18n/core';
import { resolveTranslationOverride } from '@ai-i18n/core';

export function effectiveTranslation(
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  cacheMessages: Readonly<Record<string, CacheMessage>>,
  overrides: TranslationOverridesFile,
  sourceFile?: string,
): TranslationValue {
  return (
    resolveTranslationOverride(overrides, message, locale, sourceFile) ??
    (Object.hasOwn(cacheMessages, message.id)
      ? cacheMessages[message.id]?.translations[locale]
      : undefined) ??
    null
  );
}

export function changedEffectiveModules(
  previous: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  return [...new Set([...previous.keys(), ...current.keys()])].filter(
    (moduleId) => previous.get(moduleId) !== current.get(moduleId),
  );
}
