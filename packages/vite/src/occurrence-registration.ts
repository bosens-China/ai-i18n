import {
  runtimeMessageId,
  translationOccurrenceKey,
  type LangOption,
  type ModuleMessages,
  type TranslationValue,
} from '@ai-i18n/core';
import type { ExtractResult, ExtractedMessage } from './yuku-analyzer.js';
import type { SourceLocation } from './extractor.js';
import { diagnosticMessage } from '@ai-i18n/analyzer';

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

type ResolveTranslation = (
  message: ExtractedMessage,
  locale: string,
  sourceFile: string,
  occurrence?: SourceLocation,
) => TranslationValue;

export function moduleRegistration(
  result: ExtractResult | undefined,
  moduleId: string,
  locales: readonly LangOption[],
  sourceLang: string,
  resolve: ResolveTranslation,
  localeValue?: string,
): ModuleMessages | null {
  if (!result?.messages.length) return null;
  const selected = localeValue
    ? locales.filter((locale) => locale.value === localeValue)
    : locales;
  return Object.fromEntries(
    selected.map((locale) => [
      locale.value,
      Object.fromEntries(
        result.messages.flatMap((message) =>
          occurrenceMessageEntries(moduleId, message, (location) =>
            locale.value === sourceLang
              ? message.source
              : resolve(message, locale.value, moduleId, location),
          ),
        ),
      ),
    ]),
  );
}

export function localeRegistration(
  modules: ReadonlyMap<string, ExtractResult>,
  locale: string,
  locales: readonly LangOption[],
  sourceLang: string,
  resolve: ResolveTranslation,
): Record<string, TranslationValue> {
  if (
    locale === sourceLang ||
    !locales.some((option) => option.value === locale)
  ) {
    throw new RangeError(
      diagnosticMessage(
        `[ai-i18n] 不支持目标 locale“${locale}”。`,
        `[ai-i18n] Unsupported target locale "${locale}".`,
      ),
    );
  }
  return Object.fromEntries(
    [...modules].flatMap(([moduleId, result]) =>
      result.messages.flatMap((message) =>
        occurrenceMessageEntries(moduleId, message, (location) =>
          resolve(message, locale, moduleId, location),
        ),
      ),
    ),
  );
}
