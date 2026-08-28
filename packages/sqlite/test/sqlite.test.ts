import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { sqlite } from '../src/index';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('@ai-i18n/sqlite', () => {
  it('remembers candidates without storing project bindings', async () => {
    const root = await temporaryDirectory();
    const dataDirectory = path.join(root, 'global');
    const cache = await sqlite({ dataDirectory }).open();
    await cache.remember([
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
    expect(tables.map((row) => row.name)).toEqual(['candidates']);
    database.close();
  });

  it('returns only a unique candidate and leaves ambiguity unresolved', async () => {
    const root = await temporaryDirectory();
    const cache = await sqlite({
      dataDirectory: path.join(root, 'global'),
    }).open();
    await cache.remember([{ ...target(), value: 'Save' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual(['Save']);

    await cache.remember([{ ...target(), value: 'Store' }]);
    await expect(cache.findUnique([target()])).resolves.toEqual([undefined]);
    cache.close();
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
