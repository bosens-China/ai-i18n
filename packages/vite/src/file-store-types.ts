import type { LangOption } from '@ai-i18n/core';
import type { AiI18nCacheOptions } from './options.js';

export interface FileStoreOptions {
  root: string;
  sourceLang: string;
  locales: readonly LangOption[];
  directory?: string;
  cleanupMissingSourceFiles?: boolean;
  cleanupOrphanMessages?: boolean;
  cache?: AiI18nCacheOptions;
  onWarning?: (message: string) => void;
}

export interface FileStoreLoadOptions {
  preferredSources?: readonly string[];
  complete?: boolean;
}
