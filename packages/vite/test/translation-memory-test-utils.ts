import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';

export async function readTestTranslationMemory(
  directoryOrLegacyFile: string,
): Promise<TranslationMemoryFile> {
  const store = await testStore(directoryOrLegacyFile);
  try {
    return await store.load();
  } finally {
    store.close();
  }
}

export async function updateTestTranslationMemory(
  directoryOrLegacyFile: string,
  update: (memory: TranslationMemoryFile) => void,
): Promise<TranslationMemoryFile> {
  const store = await testStore(directoryOrLegacyFile);
  try {
    return await store.transact(update);
  } finally {
    store.close();
  }
}

export async function readProtocolJson<T>(file: string): Promise<T> {
  if (file.endsWith('translations.json')) {
    return (await readTestTranslationMemory(file)) as T;
  }
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

export async function writeProtocolJson(
  file: string,
  value: unknown,
): Promise<void> {
  if (!file.endsWith('translations.json')) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  await updateTestTranslationMemory(file, (memory) => {
    memory.messages = structuredClone(
      (value as TranslationMemoryFile).messages,
    );
  });
}

export async function translationShardFiles(root: string): Promise<string[]> {
  const directory = path.join(root, 'i18n/translations');
  return (await fs.readdir(directory))
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(directory, file))
    .sort();
}

export async function firstTranslationShard(
  directory: string,
): Promise<string> {
  const translations = path.join(directory, 'translations');
  const shard = (await fs.readdir(translations)).find((file) =>
    /^[0-9a-f]{2}\.json$/.test(file),
  );
  if (!shard) throw new Error('translation shard not found');
  return path.join(translations, shard);
}

function testStore(directoryOrLegacyFile: string) {
  const directory = directoryOrLegacyFile.endsWith('translations.json')
    ? path.dirname(directoryOrLegacyFile)
    : directoryOrLegacyFile;
  return openTranslationMemoryStore({ directory });
}
