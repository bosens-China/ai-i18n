import type { Page } from './pagination.js';

export type TranslationView = 'summary' | 'missing' | 'all';
export type OverrideScope = 'global' | 'files' | 'occurrences';

export interface MessageReference {
  source: string;
  comment?: string;
}

export interface ListTranslationsInput {
  i18n_directory: string;
  source_files?: readonly string[];
  view?: TranslationView;
  locales?: readonly string[];
  source_contains?: string;
  translation_contains?: string;
  include_source_files?: boolean;
  include_occurrences?: boolean;
  cursor?: string;
  limit: number;
}

export interface MessageOccurrence {
  source_file: string;
  locations: Array<{ line: number; column: number }>;
}

export interface TranslationFileItem {
  source_file: string;
  message_count: number;
  missing_message_count: number;
  missing_translation_count: number;
  missing_by_locale: Record<string, number>;
}

export interface TranslationItem {
  source_files?: string[];
  occurrences?: MessageOccurrence[];
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

export interface ListOrphanMessagesInput {
  i18n_directory: string;
  locales?: readonly string[];
  cursor?: string;
  limit: number;
}

export interface OrphanMessageItem {
  orphan_id: string;
  message: MessageReference;
  translations: Record<string, string | null>;
}

export type OrphanMessageListResult = Page<OrphanMessageItem>;

export interface ListOverridesInput {
  i18n_directory: string;
  source_files?: readonly string[];
  locales?: readonly string[];
  include_source_files?: boolean;
  cursor?: string;
  limit: number;
}

export interface OverrideItem {
  override_id: string;
  scope: OverrideScope;
  message: MessageReference;
  files?: string[];
  occurrences?: OverrideOccurrence[];
  locale: string;
  value: string;
  source_files?: string[];
  orphaned: boolean;
}

export interface OverrideListResult extends Page<OverrideItem> {
  global_override_count: number;
  file_override_count: number;
  occurrence_override_count: number;
}

export interface TranslationUpdate {
  message: MessageReference;
  locale?: string;
  value: string;
}

export interface OverrideUpdate extends TranslationUpdate {
  files?: readonly string[];
  occurrences?: readonly OverrideOccurrence[];
}

export interface OverrideOccurrence {
  source_file: string;
  line: number;
  column: number;
}

export interface TranslationTarget {
  message: MessageReference;
  locale?: string;
}

export interface SetTranslationsInput {
  i18n_directory: string;
  default_locale?: string;
  overwrite_existing?: boolean;
  updates: readonly TranslationUpdate[];
}

export interface ClearTranslationsInput {
  i18n_directory: string;
  default_locale?: string;
  targets: readonly TranslationTarget[];
}

export interface SetOverridesInput {
  i18n_directory: string;
  default_locale?: string;
  updates: readonly OverrideUpdate[];
}

export interface DeleteOverridesInput {
  i18n_directory: string;
  override_ids: readonly string[];
}

export interface DeleteOrphanMessagesInput {
  i18n_directory: string;
  orphan_ids: readonly string[];
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
