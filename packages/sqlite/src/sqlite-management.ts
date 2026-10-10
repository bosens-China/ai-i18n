import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type BetterSqlite3 from 'better-sqlite3';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { withFileLock } from '@ai-i18n/core/translation-memory';
import { globalTranslationMemoryPath } from './sqlite-paths.js';
import { loadDatabase, readDatabase } from './sqlite-store.js';

export interface CacheCleanupInput {
  dataDirectory?: string;
  project?: string;
  scope: 'orphans' | 'project' | 'all';
  /** 省略时仅预览；执行必须传回预览得到的 token。 */
  token?: string;
}

export async function listSqliteProjects(
  options: { dataDirectory?: string; offset?: number } = {},
) {
  return (
    (await readDatabase(
      globalTranslationMemoryPath(options.dataDirectory),
      (database) => {
        const rows = database
          .prepare(
            `SELECT p.project, COUNT(c.id) AS records, COALESCE(SUM(c.orphan), 0) AS orphans, s.synced_at
      FROM (SELECT project FROM candidates UNION SELECT project FROM project_sync) p
      LEFT JOIN candidates c ON c.project = p.project LEFT JOIN project_sync s ON s.project = p.project
      GROUP BY p.project ORDER BY p.project LIMIT 51 OFFSET ?`,
          )
          .all(options.offset ?? 0);
        return { projects: rows.slice(0, 50), has_more: rows.length > 50 };
      },
    )) ?? { projects: [], has_more: false }
  );
}

export async function cleanSqliteCache(input: CacheCleanupInput) {
  const databasePath = globalTranslationMemoryPath(input.dataDirectory);
  if (input.scope !== 'all' && !input.project)
    throw new Error(
      diagnosticMessage(
        '项目清理必须指定项目路径。',
        'Project cleanup requires a project path.',
      ),
    );
  const where =
    input.scope === 'all'
      ? '1 = 1'
      : `project = ?${input.scope === 'orphans' ? ' AND orphan = 1' : ''}`;
  const parameters = input.scope === 'all' ? [] : [input.project!];
  function preview(database: BetterSqlite3.Database) {
    const rows = database
      .prepare(`SELECT * FROM candidates WHERE ${where} ORDER BY id`)
      .all(...parameters);
    const token = createHash('sha256')
      .update(JSON.stringify([databasePath, input.scope, input.project, rows]))
      .digest('hex');
    return { records: rows.length, token };
  }
  if (!input.token) {
    const result = await readDatabase(databasePath, preview);
    if (!result)
      return {
        records: 0,
        token: undefined,
        executed: false,
        available: false,
      };
    return { ...result, executed: false, available: true };
  }
  return withFileLock(databasePath, async () => {
    await fs.access(databasePath);
    const Database = await loadDatabase();
    const database = new Database(databasePath, { fileMustExist: true });
    try {
      database.pragma('busy_timeout = 5000');
      return database
        .transaction(() => {
          const current = preview(database);
          if (current.token !== input.token)
            throw new Error(
              diagnosticMessage(
                '缓存已变化，请重新预览清理范围。',
                'Cache changed; preview cleanup again.',
              ),
            );
          database
            .prepare(`DELETE FROM candidates WHERE ${where}`)
            .run(...parameters);
          if (input.scope === 'all')
            database.prepare('DELETE FROM project_sync').run();
          else
            database
              .prepare('DELETE FROM project_sync WHERE project = ?')
              .run(input.project);
          return { ...current, executed: true };
        })
        .immediate();
    } finally {
      database.close();
    }
  });
}
