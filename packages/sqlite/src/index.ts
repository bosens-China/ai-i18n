import type {
  TranslationMemoryCandidateCacheAdapter,
  TranslationMemoryCandidateTarget,
} from '@ai-i18n/core/translation-memory';
import { globalTranslationMemoryPath } from './sqlite-paths.js';
import { SqliteTranslationMemoryCache } from './sqlite-store.js';

export interface SqliteTranslationMemoryOptions {
  /** SQLite 数据目录；省略时使用 AI_I18N_DATA_DIR 或系统应用数据目录。 */
  dataDirectory?: string;
  /** 是否删除当前项目 JSON 中已不存在的历史候选；默认保留。 */
  pruneOrphans?: boolean;
}

/** 创建可选的个人 Translation Memory 候选缓存。 */
export function sqlite(
  options: SqliteTranslationMemoryOptions = {},
): TranslationMemoryCandidateCacheAdapter {
  return {
    cache: 'sqlite',
    open: (projectDirectory) =>
      SqliteTranslationMemoryCache.open(
        globalTranslationMemoryPath(options.dataDirectory),
        projectDirectory,
        options.pruneOrphans ?? false,
      ),
  };
}

/** 只读查询 SQLite 中已知有效的不同候选，不读取或验证原项目。 */
export function listSqliteCandidates(
  target: TranslationMemoryCandidateTarget,
  options: Pick<SqliteTranslationMemoryOptions, 'dataDirectory'> = {},
): Promise<string[]> {
  return SqliteTranslationMemoryCache.suggestions(
    globalTranslationMemoryPath(options.dataDirectory),
    target,
  );
}
