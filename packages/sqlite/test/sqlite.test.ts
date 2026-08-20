import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';
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
  it('migrates JSON through an injected adapter and keeps the SQLite marker', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    const adapter = sqlite({ dataDirectory: path.join(root, 'global') });
    const json = await openTranslationMemoryStore({ directory });
    await json.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });
    json.close();

    const sqliteStore = await openTranslationMemoryStore({
      directory,
      storage: adapter,
    });
    expect((await sqliteStore.load()).messages.Save).toBeDefined();
    expect(
      JSON.parse(
        await fs.readFile(path.join(directory, 'storage.json'), 'utf8'),
      ),
    ).toEqual({ version: 1, storage: 'sqlite' });
    sqliteStore.close();

    const restoredJson = await openTranslationMemoryStore({
      directory,
      storage: 'json',
      adapters: [adapter],
    });
    expect(
      (await restoredJson.load()).messages.Save?.translations['en-US'],
    ).toBe('Save');
    await expect(
      fs.access(path.join(directory, 'storage.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    restoredJson.close();
  });

  it('shares one unique candidate and refuses ambiguous reuse', async () => {
    const root = await temporaryDirectory();
    const dataDirectory = path.join(root, 'global');
    const first = await sqliteStore(root, 'first', dataDirectory);
    await first.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });

    const second = await sqliteStore(root, 'second', dataDirectory);
    const reused = await second.transact((memory) => {
      memory.messages.Save = message('保存', null);
    });
    expect(reused.messages.Save?.translations['en-US']).toBe('Save');

    await second.transact((memory) => {
      memory.messages.Save!.translations['en-US'] = 'Store';
    });
    const third = await sqliteStore(root, 'third', dataDirectory);
    const ambiguous = await third.transact((memory) => {
      memory.messages.Save = message('保存', null);
    });
    expect(ambiguous.messages.Save?.translations['en-US']).toBeNull();
    expect(await fs.readdir(dataDirectory)).toContain(
      'translation-memory.sqlite',
    );
    const database = new Database(
      path.join(dataDirectory, 'translation-memory.sqlite'),
      { readonly: true },
    );
    expect(database.pragma('user_version', { simple: true })).toBe(1);
    database.close();

    first.close();
    second.close();
    third.close();
  });
});

function message(source: string, value: string | null) {
  return {
    source,
    sourceLang: 'zh-CN',
    translations: { 'en-US': value },
  };
}

async function sqliteStore(root: string, name: string, dataDirectory: string) {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  return openTranslationMemoryStore({
    directory,
    storage: sqlite({ dataDirectory }),
  });
}

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-sqlite-'));
  tempDirectories.push(directory);
  return directory;
}
