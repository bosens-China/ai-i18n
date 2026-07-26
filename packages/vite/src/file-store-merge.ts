import {
  type CacheMessage,
  type ExtractedFile,
  type ExtractedMessage,
  type LocaleFileV1,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import { effectiveTranslation } from './translation-overrides.js';

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
  messages: readonly ExtractedMessage[],
  cacheMessages: Record<string, CacheMessage>,
  overrides: TranslationOverridesFile,
): LocaleFileV1 {
  return {
    ...locale,
    messages: Object.fromEntries(
      messages.map((message) => [
        message.id,
        effectiveTranslation(
          message,
          locale.locale.value,
          cacheMessages,
          overrides,
        ),
      ]),
    ),
  };
}

export function mergeProjectMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
): Record<string, CacheMessage> {
  // 磁盘上的 Agent 编辑优先；ProjectState 只补充新消息和缺失翻译。
  const reused = structuredClone(incoming);
  for (const [messageId, next] of Object.entries(reused)) {
    if (current[messageId]) {
      keepCommittedTranslations(next, current[messageId]);
      continue;
    }
    const candidates = Object.entries(current).filter(
      ([, historic]) =>
        historic.sourceLang !== next.sourceLang &&
        historic.translations[next.sourceLang] === messageId,
    );
    if (candidates.length !== 1) continue;
    const [historicId, historic] = candidates[0]!;
    const translations = { ...historic.translations };
    delete translations[next.sourceLang];
    if (historic.sourceLang) {
      translations[historic.sourceLang] = historicId;
    }
    for (const [locale, value] of Object.entries(next.translations)) {
      if (value !== null || !(locale in translations)) {
        translations[locale] = value;
      }
    }
    next.translations = translations;
  }
  return overlayMessages(current, reused, false, true);
}

export function overlayMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
  overwriteNull: boolean,
  overwriteMetadata = false,
): Record<string, CacheMessage> {
  const merged = structuredClone(current);
  for (const [messageId, next] of Object.entries(incoming)) {
    const previous = merged[messageId];
    if (!previous) {
      merged[messageId] = structuredClone(next);
      continue;
    }
    if (overwriteMetadata) {
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
): void {
  for (const [locale, value] of Object.entries(current.translations)) {
    if (value !== null || !(locale in target.translations)) {
      target.translations[locale] = value;
    }
  }
}
