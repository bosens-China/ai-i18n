import type { ExtractedFile } from '@ai-i18n/core';
import { encodeOverrideId, overrideTargetKey } from './override-id.js';
import { paginate } from './pagination.js';
import {
  cacheMessage,
  collectOccurrences,
  filterTranslations,
  findExtracted,
  loadProject,
  validateLocales,
  type LoadedProject,
} from './project-files.js';
import type {
  ListOverridesInput,
  ListTranslationsInput,
  OverrideItem,
  OverrideListResult,
  TranslationFileItem,
  TranslationItem,
  TranslationListResult,
} from './project.js';

const RESPONSE_CHARACTER_LIMIT = 25_000;

export async function listTranslations(
  input: ListTranslationsInput,
): Promise<TranslationListResult<TranslationFileItem | TranslationItem>> {
  const project = await loadProject(input.i18n_directory);
  validateLocales(project, input.locales);
  const files = selectFiles(project, input.source_files);
  // 这里刻意读取原始 AI Memory；人工覆盖不能掩盖仍待补齐的 null。
  const fileItems = files.map((file) =>
    summarizeFile(project, file, input.locales),
  );
  const messageItems = collectMessages(project, files, input.locales);
  const view = input.view ?? 'missing';
  const items =
    view === 'summary'
      ? fileItems
      : messageItems.filter(
          (item) => view === 'all' || item.missing_locales.length > 0,
        );
  const page =
    view === 'summary'
      ? paginate(
          items as TranslationFileItem[],
          (item) => item.source_file,
          input.limit,
          input.cursor,
          RESPONSE_CHARACTER_LIMIT,
        )
      : paginate(
          items as TranslationItem[],
          (item) => item.message_id,
          input.limit,
          input.cursor,
          RESPONSE_CHARACTER_LIMIT,
        );
  const missingMessages = messageItems.filter(
    (item) => item.missing_locales.length > 0,
  );
  const pendingFiles = fileItems.filter(
    (item) => item.missing_translation_count > 0,
  );
  return {
    view,
    total_file_count: fileItems.length,
    completed_file_count: fileItems.length - pendingFiles.length,
    pending_file_count: pendingFiles.length,
    extracted_message_count: files.reduce(
      (count, file) => count + file.messages.length,
      0,
    ),
    message_count: messageItems.length,
    missing_message_count: missingMessages.length,
    missing_translation_count: missingMessages.reduce(
      (count, item) => count + item.missing_locales.length,
      0,
    ),
    ...page,
  };
}

export async function listOverrides(
  input: ListOverridesInput,
): Promise<OverrideListResult> {
  const project = await loadProject(input.i18n_directory);
  if (input.source_files) selectFiles(project, input.source_files);
  const requestedFiles = input.source_files
    ? new Set(input.source_files)
    : undefined;
  const requestedLocales = input.locales ? new Set(input.locales) : undefined;
  const occurrences = collectOccurrences(project.extracted);
  const filesBySource = new Map<string, Set<string>>();
  for (const file of project.extracted) {
    for (const message of file.messages) {
      const files = filesBySource.get(message.source) ?? new Set<string>();
      files.add(file.source);
      filesBySource.set(message.source, files);
    }
  }
  const items: OverrideItem[] = [];
  for (const [source, override] of Object.entries(project.overrides.messages)) {
    const defaultFiles = [...(filesBySource.get(source) ?? [])].sort();
    for (const [locale, value] of Object.entries(override.default ?? {})) {
      appendOverride(items, {
        scope: 'default',
        source,
        locale,
        value,
        source_files: defaultFiles,
      });
    }
    for (const [messageId, translations] of Object.entries(
      override.byId ?? {},
    )) {
      const matching = (occurrences.get(messageId) ?? []).filter(
        (item) => item.source === source,
      );
      const sourceFiles = [
        ...new Set(matching.map((item) => item.file)),
      ].sort();
      for (const [locale, value] of Object.entries(translations)) {
        appendOverride(items, {
          scope: 'message',
          source,
          message_id: messageId,
          ...(matching[0]?.comment ? { comment: matching[0].comment } : {}),
          locale,
          value,
          source_files: sourceFiles,
        });
      }
    }
  }
  const filtered = items
    .filter(
      (item) =>
        (!requestedFiles ||
          item.source_files.some((file) => requestedFiles.has(file))) &&
        (!requestedLocales || requestedLocales.has(item.locale)),
    )
    .sort((left, right) =>
      overrideItemKey(left) < overrideItemKey(right)
        ? -1
        : overrideItemKey(left) > overrideItemKey(right)
          ? 1
          : 0,
    );
  const page = paginate(
    filtered,
    overrideItemKey,
    input.limit,
    input.cursor,
    RESPONSE_CHARACTER_LIMIT,
  );
  return {
    default_override_count: filtered.filter((item) => item.scope === 'default')
      .length,
    message_override_count: filtered.filter((item) => item.scope === 'message')
      .length,
    ...page,
  };
}

function selectFiles(
  project: LoadedProject,
  requested?: readonly string[],
): ExtractedFile[] {
  const files = requested
    ? [...new Set(requested)].map((source) => findExtracted(project, source))
    : [...project.extracted];
  return files.sort((left, right) =>
    left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
  );
}

function summarizeFile(
  project: LoadedProject,
  file: ExtractedFile,
  locales?: readonly string[],
): TranslationFileItem {
  const missingByLocale: Record<string, number> = {};
  let missingMessageCount = 0;
  for (const extractedMessage of file.messages) {
    const translations = filterTranslations(
      cacheMessage(project, extractedMessage).translations,
      locales,
    );
    let missing = false;
    for (const [locale, value] of Object.entries(translations)) {
      if (value !== null) continue;
      missing = true;
      missingByLocale[locale] = (missingByLocale[locale] ?? 0) + 1;
    }
    if (missing) missingMessageCount += 1;
  }
  return {
    source_file: file.source,
    message_count: file.messages.length,
    missing_message_count: missingMessageCount,
    missing_translation_count: Object.values(missingByLocale).reduce(
      (sum, count) => sum + count,
      0,
    ),
    missing_by_locale: missingByLocale,
  };
}

function collectMessages(
  project: LoadedProject,
  files: readonly ExtractedFile[],
  locales?: readonly string[],
): TranslationItem[] {
  const occurrences = collectOccurrences(files);
  return [...occurrences.entries()]
    .map(([messageId, matching]) => {
      const selected = matching[0]!;
      const message = cacheMessage(project, selected);
      const translations = filterTranslations(message.translations, locales);
      const sourceFiles = [...new Set(matching.map((item) => item.file))];
      return {
        source_file: selected.file,
        source_files: sourceFiles,
        message_id: messageId,
        source: selected.source,
        ...(selected.comment ? { comment: selected.comment } : {}),
        translations,
        missing_locales: Object.entries(translations)
          .filter(([, value]) => value === null)
          .map(([locale]) => locale),
        occurrence_count: matching.reduce(
          (count, item) => count + item.locations.length,
          0,
        ),
        ...(files.length === 1 ? { locations: selected.locations } : {}),
      } satisfies TranslationItem;
    })
    .sort((left, right) =>
      left.message_id < right.message_id
        ? -1
        : left.message_id > right.message_id
          ? 1
          : 0,
    );
}

function appendOverride(
  items: OverrideItem[],
  item: Omit<OverrideItem, 'override_id' | 'orphaned'>,
): void {
  const target = {
    scope: item.scope,
    source: item.source,
    ...(item.message_id ? { message_id: item.message_id } : {}),
    locale: item.locale,
  };
  items.push({
    override_id: encodeOverrideId(target),
    ...item,
    orphaned: item.source_files.length === 0,
  });
}

function overrideItemKey(item: OverrideItem): string {
  return overrideTargetKey({
    scope: item.scope,
    source: item.source,
    ...(item.message_id ? { message_id: item.message_id } : {}),
    locale: item.locale,
  });
}
