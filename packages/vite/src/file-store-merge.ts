import {
  TranslationConflictError,
  type CacheMessage,
  type ExtractedFileV1,
  type LocaleFileV1,
} from '@ai-i18n/core';

export function hydrateExtracted(
  extracted: ExtractedFileV1,
  cacheMessages: Record<string, CacheMessage>,
  targetLocales: readonly string[],
): ExtractedFileV1 {
  return {
    ...extracted,
    messages: extracted.messages
      .map((message) => ({
        ...message,
        translations: Object.fromEntries(
          targetLocales.map((locale) => [
            locale,
            cacheMessages[message.id]!.translations[locale] ?? null,
          ]),
        ),
        locations: [...message.locations].sort(
          (left, right) => left.line - right.line || left.column - right.column,
        ),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function hydrateLocale(
  locale: LocaleFileV1,
  cacheMessages: Record<string, CacheMessage>,
  sourceLang: string,
): LocaleFileV1 {
  return {
    ...locale,
    messages: Object.fromEntries(
      Object.entries(locale.messages).map(([id, value]) => [
        id,
        locale.locale.value === sourceLang
          ? value
          : (cacheMessages[id]?.translations[locale.locale.value] ?? null),
      ]),
    ),
  };
}

export function messagesFromExtracted(
  extracted: ExtractedFileV1,
): Record<string, CacheMessage> {
  return Object.fromEntries(
    extracted.messages.map((message) => [
      message.id,
      {
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        translations: message.translations,
      },
    ]),
  );
}

export function mergeProjectMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
): Record<string, CacheMessage> {
  // 磁盘上的 Agent 编辑优先；ProjectState 只补充新消息和缺失翻译。
  return overlayMessages(current, incoming, false);
}

export function overlayMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
  overwriteNull: boolean,
): Record<string, CacheMessage> {
  const merged = structuredClone(current);
  for (const [messageId, next] of Object.entries(incoming)) {
    const previous = merged[messageId];
    if (!previous) {
      merged[messageId] = structuredClone(next);
      continue;
    }
    if (
      previous.source !== next.source ||
      (previous.comment ?? '') !== (next.comment ?? '')
    ) {
      throw new Error(
        `[ai-i18n] message "${messageId}" has inconsistent metadata`,
      );
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

export function withConflictFiles(
  error: unknown,
  extractedFiles: readonly ExtractedFileV1[],
): unknown {
  if (!(error instanceof TranslationConflictError)) return error;
  const files = extractedFiles
    .filter((file) =>
      file.messages.some((message) => message.id === error.messageId),
    )
    .map((file) => file.source);
  const locations = ['i18n/cache.json', ...new Set(files)].join(', ');
  return new Error(`${error.message}; files: ${locations}`);
}
