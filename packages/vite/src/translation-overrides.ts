import type {
  CacheMessage,
  ExtractedMessage,
  LangOption,
  TranslationOverridesFile,
  TranslationValue,
} from '@ai-i18n/core';
import { resolveTranslationOverride } from '@ai-i18n/core';
import type { ExtractResult } from './yuku-analyzer.js';

export function effectiveTranslation(
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  cacheMessages: Readonly<Record<string, CacheMessage>>,
  overrides: TranslationOverridesFile,
  sourceFile?: string,
): TranslationValue {
  return (
    resolveTranslationOverride(overrides, message, locale, sourceFile) ??
    cacheMessages[message.id]?.translations[locale] ??
    null
  );
}

export function snapshotEffectiveModules(
  modules: ReadonlyMap<string, ExtractResult>,
  locales: readonly LangOption[],
  sourceLang: string,
  translate: (
    message: ExtractedMessage,
    locale: string,
    moduleId: string,
  ) => TranslationValue,
): Map<string, string> {
  return new Map(
    [...modules].map(([moduleId, module]) => [
      moduleId,
      JSON.stringify(
        module.messages.map((message) => [
          message.id,
          locales
            .filter((locale) => locale.value !== sourceLang)
            .map((locale) => translate(message, locale.value, moduleId)),
        ]),
      ),
    ]),
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
