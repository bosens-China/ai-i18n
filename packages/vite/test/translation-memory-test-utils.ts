import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';

export async function readTestTranslationMemory(
  directory: string,
): Promise<TranslationMemoryFile> {
  const store = await testStore(directory);
  try {
    return await store.load();
  } finally {
    store.close();
  }
}

export async function updateTestTranslationMemory(
  directory: string,
  update: (memory: TranslationMemoryFile) => void,
): Promise<TranslationMemoryFile> {
  const store = await testStore(directory);
  try {
    return await store.transact(update);
  } finally {
    store.close();
  }
}

export async function readProtocolJson<T>(target: string): Promise<T> {
  if (path.basename(target) === 'i18n') {
    return (await readTestTranslationMemory(target)) as T;
  }
  return JSON.parse(await fs.readFile(target, 'utf8')) as T;
}

export async function writeProtocolJson(
  target: string,
  value: unknown,
): Promise<void> {
  if (path.basename(target) !== 'i18n') {
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  await updateTestTranslationMemory(target, (memory) => {
    memory.messages = structuredClone(
      (value as TranslationMemoryFile).messages,
    );
  });
}

export async function translationShardFiles(root: string): Promise<string[]> {
  const directory = path.join(root, 'i18n/translations');
  return (await fs.readdir(directory, { recursive: true }))
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(directory, file))
    .sort();
}

export async function firstTranslationShard(
  directory: string,
): Promise<string> {
  const translations = path.join(directory, 'translations');
  const shard = (await fs.readdir(translations, { recursive: true })).find(
    (file) =>
      new RegExp(
        `^[^${path.sep}]+\\${path.sep}[0-9a-f]{2}\\${path.sep}[0-9a-f]{64}\\.json$`,
      ).test(file),
  );
  if (!shard) throw new Error('translation shard not found');
  return path.join(translations, shard);
}

function testStore(directory: string) {
  return openTranslationMemoryStore(directory);
}
