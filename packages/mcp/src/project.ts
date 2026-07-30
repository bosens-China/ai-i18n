import type { Page } from './pagination.js';
import { listOverrides, listTranslations } from './project-read.js';
import {
  clearTranslations,
  deleteOverrides,
  setOverrides,
  setTranslations,
} from './project-write.js';

export type TranslationView = 'summary' | 'missing' | 'all';
export type OverrideScope = 'default' | 'message';

export interface MessageReference {
  source: string;
  comment?: string;
}

export interface ListTranslationsInput {
  i18n_directory: string;
  source_files?: readonly string[];
  view?: TranslationView;
  locales?: readonly string[];
  cursor?: string;
  limit: number;
}

export interface TranslationFileItem {
  source_file: string;
  message_count: number;
  missing_message_count: number;
  missing_translation_count: number;
  missing_by_locale: Record<string, number>;
}

export interface TranslationItem {
  source_files: string[];
  message: MessageReference;
  translations: Record<string, string | null>;
  missing_locales: string[];
  occurrence_count: number;
  locations?: Array<{ line: number; column: number }>;
}

export interface TranslationListResult<T> extends Page<T> {
  view: TranslationView;
  total_file_count: number;
  completed_file_count: number;
  pending_file_count: number;
  extracted_message_count: number;
  message_count: number;
  missing_message_count: number;
  missing_translation_count: number;
}

export interface ListOverridesInput {
  i18n_directory: string;
  source_files?: readonly string[];
  locales?: readonly string[];
  cursor?: string;
  limit: number;
}

export interface OverrideItem {
  override_id: string;
  scope: OverrideScope;
  message: MessageReference;
  locale: string;
  value: string;
  source_files: string[];
  orphaned: boolean;
}

export interface OverrideListResult extends Page<OverrideItem> {
  default_override_count: number;
  message_override_count: number;
}

export interface TranslationUpdate {
  message: MessageReference;
  locale: string;
  value: string;
}

export interface TranslationTarget {
  message: MessageReference;
  locale: string;
}

export interface SetTranslationsInput {
  i18n_directory: string;
  overwrite_existing?: boolean;
  updates: readonly TranslationUpdate[];
}

export interface ClearTranslationsInput {
  i18n_directory: string;
  targets: readonly TranslationTarget[];
}

export interface SetOverridesInput {
  i18n_directory: string;
  updates: ReadonlyArray<TranslationUpdate & { scope: OverrideScope }>;
}

export interface DeleteOverridesInput {
  i18n_directory: string;
  override_ids: readonly string[];
}

export interface SetResult {
  added_count: number;
  overwritten_count: number;
  unchanged_count: number;
  deduplicated_count: number;
  affected_file_count: number;
}

export interface ClearResult {
  cleared_count: number;
  unchanged_count: number;
  deduplicated_count: number;
  affected_file_count: number;
}

export interface DeleteResult {
  deleted_count: number;
  unchanged_count: number;
}

export class AiI18nProjectService {
  listTranslations(
    input: ListTranslationsInput,
  ): Promise<TranslationListResult<TranslationFileItem | TranslationItem>> {
    return listTranslations(input);
  }

  listOverrides(input: ListOverridesInput): Promise<OverrideListResult> {
    return listOverrides(input);
  }

  setTranslations(input: SetTranslationsInput): Promise<SetResult> {
    return setTranslations(input);
  }

  clearTranslations(input: ClearTranslationsInput): Promise<ClearResult> {
    return clearTranslations(input);
  }

  setOverrides(input: SetOverridesInput): Promise<SetResult> {
    return setOverrides(input);
  }

  deleteOverrides(input: DeleteOverridesInput): Promise<DeleteResult> {
    return deleteOverrides(input);
  }
}
