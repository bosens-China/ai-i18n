import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { listSqliteCandidates, sqlite } from '../src/index';

const tempDirectories: string[] = [];

afterEach(async () => {
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
    ).resolves.toMatchObject({ candidates: [{ value: 'Save' }] });
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
