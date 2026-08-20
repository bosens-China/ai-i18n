import type { TranslationMemoryStorageAdapter } from '@ai-i18n/core/translation-memory';
import { globalTranslationMemoryPath } from './sqlite-paths.js';
import { SqliteTranslationMemoryStore } from './sqlite-store.js';

export interface SqliteTranslationMemoryOptions {
  /** SQLite 数据目录；省略时使用 AI_I18N_DATA_DIR 或系统应用数据目录。 */
  dataDirectory?: string;
}

/** 创建按需注入的 SQLite Translation Memory 适配器。 */
export function sqlite(
  options: SqliteTranslationMemoryOptions = {},
): TranslationMemoryStorageAdapter {
  return {
    storage: 'sqlite',
    open: ({ directory }) =>
      SqliteTranslationMemoryStore.open(
        directory,
        globalTranslationMemoryPath(options.dataDirectory),
      ),
  };
}
