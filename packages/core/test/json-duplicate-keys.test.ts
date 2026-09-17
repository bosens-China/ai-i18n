import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { JsonTranslationMemoryStore } from '../src/translation-memory-json';
import {
  openTranslationMemoryStore,
  readTranslationOverrides,
  transactTranslationOverrides,
  parseProtocolJson,
  DuplicateJsonKeyError,
  stableJson,
} from '../src/translation-memory';
import { syncAtomicJsonFiles } from '../src/translation-memory-files';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function root() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-duplicates-'),
  );
  roots.push(directory);
  return directory;
}
async function fixture(kind: 'translations' | 'overrides') {
  const directory = await root();
  if (kind === 'translations') {
    const store = await openTranslationMemoryStore(directory);
    await store.transact((memory) => {
      memory.messages.Save = {
        source: '保存',
        sourceLang: 'zh-CN',
        translations: { 'en-US': 'Save' },
      };
    });
  } else {
    await transactTranslationOverrides(path.join(directory, kind), (draft) => {
      draft.rules = [{ source: '保存', translations: { 'en-US': 'Save' } }];
    });
  }
  const bucketDirectory = path.join(directory, kind);
  const filename = (
    await fs.readdir(bucketDirectory, { recursive: true })
  ).find((file) => file.endsWith('.json'))!;
  const file = path.join(bucketDirectory, filename);
  const store = new JsonTranslationMemoryStore(bucketDirectory);
  return {
    file,
    directory: bucketDirectory,
    read: () =>
      kind === 'translations'
        ? store.load()
        : readTranslationOverrides(bucketDirectory),
    write: () =>
      kind === 'translations'
        ? store.transact(() => {})
        : transactTranslationOverrides(bucketDirectory, () => {}),
  };
}
async function duplicate(file: string, conflict = false) {
  const bucket = JSON.parse(await fs.readFile(file, 'utf8')) as {
    version: number;
    locale: string;
    entries: Record<string, object>;
  };
  const [key, entry] = Object.entries(bucket.entries)[0]!;
  const raw =
    JSON.stringify({ version: bucket.version, locale: bucket.locale }).slice(
      0,
      -1,
    ) +
    ',"entries":{' +
    JSON.stringify(key) +
    ':' +
    JSON.stringify(entry) +
    ',' +
    JSON.stringify(key) +
    ':' +
    JSON.stringify(conflict ? { ...entry, value: 'Other' } : entry) +
    '}}';
  await fs.writeFile(file, raw);
  return raw;
}

it.each(['translations', 'overrides'] as const)(
  'cleans identical duplicate keys only on %s writes, including no-op transactions',
  async (kind) => {
    const target = await fixture(kind);
    const raw = await duplicate(target.file);
    await target.read();
    expect(await fs.readFile(target.file, 'utf8')).toBe(raw);
    await target.write();
    expect(
      parseProtocolJson(await fs.readFile(target.file, 'utf8'), target.file)
        .duplicateCount,
    ).toBe(0);
    const modified = (await fs.stat(target.file, { bigint: true })).mtimeNs;
    await target.write();
    expect((await fs.stat(target.file, { bigint: true })).mtimeNs).toBe(
      modified,
    );
  },
);

it.each(['translations', 'overrides'] as const)(
  'keeps conflicting %s bytes and blocks the write callback',
  async (kind) => {
    const target = await fixture(kind);
    const raw = await duplicate(target.file, true);
    await expect(target.read()).rejects.toBeInstanceOf(DuplicateJsonKeyError);
    const update = vi.fn();
    const task =
      kind === 'translations'
        ? new JsonTranslationMemoryStore(target.directory).transact(update)
        : transactTranslationOverrides(target.directory, update);
    await expect(task).rejects.toBeInstanceOf(DuplicateJsonKeyError);
    expect(update).not.toHaveBeenCalled();
    expect(await fs.readFile(target.file, 'utf8')).toBe(raw);
    await expect(
      fs.access(path.join(target.directory, '.transaction.json')),
    ).rejects.toThrow();
  },
);

it('preflights all existing shards before recovery replaces or deletes any file', async () => {
  const directory = await root();
  const first = path.join(directory, 'a.json');
  const conflict = path.join(directory, 'z.json');
  await fs.writeFile(first, '{"a":1}');
  await fs.writeFile(conflict, '{"x":1,"x":2}');
  const journal = path.join(directory, '.transaction.json');
  await fs.writeFile(journal, '{}');
  await expect(
    syncAtomicJsonFiles(directory, new Map([[first, { a: 2 }]])),
  ).rejects.toBeInstanceOf(DuplicateJsonKeyError);
  expect(await fs.readFile(first, 'utf8')).toBe('{"a":1}');
  expect(await fs.readFile(conflict, 'utf8')).toBe('{"x":1,"x":2}');
  expect(await fs.readFile(journal, 'utf8')).toBe('{}');
});

it('rejects a conflicting journal before recovery touches its shards', async () => {
  const target = await fixture('translations');
  const before = await fs.readFile(target.file, 'utf8');
  await fs.writeFile(
    path.join(target.directory, '.transaction.json'),
    '{"version":1,"version":2}',
  );
  await expect(target.read()).rejects.toBeInstanceOf(DuplicateJsonKeyError);
  expect(await fs.readFile(target.file, 'utf8')).toBe(before);
  expect(
    parseProtocolJson(stableJson({ text: '"a":1,"a":2' }), 'output.json')
      .duplicateCount,
  ).toBe(0);
});
