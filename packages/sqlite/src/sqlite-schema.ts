import type BetterSqlite3 from 'better-sqlite3';

export function initialize(database: BetterSqlite3.Database): void {
  database
    .transaction(() => {
      database.exec(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY,
        project TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'automatic' CHECK(kind IN ('automatic', 'reviewed')),
        file TEXT NOT NULL DEFAULT '',
        line INTEGER NOT NULL DEFAULT 0,
        column_number INTEGER NOT NULL DEFAULT 0,
        orphan INTEGER NOT NULL DEFAULT 0,
        UNIQUE(project, source_lang, target_lang, source, comment, kind, file, line, column_number)
      );
      CREATE TABLE IF NOT EXISTS project_sync (
        project TEXT PRIMARY KEY,
        digest TEXT NOT NULL,
        synced_at TEXT
      );
    `);
      database.exec(`CREATE INDEX IF NOT EXISTS candidate_lookup
      ON candidates(source_lang, target_lang, source, comment)`);
    })
    .immediate();
}
