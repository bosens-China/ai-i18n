import type { TranslationMemoryCandidateCacheAdapter } from '@ai-i18n/core/translation-memory';
import { globalTranslationMemoryPath } from './sqlite-paths.js';
import { SqliteTranslationMemoryCache } from './sqlite-store.js';

export interface SqliteTranslationMemoryOptions {
  /** SQLite 数据目录；省略时使用 AI_I18N_DATA_DIR 或系统应用数据目录。 */
  dataDirectory?: string;
}

/** 创建可选的个人 Translation Memory 候选缓存。 */
export function sqlite(
  options: SqliteTranslationMemoryOptions = {},
): TranslationMemoryCandidateCacheAdapter {
  return {
    cache: 'sqlite',
    open: () =>
      SqliteTranslationMemoryCache.open(
        globalTranslationMemoryPath(options.dataDirectory),
      ),
  };
}
