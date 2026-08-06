import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';
import { diagnosticMessage } from './diagnostics.js';
import { JsonTranslationMemoryStore } from './translation-memory-json.js';
import {
  globalTranslationMemoryPath,
  jsonTranslationMemoryPath,
  legacyTranslationMemoryPath,
  storageMarkerPath,
} from './translation-memory-paths.js';
import { SqliteTranslationMemoryStore } from './translation-memory-sqlite.js';
import type {
  OpenTranslationMemoryStoreOptions,
  TranslationMemoryStorage,
  TranslationMemoryStorageMarker,
  TranslationMemoryStore,
} from './translation-memory-store-types.js';
import { readJson, stableJson } from './translation-memory.js';

export async function openTranslationMemoryStore(
  options: OpenTranslationMemoryStoreOptions,
): Promise<TranslationMemoryStore> {
  const requestedDirectory = path.resolve(options.directory);
  await fs.mkdir(requestedDirectory, { recursive: true });
  // Vite、MCP 与 pnpm workspace 可能通过不同符号链接访问同一目录，项目身份必须先规范化。
  const directory = await fs.realpath(requestedDirectory);
  const marker = await readMarker(directory);
  const existing = marker?.storage ?? (await inferStorage(directory));
  const requested = options.storage ?? existing;
  if (existing === requested) {
    const store = await createStore(
      directory,
      requested,
      options.dataDirectory,
    );
    await writeMarker(directory, requested);
    return store;
  }

  const previous = await createStore(
    directory,
    existing,
    options.dataDirectory,
  );
  const memory = await previous.load();
  const next = await createStore(directory, requested, options.dataDirectory);
  try {
    await next.transact((draft) => {
      draft.messages = structuredClone(memory.messages);
    });
    await writeMarker(directory, requested);
    if (previous.storage === 'json') await previous.removeProjectData();
    return next;
  } catch (error) {
    next.close();
    throw error;
  } finally {
    previous.close();
  }
}

export async function readTranslationMemoryStorage(
  directory: string,
): Promise<TranslationMemoryStorage> {
  const resolved = path.resolve(directory);
  return (await readMarker(resolved))?.storage ?? inferStorage(resolved);
}

async function createStore(
  directory: string,
  storage: TranslationMemoryStorage,
  dataDirectory?: string,
): Promise<TranslationMemoryStore> {
  return storage === 'json'
    ? new JsonTranslationMemoryStore(
        directory,
        jsonTranslationMemoryPath(directory),
      )
    : SqliteTranslationMemoryStore.open(
        directory,
        globalTranslationMemoryPath(dataDirectory),
      );
}

async function inferStorage(
  directory: string,
): Promise<TranslationMemoryStorage> {
  if (
    (await exists(jsonTranslationMemoryPath(directory))) ||
    (await exists(legacyTranslationMemoryPath(directory)))
  ) {
    return 'json';
  }
  return 'json';
}

async function readMarker(
  directory: string,
): Promise<TranslationMemoryStorageMarker | undefined> {
  const value = await readJson(storageMarkerPath(directory));
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('storage' in value) ||
    (value.storage !== 'json' && value.storage !== 'sqlite') ||
    Object.keys(value).some((key) => key !== 'version' && key !== 'storage')
  ) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] Translation Memory 存储标记无效。',
        '[ai-i18n] Invalid Translation Memory storage marker.',
      ),
    );
  }
  return value as TranslationMemoryStorageMarker;
}

async function writeMarker(
  directory: string,
  storage: TranslationMemoryStorage,
): Promise<void> {
  const marker: TranslationMemoryStorageMarker = { version: 1, storage };
  await writeFile(storageMarkerPath(directory), stableJson(marker), {
    encoding: 'utf8',
    chown: false,
    mode: false,
  });
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
