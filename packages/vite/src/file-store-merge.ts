import {
  type CacheMessage,
  type ExtractedFile,
  type LocaleFileV1,
  type TranslationOverridesFile,
  type TranslationValue,
  runtimeMessageId,
} from '@ai-i18n/core';
import { effectiveTranslation } from './translation-overrides.js';

export interface PendingProviderTranslation {
  baseline: TranslationValue;
  value: string;
}

export function hydrateExtracted(extracted: ExtractedFile): ExtractedFile {
  return {
    ...extracted,
    messages: extracted.messages
      .map((message) => ({
        ...message,
        locations: [...message.locations].sort(
          (left, right) => left.line - right.line || left.column - right.column,
        ),
      }))
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
  };
}

export function hydrateLocale(
  locale: LocaleFileV1,
  files: readonly ExtractedFile[],
  cacheMessages: Record<string, CacheMessage>,
  overrides: TranslationOverridesFile,
): LocaleFileV1 {
  return {
    ...locale,
    messages: Object.fromEntries(
      files.flatMap((file) =>
        file.messages.map((message) => [
          runtimeMessageId(file.source, message.id),
          effectiveTranslation(
            message,
            locale.locale.value,
            cacheMessages,
            overrides,
            file.source,
          ),
        ]),
      ),
    ),
  };
}

export function mergeProjectMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
  pendingProvider: ReadonlyMap<string, PendingProviderTranslation> = new Map(),
): Record<string, CacheMessage> {
  // 磁盘上的 Agent 编辑优先；ProjectState 只补充新消息和缺失翻译。
  const reused = structuredClone(incoming);
  for (const [messageId, next] of Object.entries(reused)) {
    const currentMessage = Object.hasOwn(current, messageId)
      ? current[messageId]
      : undefined;
    if (currentMessage && currentMessage.sourceLang === next.sourceLang) {
      keepCommittedTranslations(
        next,
        currentMessage,
        messageId,
        pendingProvider,
      );
      continue;
    }
    const candidates = currentMessage
      ? [currentMessage]
      : Object.values(current).filter(
          (historic) =>
            historic.sourceLang !== next.sourceLang &&
            historic.comment === next.comment &&
            historic.translations[next.sourceLang] === next.source,
        );
    if (candidates.length !== 1) continue;
    const historic = candidates[0]!;
    keepCommittedTranslations(next, historic, messageId, pendingProvider);
    delete next.translations[next.sourceLang];
    if (historic.sourceLang) {
      next.translations[historic.sourceLang] = historic.source;
    }
  }
  return overlayMessages(current, reused, false, true);
}

export function overlayMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
  overwriteNull: boolean,
  overwriteMetadata = false,
): Record<string, CacheMessage> {
  // structuredClone 不保留空原型，合并时重新建立仅含消息自身键的字典。
  const merged: Record<string, CacheMessage> = Object.assign(
    Object.create(null),
    structuredClone(current),
  );
  for (const [messageId, next] of Object.entries(incoming)) {
    const previous = merged[messageId];
    if (!previous) {
      merged[messageId] = structuredClone(next);
      continue;
    }
    if (overwriteMetadata) {
      if (previous.sourceLang !== next.sourceLang) {
        delete previous.translations[next.sourceLang];
      }
      previous.source = next.source;
      previous.sourceLang = next.sourceLang;
      if (next.comment) previous.comment = next.comment;
      else delete previous.comment;
    } else if (!previous.comment && next.comment) {
      previous.comment = next.comment;
    }
    if (!previous.sourceLang && next.sourceLang) {
      previous.sourceLang = next.sourceLang;
    }
    for (const [locale, value] of Object.entries(next.translations)) {
      if (
        value !== null ||
        overwriteNull ||
        !(locale in previous.translations)
      ) {
        previous.translations[locale] = value;
      }
    }
  }
  return merged;
}

function keepCommittedTranslations(
  target: CacheMessage,
  current: CacheMessage,
  messageId: string,
  pendingProvider: ReadonlyMap<string, PendingProviderTranslation>,
): void {
  for (const [locale, value] of Object.entries(current.translations)) {
    const pending = pendingProvider.get(translationFieldKey(messageId, locale));
    if (
      pending &&
      pending.baseline === value &&
      pending.value === target.translations[locale]
    ) {
      continue;
    }
    // 锁内读到的项目值优先，包括外部显式清空；只有基线未变的待提交结果可替换。
    target.translations[locale] = value;
  }
}

export function translationFieldKey(messageId: string, locale: string): string {
  return `${messageId}\0${locale}`;
}
