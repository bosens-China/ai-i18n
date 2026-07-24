import {
  parseMessageId,
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
): LocaleFileV1 {
  return {
    ...locale,
    messages: Object.fromEntries(
      Object.keys(locale.messages).map((id) => [
        id,
        cacheMessages[id]?.translations[locale.locale.value] ?? null,
      ]),
    ),
  };
}

export function messagesFromExtracted(
  extracted: ExtractedFileV1,
  sourceLang: string,
): Record<string, CacheMessage> {
  return Object.fromEntries(
    extracted.messages.map((message) => [
      message.id,
      {
        sourceLang,
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
  const reused = structuredClone(incoming);
  for (const [messageId, next] of Object.entries(reused)) {
    if (current[messageId]) continue;
    const source = parseMessageId(messageId).source;
    const candidates = Object.entries(current).filter(
      ([historicId, historic]) =>
        historic.sourceLang !== next.sourceLang &&
        historic.translations[next.sourceLang] === source &&
        (parseMessageId(historicId).comment ?? '') ===
          (parseMessageId(messageId).comment ?? ''),
    );
    if (candidates.length !== 1) continue;
    const [historicId, historic] = candidates[0]!;
    const translations = { ...historic.translations };
    delete translations[next.sourceLang];
    if (historic.sourceLang) {
      translations[historic.sourceLang] = parseMessageId(historicId).source;
    }
    for (const [locale, value] of Object.entries(next.translations)) {
      if (value !== null || !(locale in translations)) {
        translations[locale] = value;
      }
    }
    next.translations = translations;
  }
  return overlayMessages(current, reused, false);
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
    if ((previous.comment ?? '') !== (next.comment ?? '')) {
      throw new Error(
        `[ai-i18n] message "${messageId}" has inconsistent metadata`,
      );
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
