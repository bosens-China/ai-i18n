import { createMessageId, type ExtractedFile } from '@ai-i18n/core';
import { encodeOverrideId } from './override-id.js';
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
import { messageReference } from './project-targets.js';
import type {
  ListOverridesInput,
  ListTranslationsInput,
  OverrideItem,
  OverrideListResult,
  TranslationFileItem,
  TranslationItem,
  TranslationListResult,
} from './project.js';

const RESPONSE_CHARACTER_LIMIT = 100_000;

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
  const messageItems = collectMessages(
    project,
    files,
    input.locales,
    input.include_source_files,
  );
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
          translationItemKey,
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
  const items: OverrideItemWithSourceFiles[] = [];
  for (const [source, override] of Object.entries(project.overrides.messages)) {
    const defaultFiles = [...(filesBySource.get(source) ?? [])].sort();
    for (const [locale, value] of Object.entries(override.default ?? {})) {
      appendOverride(items, {
        target: { scope: 'default', source, locale },
        item: {
          scope: 'default',
          message: { source },
          locale,
          value,
          source_files: defaultFiles,
        },
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
          target: {
            scope: 'message',
            source,
            message_id: messageId,
            locale,
          },
          item: {
            scope: 'message',
            message: {
              source,
              ...(matching[0]?.comment ? { comment: matching[0].comment } : {}),
            },
            locale,
            value,
            source_files: sourceFiles,
          },
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
  const visibleItems = input.include_source_files
    ? filtered
    : filtered.map(withoutSourceFiles);
  const page = paginate(
    visibleItems,
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
  includeSourceFiles = false,
): TranslationItem[] {
  const selectedFiles = new Set(files.map((file) => file.source));
  const selectedMessageIds = new Set(
    files.flatMap((file) => file.messages.map((message) => message.id)),
  );
  // 文件过滤只缩小消息集合；显式请求时返回的 source_files 仍覆盖整个应用的共享范围。
  const occurrences = collectOccurrences(project.extracted);
  return [...occurrences.entries()]
    .filter(([messageId]) => selectedMessageIds.has(messageId))
    .map(([, matching]) => {
      const selected =
        matching.find((item) => selectedFiles.has(item.file)) ?? matching[0]!;
      const message = cacheMessage(project, selected);
      const translations = filterTranslations(message.translations, locales);
      const sourceFiles = [...new Set(matching.map((item) => item.file))];
      return {
        ...(includeSourceFiles ? { source_files: sourceFiles } : {}),
        message: messageReference(selected),
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
    .sort((left, right) => {
      const leftKey = translationItemKey(left);
      const rightKey = translationItemKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function appendOverride(
  items: OverrideItemWithSourceFiles[],
  input: {
    target: Parameters<typeof encodeOverrideId>[0];
    item: Omit<OverrideItemWithSourceFiles, 'override_id' | 'orphaned'>;
  },
): void {
  items.push({
    override_id: encodeOverrideId(input.target),
    ...input.item,
    orphaned: input.item.source_files.length === 0,
  });
}

type OverrideItemWithSourceFiles = OverrideItem & { source_files: string[] };

function withoutSourceFiles(item: OverrideItemWithSourceFiles): OverrideItem {
  return {
    override_id: item.override_id,
    scope: item.scope,
    message: item.message,
    locale: item.locale,
    value: item.value,
    orphaned: item.orphaned,
  };
}

function overrideItemKey(item: OverrideItem): string {
  return item.override_id;
}

function translationItemKey(item: TranslationItem): string {
  return createMessageId(item.message.source, {
    comment: item.message.comment,
  });
}
