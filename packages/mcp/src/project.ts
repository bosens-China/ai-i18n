import path from 'node:path';
import {
  mergeCacheMessages,
  parseCacheFile,
  parseExtractedFile,
  type CacheMessage,
  type ExtractedFileV1,
} from '@ai-i18n/core';
import { paginate, type Page } from './pagination.js';
import {
  listJsonFiles,
  readJsonRequired,
  resolveI18nDirectory,
  writeJsonAtomic,
} from './project-files.js';

const TRANSLATION_CHARACTER_LIMIT = 25_000;

export interface ListFilesInput {
  i18n_directory: string;
  locale?: string;
  cursor?: string;
  limit: number;
}

export interface TranslationFileItem {
  file: string;
  message_count: number;
  missing_count: number;
  missing_by_locale: Record<string, number>;
}

export interface ListTranslationsInput {
  i18n_directory: string;
  file?: string;
  locale?: string;
  missing_only: boolean;
  cursor?: string;
  limit: number;
}

export interface TranslationItem {
  message_id: string;
  source: string;
  comment?: string;
  translations: Record<string, string | null>;
  missing_locales: string[];
  file: string;
  occurrence_count: number;
  locations?: Array<{ line: number; column: number }>;
}

export interface TranslationWrite {
  message_id: string;
  locale: string;
  value: string;
}

export interface WriteTranslationsInput {
  i18n_directory: string;
  file: string;
  translations: readonly TranslationWrite[];
}

export interface WriteTranslationsResult {
  file: string;
  applied_count: number;
  unchanged_count: number;
}

interface LoadedExtracted {
  path: string;
  value: ExtractedFileV1;
}

interface LoadedProject {
  extracted: LoadedExtracted[];
  messages: Record<string, CacheMessage>;
  locales: Set<string>;
}

export class AiI18nProjectService {
  private writeQueue = Promise.resolve();

  constructor(private readonly workspaceRoot: string) {}

  async listFiles(input: ListFilesInput): Promise<Page<TranslationFileItem>> {
    const project = await this.load(input.i18n_directory);
    validateLocale(project, input.locale);
    const items = project.extracted
      .map(({ value }) => summarizeFile(value, project.messages, input.locale))
      .filter((item) => item.missing_count > 0)
      .sort((left, right) => left.file.localeCompare(right.file));
    return paginate(items, (item) => item.file, input.limit, input.cursor);
  }

  async listTranslations(
    input: ListTranslationsInput,
  ): Promise<Page<TranslationItem>> {
    const project = await this.load(input.i18n_directory);
    validateLocale(project, input.locale);
    const selected = input.file
      ? [findExtracted(project, input.file)]
      : project.extracted;
    const occurrences = collectOccurrences(project.extracted);
    const messageIds = new Set(
      selected.flatMap(({ value }) =>
        value.messages.map((message) => message.id),
      ),
    );
    const items = [...messageIds]
      .map((messageId) => {
        const message = project.messages[messageId]!;
        const matching = occurrences.get(messageId)!;
        const selectedOccurrence = input.file
          ? matching.find((item) => item.file === input.file)!
          : matching[0]!;
        const translations = filterTranslations(
          message.translations,
          input.locale,
        );
        return {
          message_id: messageId,
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          translations,
          missing_locales: Object.entries(translations)
            .filter(([, value]) => value === null)
            .map(([locale]) => locale),
          file: selectedOccurrence.file,
          occurrence_count: matching.reduce(
            (count, item) => count + item.locations.length,
            0,
          ),
          ...(input.file ? { locations: selectedOccurrence.locations } : {}),
        } satisfies TranslationItem;
      })
      .filter((item) => !input.missing_only || item.missing_locales.length > 0)
      .sort((left, right) => left.message_id.localeCompare(right.message_id));
    return paginate(
      items,
      (item) => item.message_id,
      input.limit,
      input.cursor,
      TRANSLATION_CHARACTER_LIMIT,
    );
  }

  writeTranslations(
    input: WriteTranslationsInput,
  ): Promise<WriteTranslationsResult> {
    const task = this.writeQueue.then(
      () => this.applyTranslations(input),
      () => this.applyTranslations(input),
    );
    this.writeQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async applyTranslations(
    input: WriteTranslationsInput,
  ): Promise<WriteTranslationsResult> {
    const project = await this.load(input.i18n_directory);
    const extracted = findExtracted(project, input.file);
    const updates = new Set<string>();
    let unchangedCount = 0;

    for (const update of input.translations) {
      const updateKey = `${update.message_id}\0${update.locale}`;
      if (updates.has(updateKey)) {
        throw new Error(
          `[ai-i18n/mcp] duplicate translation "${update.message_id}" / "${update.locale}"`,
        );
      }
      updates.add(updateKey);
      const local = extracted.value.messages.find(
        (message) => message.id === update.message_id,
      );
      if (!local) {
        throw new Error(
          `[ai-i18n/mcp] message "${update.message_id}" does not belong to "${input.file}"`,
        );
      }
      const effective = project.messages[update.message_id]!;
      if (!(update.locale in effective.translations)) {
        throw new Error(
          `[ai-i18n/mcp] unknown locale "${update.locale}" for message "${update.message_id}"`,
        );
      }
      const current = effective.translations[update.locale];
      if (current !== null) {
        if (current === update.value) {
          unchangedCount += 1;
          continue;
        }
        throw new Error(
          `[ai-i18n/mcp] refusing to overwrite "${update.message_id}" / "${update.locale}"; current value is non-null`,
        );
      }
    }

    const applicable = input.translations.filter((update) => {
      return (
        project.messages[update.message_id]!.translations[update.locale] ===
        null
      );
    });
    for (const update of applicable) {
      const message = extracted.value.messages.find(
        (item) => item.id === update.message_id,
      )!;
      message.translations[update.locale] = update.value;
    }
    if (applicable.length)
      await writeJsonAtomic(extracted.path, extracted.value);
    return {
      file: input.file,
      applied_count: applicable.length,
      unchanged_count: unchangedCount,
    };
  }

  private async load(i18nDirectory: string): Promise<LoadedProject> {
    const directory = await resolveI18nDirectory(
      this.workspaceRoot,
      i18nDirectory,
    );
    const cache = parseCacheFile(
      await readJsonRequired(path.join(directory, 'cache.json')),
    );
    const extractedPaths = await listJsonFiles(
      path.join(directory, 'extracted'),
    );
    const extracted = await Promise.all(
      extractedPaths.map(async (file) => ({
        path: file,
        value: parseExtractedFile(await readJsonRequired(file)),
      })),
    );
    const sources = new Set<string>();
    let messages = cache.messages;
    for (const item of extracted) {
      if (sources.has(item.value.source)) {
        throw new Error(
          `[ai-i18n/mcp] duplicate extracted source "${item.value.source}"`,
        );
      }
      sources.add(item.value.source);
      messages = mergeCacheMessages(
        messages,
        messagesFromExtracted(item.value),
      );
    }
    return {
      extracted,
      messages,
      locales: new Set(
        Object.values(messages).flatMap((message) =>
          Object.keys(message.translations),
        ),
      ),
    };
  }
}

function messagesFromExtracted(
  file: ExtractedFileV1,
): Record<string, CacheMessage> {
  return Object.fromEntries(
    file.messages.map((message) => [
      message.id,
      {
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        translations: message.translations,
      },
    ]),
  );
}

function summarizeFile(
  file: ExtractedFileV1,
  messages: Record<string, CacheMessage>,
  locale?: string,
): TranslationFileItem {
  const missingByLocale: Record<string, number> = {};
  for (const extractedMessage of file.messages) {
    const translations = filterTranslations(
      messages[extractedMessage.id]!.translations,
      locale,
    );
    for (const [targetLocale, value] of Object.entries(translations)) {
      if (value === null)
        missingByLocale[targetLocale] =
          (missingByLocale[targetLocale] ?? 0) + 1;
    }
  }
  return {
    file: file.source,
    message_count: file.messages.length,
    missing_count: Object.values(missingByLocale).reduce(
      (sum, count) => sum + count,
      0,
    ),
    missing_by_locale: missingByLocale,
  };
}

function filterTranslations(
  translations: Record<string, string | null>,
  locale?: string,
): Record<string, string | null> {
  return locale ? { [locale]: translations[locale]! } : { ...translations };
}

function validateLocale(project: LoadedProject, locale?: string): void {
  if (locale && project.locales.size > 0 && !project.locales.has(locale)) {
    throw new Error(`[ai-i18n/mcp] unknown target locale "${locale}"`);
  }
}

function findExtracted(
  project: LoadedProject,
  source: string,
): LoadedExtracted {
  const extracted = project.extracted.find(
    (item) => item.value.source === source,
  );
  if (!extracted)
    throw new Error(`[ai-i18n/mcp] extracted source not found: "${source}"`);
  return extracted;
}

function collectOccurrences(
  files: readonly LoadedExtracted[],
): Map<
  string,
  Array<{ file: string; locations: Array<{ line: number; column: number }> }>
> {
  const occurrences = new Map<
    string,
    Array<{ file: string; locations: Array<{ line: number; column: number }> }>
  >();
  for (const { value } of files) {
    for (const message of value.messages) {
      const items = occurrences.get(message.id) ?? [];
      items.push({ file: value.source, locations: message.locations });
      occurrences.set(message.id, items);
    }
  }
  for (const items of occurrences.values()) {
    items.sort((left, right) => left.file.localeCompare(right.file));
  }
  return occurrences;
}
