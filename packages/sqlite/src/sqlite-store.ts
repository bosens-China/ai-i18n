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
  type TranslationMemoryCandidateQuery,
} from '@ai-i18n/core/translation-memory';
import { initialize } from './sqlite-schema.js';
import { candidatePage, uniqueCandidate } from './sqlite-query.js';

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
  ) {
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

  async findUnique(targets: readonly TranslationMemoryCandidateTarget[]) {
    return this.database.transaction(() =>
      targets.map((target) => uniqueCandidate(this.database, target)),
    )();
  }

  async list(
    target: TranslationMemoryCandidateTarget,
    query?: TranslationMemoryCandidateQuery,
  ) {
    return this.database.transaction(() =>
      candidatePage(this.database, target, query),
    )();
  }

  async sync(
    candidates: readonly TranslationMemoryCandidateState[],
  ): Promise<void> {
    const rows = new Map<string, TranslationMemoryCandidateState>();
    for (const candidate of candidates) {
      const key = JSON.stringify([
        candidate.sourceLang,
        candidate.targetLang,
        candidate.source,
        candidate.comment ?? '',
        candidate.kind ?? 'automatic',
        candidate.file ?? '',
        candidate.location?.line ?? 0,
        candidate.location?.column ?? 0,
      ]);
      rows.set(key, candidate);
    }
    const sorted = [...rows].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const digest = createHash('sha256')
      .update(JSON.stringify([this.pruneOrphans, sorted]))
      .digest('hex');
    await withFileLock(this.databasePath, async () => {
      this.database
        .transaction(() => {
          const previous = this.database
            .prepare('SELECT digest FROM project_sync WHERE project = ?')
            .get(this.projectDirectory) as { digest: string } | undefined;
          if (previous?.digest === digest) return;
          // 自动历史可保留；人工决定只能镜像当前 overrides，撤销后不能重新传播。
          this.database
            .prepare(
              "DELETE FROM candidates WHERE project = ? AND kind = 'reviewed'",
            )
            .run(this.projectDirectory);
          this.database
            .prepare(
              "UPDATE candidates SET orphan = 1 WHERE project = ? AND kind = 'automatic'",
            )
            .run(this.projectDirectory);
          const remove = this.database
            .prepare(`DELETE FROM candidates WHERE project = ? AND source_lang = ? AND target_lang = ?
          AND source = ? AND comment = ? AND kind = ? AND file = ? AND line = ? AND column_number = ?`);
          const insert = this.database
            .prepare(`INSERT INTO candidates(project, source_lang, target_lang, source, comment, kind, file, line, column_number, value, orphan)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
          for (const [, row] of sorted) {
            const identity = [
              this.projectDirectory,
              row.sourceLang,
              row.targetLang,
              row.source,
              row.comment ?? '',
              row.kind ?? 'automatic',
              row.file ?? '',
              row.location?.line ?? 0,
              row.location?.column ?? 0,
            ];
            remove.run(...identity);
            if (row.value !== null) insert.run(...identity, row.value);
          }
          if (this.pruneOrphans)
            this.database
              .prepare(
                'DELETE FROM candidates WHERE project = ? AND orphan = 1',
              )
              .run(this.projectDirectory);
          this.database
            .prepare(
              `INSERT INTO project_sync(project, digest, synced_at) VALUES (?, ?, ?)
          ON CONFLICT(project) DO UPDATE SET digest = excluded.digest, synced_at = excluded.synced_at`,
            )
            .run(this.projectDirectory, digest, new Date().toISOString());
        })
        .immediate();
    });
  }

  close(): void {
    if (this.database.open) this.database.close();
  }
}

export async function loadDatabase(): Promise<typeof BetterSqlite3> {
  try {
    return (await import('better-sqlite3')).default;
  } catch (cause) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 无法加载 better-sqlite3，请检查安装结果与当前 Node.js 平台支持。',
        '[ai-i18n] Could not load better-sqlite3; check the installation and Node.js platform support.',
      ),
      { cause },
    );
  }
}

export async function readDatabase<T>(
  databasePath: string,
  read: (database: BetterSqlite3.Database) => T,
): Promise<T | undefined> {
  try {
    await fs.access(databasePath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw cause;
  }
  const Database = await loadDatabase();
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return database.transaction(() => read(database))();
  } finally {
    database.close();
  }
}
