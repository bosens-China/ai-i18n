import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonTranslationMemoryStore } from './translation-memory-json.js';

/** 项目 Translation Memory 始终使用可提交的 JSON 分片。 */
export async function openTranslationMemoryStore(
  projectDirectory: string,
): Promise<JsonTranslationMemoryStore> {
  const requestedDirectory = path.resolve(projectDirectory);
  await fs.mkdir(requestedDirectory, { recursive: true });
  const directory = await fs.realpath(requestedDirectory);
  const store = new JsonTranslationMemoryStore(
    path.join(directory, 'translations'),
  );
  await store.load();
  return store;
}
