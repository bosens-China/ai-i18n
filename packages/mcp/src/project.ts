import path from 'node:path';
import {
  hasSameTemplateTokens,
  resolveTranslationOverride,
} from '@ai-i18n/core';
import {
  transactTranslationOverrides,
  transactTranslationMemory,
} from '@ai-i18n/core/translation-memory';
import { paginate, type Page } from './pagination.js';
import {
  cacheMessage,
  collectOccurrences,
  effectiveTranslations,
  filterTranslations,
  findExtracted,
  loadProject,
  summarizeFile,
  validateLocale,
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
  mode?: 'fill' | 'review';
  review_scope?: 'default' | 'message';
  translations: readonly TranslationWrite[];
}

export interface WriteTranslationsResult {
  file: string;
  applied_count: number;
  unchanged_count: number;
}

export class AiI18nProjectService {
  async listFiles(input: ListFilesInput): Promise<Page<TranslationFileItem>> {
    const project = await loadProject(input.i18n_directory);
    validateLocale(project, input.locale);
    const items = project.extracted
      .map(({ value }) => summarizeFile(value, project, input.locale))
      .filter((item) => item.missing_count > 0)
      .sort((left, right) => left.file.localeCompare(right.file));
    return paginate(items, (item) => item.file, input.limit, input.cursor);
  }

  async listTranslations(
    input: ListTranslationsInput,
  ): Promise<Page<TranslationItem>> {
    const project = await loadProject(input.i18n_directory);
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
        const matching = occurrences.get(messageId)!;
        const selectedOccurrence = input.file
          ? matching.find((item) => item.file === input.file)!
          : matching[0]!;
        const message = cacheMessage(project, selectedOccurrence);
        const translations = filterTranslations(
          effectiveTranslations(project, selectedOccurrence),
          input.locale,
        );
        const comment = selectedOccurrence.comment ?? message.comment;
        return {
          message_id: messageId,
          source: selectedOccurrence.source,
          ...(comment ? { comment } : {}),
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
    return this.applyTranslations(input);
  }

  private async applyTranslations(
    input: WriteTranslationsInput,
  ): Promise<WriteTranslationsResult> {
    const project = await loadProject(input.i18n_directory);
    const extracted = findExtracted(project, input.file);
    const updates = new Set<string>();

    for (const update of input.translations) {
      const local = extracted.value.messages.find(
        (message) => message.id === update.message_id,
      );
      if (!local) {
        throw new Error(
          `[ai-i18n/mcp] message "${update.message_id}" does not belong to "${input.file}"; run Vite Dev/Build, list the file again, and copy message_id exactly`,
        );
      }
      const targetId =
        input.mode !== 'review'
          ? local.id
          : input.review_scope === 'message'
            ? local.id
            : local.source;
      const updateKey = `${targetId}\0${update.locale}`;
      if (updates.has(updateKey)) {
        throw new Error(
          `[ai-i18n/mcp] duplicate translation target "${targetId}" / "${update.locale}"`,
        );
      }
      updates.add(updateKey);
      if (!hasSameTemplateTokens(local.source, update.value)) {
        throw new Error(
          `[ai-i18n/mcp] translation changed template tokens for message "${update.message_id}"`,
        );
      }
      const effective = cacheMessage(project, local);
      if (!(update.locale in effective.translations)) {
        throw new Error(
          `[ai-i18n/mcp] unknown locale "${update.locale}" for message "${update.message_id}"`,
        );
      }
      if (
        input.mode === 'review' &&
        input.review_scope === 'message' &&
        local.id === local.source
      ) {
        throw new Error(
          `[ai-i18n/mcp] review_scope "message" requires an explicit message id`,
        );
      }
    }

    let appliedCount = 0;
    let unchangedCount = 0;
    if (input.mode === 'review') {
      await transactTranslationOverrides(
        path.join(project.directory, 'overrides.json'),
        (overrides) => {
          for (const update of input.translations) {
            const local = extracted.value.messages.find(
              (message) => message.id === update.message_id,
            )!;
            const message = (overrides.messages[local.source] ??= {});
            const translations =
              input.review_scope === 'message'
                ? ((message.byId ??= {})[local.id] ??= {})
                : (message.default ??= {});
            if (translations[update.locale] === update.value) {
              unchangedCount += 1;
            } else {
              translations[update.locale] = update.value;
              appliedCount += 1;
            }
          }
        },
      );
    } else {
      await transactTranslationMemory(
        path.join(project.directory, 'translations.json'),
        (memory) => {
          for (const update of input.translations) {
            const local = extracted.value.messages.find(
              (message) => message.id === update.message_id,
            )!;
            const message = memory.messages[local.id];
            if (!message) {
              throw new Error(
                `[ai-i18n/mcp] message "${local.id}" is missing from translations.json; run Vite Dev/Build and retry`,
              );
            }
            const current =
              resolveTranslationOverride(
                project.overrides,
                local,
                update.locale,
              ) ??
              message.translations[update.locale] ??
              null;
            if (current !== null && current !== update.value) {
              throw new Error(
                `[ai-i18n/mcp] refusing to overwrite "${update.message_id}" / "${update.locale}"; current value is non-null`,
              );
            }
          }
          for (const update of input.translations) {
            const local = extracted.value.messages.find(
              (message) => message.id === update.message_id,
            )!;
            const translations = memory.messages[local.id]!.translations;
            if (
              (resolveTranslationOverride(
                project.overrides,
                local,
                update.locale,
              ) ??
                translations[update.locale] ??
                null) === update.value
            ) {
              unchangedCount += 1;
            } else {
              translations[update.locale] = update.value;
              appliedCount += 1;
            }
          }
        },
      );
    }
    return {
      file: input.file,
      applied_count: appliedCount,
      unchanged_count: unchangedCount,
    };
  }
}
