import fs from 'node:fs/promises';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  withFileLock,
  type TranslationMemoryCandidate,
  type TranslationMemoryCandidateCache,
  type TranslationMemoryCandidateTarget,
} from '@ai-i18n/core/translation-memory';

interface CandidateRow {
  value: string;
}

const SQLITE_SCHEMA_VERSION = 1;

export class SqliteTranslationMemoryCache implements TranslationMemoryCandidateCache {
  private constructor(
    private readonly databasePath: string,
    private readonly database: BetterSqlite3.Database,
  ) {}

  static async open(
    databasePath: string,
  ): Promise<SqliteTranslationMemoryCache> {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    const canonicalDatabasePath = path.join(
      await fs.realpath(path.dirname(databasePath)),
      path.basename(databasePath),
    );
    let Database: typeof BetterSqlite3;
    try {
      Database = (await import('better-sqlite3')).default;
    } catch (cause) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] @ai-i18n/sqlite 无法加载 better-sqlite3，请检查安装结果与当前 Node.js 平台支持。',
          '[ai-i18n] @ai-i18n/sqlite could not load better-sqlite3; check the installation and Node.js platform support.',
        ),
        { cause },
      );
    }
    const database = new Database(canonicalDatabasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');
    initialize(database);
    return new SqliteTranslationMemoryCache(canonicalDatabasePath, database);
  }

  async findUnique(
    targets: readonly TranslationMemoryCandidateTarget[],
  ): Promise<Array<string | undefined>> {
    const select = this.database.prepare(
      `SELECT DISTINCT value FROM candidates
       WHERE source_lang = ? AND target_lang = ? AND source = ? AND comment = ?
       ORDER BY value
       LIMIT 2`,
    );
    return targets.map((target) => {
      const rows = select.all(
        target.sourceLang,
        target.targetLang,
        target.source,
        target.comment ?? '',
      ) as CandidateRow[];
      return rows.length === 1 ? rows[0]!.value : undefined;
    });
  }

  async remember(
    candidates: readonly TranslationMemoryCandidate[],
  ): Promise<void> {
    if (!candidates.length) return;
    await withFileLock(this.databasePath, async () => {
      const insert = this.database.prepare(
        `INSERT INTO candidates(source_lang, target_lang, source, comment, value)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_lang, target_lang, source, comment, value) DO NOTHING`,
      );
      this.database
        .transaction(() => {
          for (const candidate of candidates) {
            insert.run(
              candidate.sourceLang,
              candidate.targetLang,
              candidate.source,
              candidate.comment ?? '',
              candidate.value,
            );
          }
        })
        .immediate();
    });
  }

  close(): void {
    if (this.database.open) this.database.close();
  }
}

function initialize(database: BetterSqlite3.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number;
  if (version > SQLITE_SCHEMA_VERSION) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] SQLite Translation Memory 数据结构版本 ${version} 高于当前支持的版本 ${SQLITE_SCHEMA_VERSION}。`,
        `[ai-i18n] SQLite Translation Memory schema version ${version} is newer than supported version ${SQLITE_SCHEMA_VERSION}.`,
      ),
    );
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      source TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL,
      UNIQUE (source_lang, target_lang, source, comment, value)
    );
    CREATE INDEX IF NOT EXISTS candidate_lookup
      ON candidates(source_lang, target_lang, source, comment);
  `);
  database.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
}
