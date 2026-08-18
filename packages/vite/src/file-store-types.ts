import type { LangOption } from '@ai-i18n/core';
import type { TranslationMemoryStorage } from '@ai-i18n/core/translation-memory';
import type { AiI18nTranslationMemoryCapacityOptions } from './options.js';
import type { DevTimingReporter } from './dev-timing.js';

export interface FileStoreOptions {
  root: string;
  sourceLang: string;
  locales: readonly LangOption[];
  directory?: string;
  cleanupMissingSourceFiles?: boolean;
  cleanupOrphanMessages?: boolean;
  capacity?: AiI18nTranslationMemoryCapacityOptions;
  translationMemory?: {
    storage: TranslationMemoryStorage;
  };
  onWarning?: (message: string) => void;
  timing?: DevTimingReporter;
  /** 文件与 Translation Memory 全部写入成功后调用。 */
  onSynced?: (batchIds: readonly string[]) => void | Promise<void>;
}

export interface FileStoreLoadOptions {
  preferredSources?: readonly string[];
  complete?: boolean;
  changedSources?: readonly string[];
  timingModuleId?: string;
}
