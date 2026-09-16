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

// 只查询有效译文，不消费 Provider 的请求次数；任一实际出现位置缺失就需要补译。
export function findMissingTranslations(
  options: ProviderRequestsOptions,
): ProviderRequest[] {
  return options.messages.flatMap((message) => {
    const locales = options.locales
      .filter(
        ({ value: locale }) =>
          locale !== options.sourceLang &&
          (options.refreshCached ||
            options.cachedTranslation(message.id, locale) === null) &&
          (message.locations.length ? message.locations : [undefined]).some(
            (location) =>
              resolveTranslationOverride(
                options.overrides,
                message,
                locale,
                options.sourceFile,
                location,
              ) === undefined,
          ),
      )
      .map(({ value }) => value);
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

export class ProviderTranslationState {
  private readonly attempted = new Set<string>();
  private readonly baselines = new Map<string, TranslationValue>();

  reset(): void {
    this.attempted.clear();
    this.baselines.clear();
  }

  requests(
    missing: readonly ProviderRequest[],
    cachedTranslation: ProviderRequestsOptions['cachedTranslation'],
  ): ProviderRequest[] {
    return missing.flatMap((message) => {
      const locales = message.locales.filter((locale) => {
        const attemptKey = translationAttemptKey(
          { ...message, id: message.messageId },
          locale,
        );
        if (this.attempted.has(attemptKey)) return false;
        this.attempted.add(attemptKey);
        this.baselines.set(
          translationAttemptFieldKey(message.messageId, locale),
          cachedTranslation(message.messageId, locale),
        );
        return true;
      });
      return locales.length ? [{ ...message, locales }] : [];
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
