import fs from 'node:fs/promises';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { diagnosticMessage } from './diagnostics.js';
import {
  parseTranslationMemoryFile,
  type CacheMessage,
  type TranslationMemoryFile,
} from './schema.js';
import { projectKey } from './translation-memory-paths.js';
import type { TranslationMemoryStore } from './translation-memory-store-types.js';
import { stableJson, withFileLock } from './translation-memory.js';

interface MessageRow {
  message_id: string;
  source: string;
  source_lang: string;
  comment: string;
}

interface TranslationRow {
  message_id: string;
  locale: string;
  value: string | null;
}

interface CandidateRow {
  id: number;
  value: string;
}

interface RevisionRow {
  revision: number;
}

const SQLITE_SCHEMA_VERSION = 1;

export class SqliteTranslationMemoryStore implements TranslationMemoryStore {
  readonly storage = 'sqlite' as const;
  readonly projectKey: string;
  private constructor(
    readonly directory: string,
    private readonly databasePath: string,
    private readonly database: BetterSqlite3.Database,
  ) {
    this.projectKey = projectKey(directory);
  }

  static async open(
    directory: string,
    databasePath: string,
  ): Promise<SqliteTranslationMemoryStore> {
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
          '[ai-i18n] SQLite Translation Memory 需要可选依赖 better-sqlite3。',
          '[ai-i18n] SQLite Translation Memory requires the optional better-sqlite3 dependency.',
        ),
        { cause },
      );
    }
    const database = new Database(canonicalDatabasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    initialize(database);
    return new SqliteTranslationMemoryStore(
      directory,
      canonicalDatabasePath,
      database,
    );
  }

  async load(): Promise<TranslationMemoryFile> {
    return this.loadCurrent();
  }

  async transact(
    update: (memory: TranslationMemoryFile) => void | Promise<void>,
  ): Promise<TranslationMemoryFile> {
    return withFileLock(this.databasePath, async () => {
      const current = this.loadCurrent();
      const draft = structuredClone(current);
      await update(draft);
      draft.version = 1;
      draft.revision = current.revision;
      seedSharedCandidates(this.database, current, draft);
      parseTranslationMemoryFile(draft);
      if (stableJson(draft) === stableJson(current)) return draft;
      draft.revision += 1;
      this.database
        .transaction(() => {
          persistProject(this.database, this.projectKey, draft);
        })
        .immediate();
      return draft;
    });
  }

  async watchFiles(): Promise<string[]> {
    return [
      this.databasePath,
      `${this.databasePath}-wal`,
      `${this.databasePath}-shm`,
    ];
  }

  manages(file: string): boolean {
    const resolved = path.resolve(file);
    return (
      resolved === this.databasePath ||
      resolved === `${this.databasePath}-wal` ||
      resolved === `${this.databasePath}-shm`
    );
  }

  async removeProjectData(): Promise<void> {
    await withFileLock(this.databasePath, async () => {
      this.database
        .prepare('DELETE FROM projects WHERE project_key = ?')
        .run(this.projectKey);
    });
  }

  close(): void {
    if (this.database.open) this.database.close();
  }

  private loadCurrent(): TranslationMemoryFile {
    const revision = this.database
      .prepare('SELECT revision FROM projects WHERE project_key = ?')
      .get(this.projectKey) as RevisionRow | undefined;
    const messages: Record<string, CacheMessage> = {};
    const rows = this.database
      .prepare(
        `SELECT message_id, source, source_lang, comment
         FROM project_messages
         WHERE project_key = ?
         ORDER BY message_id`,
      )
      .all(this.projectKey) as MessageRow[];
    for (const row of rows) {
      messages[row.message_id] = {
        source: row.source,
        sourceLang: row.source_lang,
        ...(row.comment ? { comment: row.comment } : {}),
        translations: {},
      };
    }
    const translations = this.database
      .prepare(
        `SELECT binding.message_id, binding.locale, candidate.value
         FROM project_bindings AS binding
         LEFT JOIN candidates AS candidate ON candidate.id = binding.candidate_id
         WHERE binding.project_key = ?
         ORDER BY binding.message_id, binding.locale`,
      )
      .all(this.projectKey) as TranslationRow[];
    for (const row of translations) {
      const message = messages[row.message_id];
      if (message) message.translations[row.locale] = row.value;
    }
    return parseTranslationMemoryFile({
      version: 1,
      revision: revision?.revision ?? 0,
      messages,
    });
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
  if (version === SQLITE_SCHEMA_VERSION) return;

  // schema 迁移与数据事务保持在同一个 SQLite 连接内，失败时不会留下半升级状态。
  database
    .transaction(() => {
      if (version < 1) {
        database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          project_key TEXT PRIMARY KEY,
          revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS project_messages (
          project_key TEXT NOT NULL,
          message_id TEXT NOT NULL,
          source TEXT NOT NULL,
          source_lang TEXT NOT NULL,
          comment TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (project_key, message_id),
          FOREIGN KEY (project_key) REFERENCES projects(project_key) ON DELETE CASCADE
        );
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
        CREATE TABLE IF NOT EXISTS project_bindings (
          project_key TEXT NOT NULL,
          message_id TEXT NOT NULL,
          locale TEXT NOT NULL,
          candidate_id INTEGER,
          PRIMARY KEY (project_key, message_id, locale),
          FOREIGN KEY (project_key, message_id)
            REFERENCES project_messages(project_key, message_id) ON DELETE CASCADE,
          FOREIGN KEY (candidate_id) REFERENCES candidates(id)
        );
      `);
        database.pragma('user_version = 1');
      }
    })
    .immediate();
}

function seedSharedCandidates(
  database: BetterSqlite3.Database,
  current: TranslationMemoryFile,
  draft: TranslationMemoryFile,
): void {
  const select = database.prepare(
    `SELECT id, value FROM candidates
     WHERE source_lang = ? AND target_lang = ? AND source = ? AND comment = ?
     ORDER BY id
     LIMIT 2`,
  );
  for (const [messageId, message] of Object.entries(draft.messages)) {
    const previous = current.messages[messageId];
    const sameIdentity =
      previous?.source === message.source &&
      previous.sourceLang === message.sourceLang &&
      previous.comment === message.comment;
    for (const [locale, value] of Object.entries(message.translations)) {
      if (value !== null) continue;
      if (sameIdentity && locale in previous.translations) continue;
      const candidates = select.all(
        message.sourceLang,
        locale,
        message.source,
        message.comment ?? '',
      ) as CandidateRow[];
      if (candidates.length === 1) {
        message.translations[locale] = candidates[0]!.value;
      }
    }
  }
}

function persistProject(
  database: BetterSqlite3.Database,
  projectKey: string,
  memory: TranslationMemoryFile,
): void {
  database
    .prepare(
      `INSERT INTO projects(project_key, revision) VALUES (?, ?)
       ON CONFLICT(project_key) DO UPDATE SET revision = excluded.revision`,
    )
    .run(projectKey, memory.revision);
  // 整体替换项目绑定，避免大型项目用 NOT IN 占满 SQLite 参数槽；候选表仍全局保留。
  database
    .prepare('DELETE FROM project_messages WHERE project_key = ?')
    .run(projectKey);
  const insertMessage = database.prepare(
    `INSERT INTO project_messages(project_key, message_id, source, source_lang, comment)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const deleteBindings = database.prepare(
    'DELETE FROM project_bindings WHERE project_key = ? AND message_id = ?',
  );
  const insertCandidate = database.prepare(
    `INSERT INTO candidates(source_lang, target_lang, source, comment, value)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_lang, target_lang, source, comment, value) DO NOTHING`,
  );
  const selectCandidate = database.prepare(
    `SELECT id FROM candidates
     WHERE source_lang = ? AND target_lang = ? AND source = ? AND comment = ? AND value = ?`,
  );
  const insertBinding = database.prepare(
    `INSERT INTO project_bindings(project_key, message_id, locale, candidate_id)
     VALUES (?, ?, ?, ?)`,
  );
  for (const [messageId, message] of Object.entries(memory.messages)) {
    const comment = message.comment ?? '';
    insertMessage.run(
      projectKey,
      messageId,
      message.source,
      message.sourceLang,
      comment,
    );
    deleteBindings.run(projectKey, messageId);
    for (const [locale, value] of Object.entries(message.translations)) {
      let candidateId: number | null = null;
      if (value !== null) {
        insertCandidate.run(
          message.sourceLang,
          locale,
          message.source,
          comment,
          value,
        );
        const row = selectCandidate.get(
          message.sourceLang,
          locale,
          message.source,
          comment,
          value,
        ) as { id: number };
        candidateId = row.id;
      }
      insertBinding.run(projectKey, messageId, locale, candidateId);
    }
  }
}
