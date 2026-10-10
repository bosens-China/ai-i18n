import type {
  TranslationMemoryCandidateCacheAdapter,
  TranslationMemoryCandidateTarget,
  TranslationMemoryCandidateQuery,
} from '@ai-i18n/core/translation-memory';
import { globalTranslationMemoryPath } from './sqlite-paths.js';
import { readDatabase, SqliteTranslationMemoryCache } from './sqlite-store.js';
import { candidatePage } from './sqlite-query.js';

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
    list: (target, query) =>
      listSqliteCandidates(target, {
        ...query,
        dataDirectory: options.dataDirectory,
      }),
    open: (projectDirectory) =>
      SqliteTranslationMemoryCache.open(
        globalTranslationMemoryPath(options.dataDirectory),
        projectDirectory,
        options.pruneOrphans ?? false,
      ),
  };
}

export { listSqliteProjects, cleanSqliteCache } from './sqlite-management.js';

/** 只读查询不同译值及其来源，不读取或验证原项目。 */
export async function listSqliteCandidates(
  target: TranslationMemoryCandidateTarget,
  options: Pick<SqliteTranslationMemoryOptions, 'dataDirectory'> &
    TranslationMemoryCandidateQuery = {},
) {
  return (
    (await readDatabase(
      globalTranslationMemoryPath(options.dataDirectory),
      (database) => candidatePage(database, target, options),
    )) ?? { candidates: [], hasMore: false }
  );
}
