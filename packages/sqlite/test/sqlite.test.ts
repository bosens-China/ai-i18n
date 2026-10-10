import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSqliteCandidates, sqlite } from '../src/index';

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('@ai-i18n/sqlite', () => {
  it('stores candidates from a project without checking that project on lookup', async () => {
    const root = await temporaryDirectory();
    const dataDirectory = path.join(root, 'global');
    const projectDirectory = path.join(root, 'project');
    await fs.mkdir(projectDirectory);
    const cache = await sqlite({ dataDirectory }).open(projectDirectory);
    await cache.sync([
      { ...target(), value: 'Save' },
      { ...target('取消'), value: 'Cancel' },
    ]);

    await expect(cache.findUnique([target(), target('取消')])).resolves.toEqual(
      ['Save', 'Cancel'],
    );
    cache.close();

    const database = new Database(
      path.join(dataDirectory, 'translation-memory.sqlite'),
      { readonly: true },
    );
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual([
      'candidates',
      'project_sync',
    ]);
    database.close();
    await fs.rm(projectDirectory, { recursive: true, force: true });
    await expect(
      listSqliteCandidates(target(), { dataDirectory }),
    ).resolves.toEqual(['Save']);
  });

  it('returns only a unique candidate and leaves ambiguity unresolved', async () => {
    const root = await temporaryDirectory();
    const firstProject = path.join(root, 'first');
    const secondProject = path.join(root, 'second');
    await fs.mkdir(firstProject);
    await fs.mkdir(secondProject);
    const adapter = sqlite({
      dataDirectory: path.join(root, 'global'),
    });
    const cache = await adapter.open(firstProject);
    const other = await adapter.open(secondProject);
    await cache.sync([{ ...target(), value: 'Save' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Save']);

    await other.sync([{ ...target(), value: 'Store' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual([undefined]);
    await cache.sync([{ ...target(), value: 'Store' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Store']);
    await cache.sync([{ ...target(), value: null }]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Store']);
    await other.sync([{ ...target(), value: null }]);
    await expect(cache.findUnique([target()])).resolves.toEqual([undefined]);
    cache.close();
    other.close();
  });

  it('keeps historical orphans by default and prunes them on request', async () => {
    const root = await temporaryDirectory();
    const adapter = sqlite({ dataDirectory: path.join(root, 'global') });
    const cache = await adapter.open(root);
    await cache.sync([{ ...target(), value: 'Save' }]);
    await cache.sync([]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Save']);
    cache.close();

    const pruning = await sqlite({
      dataDirectory: path.join(root, 'global'),
      pruneOrphans: true,
    }).open(root);
    await pruning.sync([]);
    await expect(pruning.findUnique([target()])).resolves.toEqual([undefined]);
    pruning.close();
  });

  it('keeps version-one rows but excludes untraceable legacy values', async () => {
    const root = await temporaryDirectory();
    const dataDirectory = path.join(root, 'global');
    const databasePath = path.join(dataDirectory, 'translation-memory.sqlite');
    await fs.mkdir(dataDirectory);
    const oldDatabase = new Database(databasePath);
    oldDatabase.exec(`
      CREATE TABLE candidates (
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source TEXT NOT NULL,
        comment TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE(source_lang, target_lang, source, comment, value)
      );
      INSERT INTO candidates VALUES ('zh-CN', 'en-US', '保存', '', 'Old');
      PRAGMA user_version = 1;
    `);
    oldDatabase.close();

    const cache = await sqlite({ dataDirectory }).open(root);
    await expect(cache.findUnique([target()])).resolves.toEqual([undefined]);
    await cache.sync([{ ...target(), value: 'Save' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Save']);
    cache.close();

    const migrated = new Database(databasePath, { readonly: true });
    const legacy = migrated
      .prepare(
        "SELECT value, eligible FROM candidates WHERE project = '__legacy__'",
      )
      .get() as { value: string; eligible: number };
    expect(legacy).toEqual({ value: 'Old', eligible: 0 });
    migrated.close();
  });

  it('keeps candidates synced by another opener before acquiring the migration lock', async () => {
    const root = await temporaryDirectory();
    const databasePath = path.join(root, 'translation-memory.sqlite');
    const other = new Database(databasePath);
    other.exec(`
      CREATE TABLE candidates (
        source_lang TEXT, target_lang TEXT, source TEXT, comment TEXT, value TEXT
      );
      PRAGMA user_version = 1;
    `);
    const transaction = Database.prototype.transaction;
    let upgraded = false;
    vi.spyOn(Database.prototype, 'transaction').mockImplementationOnce(
      function (this: Database.Database, fn) {
        const pending = transaction.call(this, fn);
        return new Proxy(Object.assign(pending.bind(undefined), pending), {
          get(_target, key, receiver) {
            if (key !== 'immediate') return Reflect.get(pending, key, receiver);
            return () => {
              // 模拟另一进程在当前连接等待写锁时完成升级并同步有效候选。
              other.exec(`
              DROP TABLE candidates;
              CREATE TABLE candidates (
                id INTEGER PRIMARY KEY,
                project TEXT NOT NULL,
                source_lang TEXT NOT NULL,
                target_lang TEXT NOT NULL,
                source TEXT NOT NULL,
                comment TEXT NOT NULL,
                value TEXT NOT NULL,
                eligible INTEGER NOT NULL,
                UNIQUE(project, source_lang, target_lang, source, comment, value)
              );
              CREATE TABLE project_sync (project TEXT PRIMARY KEY, digest TEXT NOT NULL);
              INSERT INTO candidates VALUES (1, '/other-project', 'zh-CN', 'en-US', '保存', '', 'Save', 1);
              INSERT INTO project_sync VALUES ('/other-project', 'synced');
              PRAGMA user_version = 2;
            `);
              upgraded = true;
              return pending.immediate();
            };
          },
        });
      },
    );
    try {
      const cache = await sqlite({ dataDirectory: root }).open(root);
      try {
        expect(upgraded).toBe(true);
        await expect(cache.findUnique([target()])).resolves.toEqual(['Save']);
        expect(
          other.prepare('SELECT project, eligible FROM candidates').get(),
        ).toEqual({
          project: '/other-project',
          eligible: 1,
        });
        expect(other.prepare('SELECT digest FROM project_sync').get()).toEqual({
          digest: 'synced',
        });
      } finally {
        cache.close();
      }
    } finally {
      other.close();
    }
  });
});

function target(source = '保存') {
  return {
    source,
    sourceLang: 'zh-CN',
    targetLang: 'en-US',
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-sqlite-'));
  tempDirectories.push(directory);
  return directory;
}
