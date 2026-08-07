import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openTranslationMemoryStore,
  stableJson,
} from '../src/translation-memory';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Translation Memory stores', () => {
  it('migrates a legacy file into deterministic JSON shards on open', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'storage.json'),
      stableJson({ version: 1, storage: 'json' }),
    );
    await fs.writeFile(
      path.join(directory, 'translations.json'),
      stableJson({
        version: 1,
        revision: 4,
        messages: {
          Save: message('保存', 'Save'),
          Cancel: message('取消', 'Cancel'),
        },
      }),
    );

    const store = await openTranslationMemoryStore({ directory });
    const files = await fs.readdir(path.join(directory, 'translations'));

    expect(files).toContain('manifest.json');
    expect(
      files.filter((file) => /^[0-9a-f]{2}\.json$/.test(file)),
    ).toHaveLength(2);
    await expect(
      fs.access(path.join(directory, 'translations.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(directory, 'storage.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await store.load()).messages.Save?.translations['en-US']).toBe(
      'Save',
    );
    expect((await store.load()).revision).toBe(4);
    store.close();
  });

  it('recovers a complete JSON transaction journal after an interrupted shard commit', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    const store = await openTranslationMemoryStore({ directory });
    await store.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });
    store.close();

    await fs.writeFile(
      path.join(directory, 'translations/.transaction.json'),
      stableJson({
        version: 1,
        revision: 7,
        messages: {
          Save: message('保存', 'Store'),
          Cancel: message('取消', 'Cancel'),
        },
      }),
    );
    await fs.writeFile(
      path.join(directory, 'translations/manifest.json'),
      stableJson({ version: 1, revision: 1, prefixLength: 2, shards: [] }),
    );

    const recoveredStore = await openTranslationMemoryStore({ directory });
    const recovered = await recoveredStore.load();
    expect(recovered.revision).toBe(7);
    expect(recovered.messages.Save?.translations['en-US']).toBe('Store');
    expect(recovered.messages.Cancel?.translations['en-US']).toBe('Cancel');
    await expect(
      fs.access(path.join(directory, 'translations/.transaction.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    recoveredStore.close();
  });

  it('serializes concurrent updates across JSON shard store instances', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    const first = await openTranslationMemoryStore({ directory });
    const second = await openTranslationMemoryStore({ directory });

    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        (index % 2 ? first : second).transact((memory) => {
          memory.messages[`message-${index}`] = message(
            `消息-${index}`,
            `Message ${index}`,
          );
        }),
      ),
    );

    const memory = await first.load();
    expect(Object.keys(memory.messages)).toHaveLength(24);
    expect(memory.revision).toBe(24);
    first.close();
    second.close();
  });

  it('rewrites only JSON shards changed by a transaction', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    const store = await openTranslationMemoryStore({ directory });
    await store.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
      memory.messages.Cancel = message('取消', 'Cancel');
    });

    const cancelShard = translationShardPath(directory, 'Cancel');
    const untouched = `\n${await fs.readFile(cancelShard, 'utf8')}`;
    await fs.writeFile(cancelShard, untouched);

    await store.transact((memory) => {
      memory.messages.Save!.translations['en-US'] = 'Store';
    });

    expect(await fs.readFile(cancelShard, 'utf8')).toBe(untouched);
    const memory = await store.load();
    expect(memory.revision).toBe(2);
    expect(memory.messages.Save?.translations['en-US']).toBe('Store');
    expect(memory.messages.Cancel?.translations['en-US']).toBe('Cancel');
    store.close();
  });

  it('uses no marker for JSON and keeps one only while SQLite is selected', async () => {
    const root = await temporaryDirectory();
    const directory = path.join(root, 'i18n');
    const dataDirectory = path.join(root, 'global');
    const json = await openTranslationMemoryStore({ directory });
    await json.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });
    json.close();
    await expect(
      fs.access(path.join(directory, 'storage.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const sqlite = await openTranslationMemoryStore({
      directory,
      storage: 'sqlite',
      dataDirectory,
    });
    expect((await sqlite.load()).messages.Save).toBeDefined();
    expect(
      JSON.parse(
        await fs.readFile(path.join(directory, 'storage.json'), 'utf8'),
      ),
    ).toEqual({ version: 1, storage: 'sqlite' });
    sqlite.close();

    const restoredJson = await openTranslationMemoryStore({
      directory,
      storage: 'json',
      dataDirectory,
    });
    expect(
      (await restoredJson.load()).messages.Save?.translations['en-US'],
    ).toBe('Save');
    await expect(
      fs.access(path.join(directory, 'storage.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    restoredJson.close();
  });

  it('shares one unique SQLite candidate and refuses ambiguous reuse', async () => {
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
    const Database = (await import('better-sqlite3')).default;
    const database = new Database(
      path.join(dataDirectory, 'translation-memory.sqlite'),
      { readonly: true },
    );
    expect(database.pragma('user_version', { simple: true })).toBe(1);
    database.close();
    await expect(
      fs.access(path.join(root, 'third', 'translation-memory.sqlite')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

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
    storage: 'sqlite',
    dataDirectory,
  });
}

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-translation-store-'),
  );
  tempDirectories.push(directory);
  return directory;
}

function translationShardPath(directory: string, messageId: string): string {
  const shard = createHash('sha256')
    .update(messageId)
    .digest('hex')
    .slice(0, 2);
  return path.join(directory, 'translations', `${shard}.json`);
}
