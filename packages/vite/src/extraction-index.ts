import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseExtractedFile, type ExtractedFile } from '@ai-i18n/core';
import { repositoryRoot } from './repository-paths.js';

/** 只保存可从源码重建的提取结果；每次操作关闭连接以允许 Windows 清理工作树。 */
export class ExtractionIndex {
  private readonly filename: string;
  private readonly app: string;

  constructor(root: string) {
    const repository = repositoryRoot(root);
    this.app =
      path.relative(repository, path.resolve(root)).replaceAll('\\', '/') ||
      '.';
    const directory = path.join(
      repository,
      'node_modules',
      '.cache',
      'ai-i18n',
    );
    this.filename = path.join(directory, 'extracted.sqlite');
  }

  load(): ExtractedFile[] {
    if (!existsSync(this.filename)) return [];
    const database = new DatabaseSync(this.filename, { readOnly: true });
    try {
      const rows = database
        .prepare('SELECT value FROM extracted WHERE app = ? ORDER BY source')
        .all(this.app) as Array<{ value: string }>;
      return rows.map((row) => parseExtractedFile(JSON.parse(row.value)));
    } finally {
      database.close();
    }
  }

  write(
    files: Readonly<Record<string, ExtractedFile>>,
    staleSources: readonly string[],
    complete: boolean,
  ): void {
    mkdirSync(path.dirname(this.filename), { recursive: true });
    const database = this.open();
    try {
      database.exec('BEGIN IMMEDIATE');
      try {
        if (complete) {
          database.prepare('DELETE FROM extracted WHERE app = ?').run(this.app);
        } else {
          const remove = database.prepare(
            'DELETE FROM extracted WHERE app = ? AND source = ?',
          );
          for (const source of staleSources) remove.run(this.app, source);
        }
        const insert = database.prepare(
          'INSERT OR REPLACE INTO extracted (app, source, value) VALUES (?, ?, ?)',
        );
        for (const [source, file] of Object.entries(files)) {
          insert.run(this.app, source, JSON.stringify(file));
        }
        database.exec('COMMIT');
      } catch (cause) {
        database.exec('ROLLBACK');
        throw cause;
      }
    } finally {
      database.close();
    }
  }

  private open(): DatabaseSync {
    const database = new DatabaseSync(this.filename);
    try {
      database.exec(`
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS extracted (
          app TEXT NOT NULL,
          source TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (app, source)
        );
      `);
      return database;
    } catch (cause) {
      database.close();
      throw cause;
    }
  }
}
