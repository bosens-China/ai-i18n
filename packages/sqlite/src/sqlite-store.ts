import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  withFileLock,
  type TranslationMemoryCandidateCache,
  type TranslationMemoryCandidateState,
  type TranslationMemoryCandidateTarget,
} from '@ai-i18n/core/translation-memory';

const SQLITE_SCHEMA_VERSION = 2;
type Row = [string, string, string, string, string | null];

export class SqliteTranslationMemoryCache implements TranslationMemoryCandidateCache {
  private constructor(
    private readonly databasePath: string,
    private readonly database: BetterSqlite3.Database,
    private readonly projectDirectory: string,
    private readonly pruneOrphans: boolean,
  ) {}

  static async open(
    databasePath: string,
    projectDirectory: string,
    pruneOrphans: boolean,
  ): Promise<SqliteTranslationMemoryCache> {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    const canonicalDatabasePath = path.join(
      await fs.realpath(path.dirname(databasePath)),
      path.basename(databasePath),
    );
    const canonicalProjectDirectory = await fs.realpath(projectDirectory);
    const Database = await loadDatabase();
    const database = new Database(canonicalDatabasePath);
    try {
      database.pragma('journal_mode = WAL');
      database.pragma('busy_timeout = 5000');
      initialize(database);
      return new SqliteTranslationMemoryCache(
        canonicalDatabasePath,
        database,
        canonicalProjectDirectory,
        pruneOrphans,
      );
    } catch (cause) {
      database.close();
      throw cause;
    }
  }

  static async suggestions(
    databasePath: string,
    target: TranslationMemoryCandidateTarget,
  ): Promise<string[]> {
    try {
      await fs.access(databasePath);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      return [];
    }
    const Database = await loadDatabase();
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      if (
        (database.pragma('user_version', { simple: true }) as number) !==
        SQLITE_SCHEMA_VERSION
      )
        return [];
      return selectCandidates(database, target);
    } finally {
      database.close();
    }
  }

  async findUnique(
    targets: readonly TranslationMemoryCandidateTarget[],
  ): Promise<Array<string | undefined>> {
    return targets.map((target) => {
      const values = selectCandidates(this.database, target, 2);
      return values.length === 1 ? values[0] : undefined;
    });
  }

  async sync(
    candidates: readonly TranslationMemoryCandidateState[],
  ): Promise<void> {
    const rows = new Map<string, Row>();
    for (const candidate of candidates) {
      const row: Row = [
        candidate.sourceLang,
        candidate.targetLang,
        candidate.source,
        candidate.comment ?? '',
        candidate.value,
      ];
      rows.set(JSON.stringify(row.slice(0, 4)), row);
    }
    const sorted = [...rows].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const digest = createHash('sha256')
      .update(JSON.stringify([this.pruneOrphans, sorted]))
      .digest('hex');
    await withFileLock(this.databasePath, async () => {
      const previous = this.database
        .prepare('SELECT digest FROM project_sync WHERE project = ?')
        .get(this.projectDirectory) as { digest: string } | undefined;
      if (previous?.digest === digest) return;
      const disable = this.database.prepare(
        `UPDATE candidates SET eligible = 0
         WHERE project = ? AND source_lang = ? AND target_lang = ? AND source = ? AND comment = ?`,
      );
      const insert = this.database.prepare(
        `INSERT INTO candidates(project, source_lang, target_lang, source, comment, value, eligible)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(project, source_lang, target_lang, source, comment, value)
         DO UPDATE SET eligible = 1`,
      );
      this.database
        .transaction(() => {
          for (const [, row] of sorted) {
            disable.run(this.projectDirectory, ...row.slice(0, 4));
            if (row[4] !== null) insert.run(this.projectDirectory, ...row);
          }
          if (this.pruneOrphans) {
            const current = new Set(rows.keys());
            const stored = this.database
              .prepare(
                `SELECT DISTINCT source_lang, target_lang, source, comment
             FROM candidates WHERE project = ?`,
              )
              .all(this.projectDirectory) as Array<{
              source_lang: string;
              target_lang: string;
              source: string;
              comment: string;
            }>;
            const remove = this.database.prepare(
              `DELETE FROM candidates WHERE project = ?
             AND source_lang = ? AND target_lang = ? AND source = ? AND comment = ?`,
            );
            for (const target of stored) {
              if (
                !current.has(
                  JSON.stringify([
                    target.source_lang,
                    target.target_lang,
                    target.source,
                    target.comment,
                  ]),
                )
              )
                remove.run(
                  this.projectDirectory,
                  target.source_lang,
                  target.target_lang,
                  target.source,
                  target.comment,
                );
            }
          }
          this.database
            .prepare(
              `INSERT INTO project_sync(project, digest) VALUES (?, ?)
           ON CONFLICT(project) DO UPDATE SET digest = excluded.digest`,
            )
            .run(this.projectDirectory, digest);
        })
        .immediate();
    });
  }

  close(): void {
    if (this.database.open) this.database.close();
  }
}

function selectCandidates(
  database: BetterSqlite3.Database,
  target: TranslationMemoryCandidateTarget,
  limit = 11,
): string[] {
  const rows = database
    .prepare(
      `SELECT DISTINCT value FROM candidates
     WHERE eligible = 1 AND source_lang = ? AND target_lang = ?
       AND source = ? AND comment = ?
     ORDER BY value LIMIT ?`,
    )
    .all(
      target.sourceLang,
      target.targetLang,
      target.source,
      target.comment ?? '',
      limit,
    ) as Array<{ value: string }>;
  return rows.map((row) => row.value);
}

async function loadDatabase(): Promise<typeof BetterSqlite3> {
  try {
    return (await import('better-sqlite3')).default;
  } catch (cause) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] @ai-i18n/sqlite 无法加载 better-sqlite3，请检查安装结果与当前 Node.js 平台支持。',
        '[ai-i18n] @ai-i18n/sqlite could not load better-sqlite3; check the installation and Node.js platform support.',
      ),
      { cause },
    );
  }
}

function initialize(database: BetterSqlite3.Database): void {
  database
    .transaction(() => {
      // 获得写锁后再读版本，避免并发打开时重复迁移其他进程已升级的数据。
      const version = database.pragma('user_version', {
        simple: true,
      }) as number;
      if (version > SQLITE_SCHEMA_VERSION) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] SQLite Translation Memory 数据结构版本 ${version} 高于当前支持的版本 ${SQLITE_SCHEMA_VERSION}。`,
            `[ai-i18n] SQLite Translation Memory schema version ${version} is newer than supported version ${SQLITE_SCHEMA_VERSION}.`,
          ),
        );
      }
      if (version === 1) {
        // 旧缓存没有来源；保留记录，但项目 JSON 重新同步前不提供旧值。
        database.exec('ALTER TABLE candidates RENAME TO legacy_candidates');
      }
      database.exec(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY,
        project TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        eligible INTEGER NOT NULL DEFAULT 1,
        UNIQUE (project, source_lang, target_lang, source, comment, value)
      );
      CREATE TABLE IF NOT EXISTS project_sync (
        project TEXT PRIMARY KEY,
        digest TEXT NOT NULL
      );
    `);
      if (version === 1) {
        database.exec(`
        INSERT INTO candidates(project, source_lang, target_lang, source, comment, value, eligible)
        SELECT '__legacy__', source_lang, target_lang, source, comment, value, 0
        FROM legacy_candidates;
        DROP TABLE legacy_candidates;
      `);
      }
      database.exec(`CREATE INDEX IF NOT EXISTS candidate_lookup
      ON candidates(source_lang, target_lang, source, comment, eligible)`);
      database.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
    })
    .immediate();
}
