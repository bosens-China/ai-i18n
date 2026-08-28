import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

describe('project Translation Memory store', () => {
  it('groups locale targets into deterministic hash buckets without a manifest', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const store = await openTranslationMemoryStore(directory);
    await store.transact((memory) => {
      memory.messages.Delete = message('删除', 'Delete');
      memory.messages.Submit = message('提交', 'Submit');
      memory.messages.Save = message('保存', 'Save');
    });

    const files = await jsonFiles(path.join(directory, 'translations'));
    expect(files).toHaveLength(2);
    expect(files.every((file) => /en-US\/[0-9a-f]\.json$/.test(file))).toBe(
      true,
    );
    const sharedBucket = JSON.parse(
      await fs.readFile(
        translationBucketPath(directory, '删除', 'en-US'),
        'utf8',
      ),
    ) as { entries: Record<string, unknown> };
    expect(Object.keys(sharedBucket.entries)).toHaveLength(2);
    await expect(
      fs.access(path.join(directory, 'translations/manifest.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await store.load()).messages.Save?.translations['en-US']).toBe(
      'Save',
    );
    store.close();
  });

  it('recovers a complete transaction journal after an interrupted commit', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const store = await openTranslationMemoryStore(directory);
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

    const recoveredStore = await openTranslationMemoryStore(directory);
    const recovered = await recoveredStore.load();
    expect(recovered.messages.Save?.translations['en-US']).toBe('Store');
    expect(recovered.messages.Cancel?.translations['en-US']).toBe('Cancel');
    await expect(
      fs.access(path.join(directory, 'translations/.transaction.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    recoveredStore.close();
  });

  it('serializes concurrent updates across store instances', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const first = await openTranslationMemoryStore(directory);
    const second = await openTranslationMemoryStore(directory);

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
    expect(memory.revision).toBeGreaterThan(0);
    const buckets = await jsonFiles(path.join(directory, 'translations'));
    expect(buckets.length).toBeGreaterThan(1);
    expect(buckets.length).toBeLessThanOrEqual(16);
    first.close();
    second.close();
  });

  it('rewrites only the changed hash bucket', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const store = await openTranslationMemoryStore(directory);
    await store.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
      memory.messages.Cancel = message('取消', 'Cancel');
    });

    const cancelShard = translationBucketPath(directory, '取消', 'en-US');
    const untouched = `\n${await fs.readFile(cancelShard, 'utf8')}`;
    await fs.writeFile(cancelShard, untouched);
    await store.transact((memory) => {
      memory.messages.Save!.translations['en-US'] = 'Store';
    });

    expect(await fs.readFile(cancelShard, 'utf8')).toBe(untouched);
    expect((await store.load()).messages.Save?.translations['en-US']).toBe(
      'Store',
    );
    store.close();
  });

  it('deletes a bucket after its final target is removed', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const store = await openTranslationMemoryStore(directory);
    await store.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });
    const bucket = translationBucketPath(directory, '保存', 'en-US');

    await store.transact((memory) => {
      delete memory.messages.Save;
    });

    await expect(fs.access(bucket)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await store.load()).messages).toEqual({});
    store.close();
  });

  it('rejects an entry moved into the wrong bucket', async () => {
    const directory = path.join(await temporaryDirectory(), 'i18n');
    const store = await openTranslationMemoryStore(directory);
    await store.transact((memory) => {
      memory.messages.Save = message('保存', 'Save');
    });
    const bucket = translationBucketPath(directory, '保存', 'en-US');
    const misplaced = path.join(path.dirname(bucket), '0.json');
    await fs.rename(bucket, misplaced);

    await expect(store.load()).rejects.toThrow();
    store.close();
  });
});

function message(source: string, value: string | null) {
  return {
    source,
    sourceLang: 'zh-CN',
    translations: { 'en-US': value },
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-translation-store-'),
  );
  tempDirectories.push(directory);
  return directory;
}

function translationBucketPath(
  directory: string,
  source: string,
  locale: string,
): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(['zh-CN', source, null, locale]))
    .digest('hex');
  return path.join(
    directory,
    'translations',
    locale,
    `${hash.slice(0, 1)}.json`,
  );
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(directory, entry));
}
