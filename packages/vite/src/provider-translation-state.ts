import {
  resolveTranslationOverride,
  type ExtractedMessage,
  type LangOption,
  type TranslationOverridesFile,
  type TranslationValue,
} from '@ai-i18n/core';
import type {
  ProviderRequest,
  ProviderResult,
} from './provider-coordinator.js';
import {
  translationAttemptFieldKey,
  translationAttemptKey,
} from './translation-attempt.js';

interface ProviderRequestsOptions {
  messages: readonly ExtractedMessage[];
  sourceFile: string;
  locales: readonly LangOption[];
  sourceLang: string;
  overrides: TranslationOverridesFile;
  refreshCached: boolean;
  cachedTranslation(messageId: string, locale: string): TranslationValue;
}

export class ProviderTranslationState {
  private readonly attempted = new Set<string>();
  private readonly baselines = new Map<string, TranslationValue>();

  reset(): void {
    this.attempted.clear();
    this.baselines.clear();
  }

  requests(options: ProviderRequestsOptions): ProviderRequest[] {
    return options.messages.flatMap((message) => {
      const locales = options.locales.flatMap((locale) => {
        if (locale.value === options.sourceLang) return [];
        const attemptKey = translationAttemptKey(message, locale.value);
        const cached = options.cachedTranslation(message.id, locale.value);
        const reviewed = resolveTranslationOverride(
          options.overrides,
          message,
          locale.value,
          options.sourceFile,
        );
        if (
          reviewed !== undefined ||
          (!options.refreshCached && cached !== null) ||
          this.attempted.has(attemptKey)
        ) {
          return [];
        }
        this.attempted.add(attemptKey);
        this.baselines.set(
          translationAttemptFieldKey(message.id, locale.value),
          cached,
        );
        return [locale.value];
      });
      return locales.length
        ? [
            {
              messageId: message.id,
              source: message.source,
              ...(message.comment ? { comment: message.comment } : {}),
              locales,
            },
          ]
        : [];
    });
  }

  shouldApply(
    result: ProviderResult,
    current: TranslationValue,
    replaceCached: boolean,
  ): boolean {
    if (result.value === null) return false;
    if (!replaceCached) return current === null;
    const fieldKey = translationAttemptFieldKey(
      result.messageId,
      result.locale,
    );
    if (!this.baselines.has(fieldKey)) return current === null;
    // 请求发出后出现的新值来自外部写入，不能被旧 Provider 请求覆盖。
    return this.baselines.get(fieldKey) === current;
  }
}
