import { createMessageId, type ExtractedFile } from '@ai-i18n/core';
import { fail } from './errors.js';
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
  const view = input.view ?? 'missing';
  if (
    view === 'summary' &&
    (input.source_contains !== undefined ||
      input.translation_contains !== undefined)
  ) {
    fail('INVALID_TRANSLATION_FILTER', { view });
  }
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
    input.include_occurrences,
  );
  const filteredMessageItems = filterMessageItems(messageItems, input);
  const items =
    view === 'summary'
      ? fileItems
      : filteredMessageItems.filter(
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

function filterMessageItems(
  items: readonly TranslationItem[],
  input: Pick<
    ListTranslationsInput,
    'source_contains' | 'translation_contains'
  >,
): TranslationItem[] {
  const sourceQuery = input.source_contains?.toLowerCase();
  const translationQuery = input.translation_contains?.toLowerCase();
  return items.filter(
    (item) =>
      (!sourceQuery ||
        item.message.source.toLowerCase().includes(sourceQuery)) &&
      (!translationQuery ||
        Object.values(item.translations).some((value) =>
          value?.toLowerCase().includes(translationQuery),
        )),
  );
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
  const items: OverrideItemWithSourceFiles[] = [];
  for (const rule of project.overrides.rules) {
    const messageId = createMessageId(rule.source, { comment: rule.comment });
    const matching = (occurrences.get(messageId) ?? []).filter(
      (item) =>
        item.source === rule.source &&
        (!rule.files || rule.files.includes(item.file)) &&
        (!rule.occurrences ||
          rule.occurrences.some(
            (occurrence) =>
              occurrence.file === item.file &&
              item.locations.some(
                (location) =>
                  location.line === occurrence.line &&
                  location.column === occurrence.column,
              ),
          )),
    );
    const sourceFiles = [...new Set(matching.map((item) => item.file))].sort();
    for (const [locale, value] of Object.entries(rule.translations)) {
      appendOverride(items, {
        target: {
          source: rule.source,
          ...(rule.comment ? { comment: rule.comment } : {}),
          ...(rule.files ? { files: rule.files } : {}),
          ...(rule.occurrences
            ? {
                occurrences: rule.occurrences.map((occurrence) => ({
                  source_file: occurrence.file,
                  line: occurrence.line,
                  column: occurrence.column,
                })),
              }
            : {}),
          locale,
        },
        item: {
          scope: rule.occurrences
            ? 'occurrences'
            : rule.files
              ? 'files'
              : 'global',
          message: {
            source: rule.source,
            ...(rule.comment ? { comment: rule.comment } : {}),
          },
          ...(rule.files ? { files: rule.files } : {}),
          ...(rule.occurrences
            ? {
                occurrences: rule.occurrences.map((occurrence) => ({
                  source_file: occurrence.file,
                  line: occurrence.line,
                  column: occurrence.column,
                })),
              }
            : {}),
          locale,
          value,
          source_files: sourceFiles,
        },
      });
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
    global_override_count: filtered.filter((item) => item.scope === 'global')
      .length,
    file_override_count: filtered.filter((item) => item.scope === 'files')
      .length,
    occurrence_override_count: filtered.filter(
      (item) => item.scope === 'occurrences',
    ).length,
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
  includeOccurrences = false,
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
        ...(includeOccurrences
          ? {
              occurrences: matching.map((item) => ({
                source_file: item.file,
                locations: item.locations,
              })),
            }
          : {}),
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
    ...(item.files ? { files: item.files } : {}),
    ...(item.occurrences ? { occurrences: item.occurrences } : {}),
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
