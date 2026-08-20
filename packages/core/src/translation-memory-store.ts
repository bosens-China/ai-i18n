import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'atomically';
import { diagnosticMessage } from './diagnostics.js';
import { JsonTranslationMemoryStore } from './translation-memory-json.js';
import {
  jsonTranslationMemoryPath,
  storageMarkerPath,
} from './translation-memory-paths.js';
import type {
  OpenTranslationMemoryStoreOptions,
  TranslationMemoryStorage,
  TranslationMemoryStorageAdapter,
  TranslationMemoryStorageName,
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
  const existing = marker?.storage ?? 'json';
  const requested = options.storage ? storageName(options.storage) : existing;
  if (existing === requested) {
    const store = await createStore(
      directory,
      requested,
      options.storage,
      options.adapters,
    );
    await syncMarker(directory, requested);
    // JSON Store 在加载时恢复事务并迁移 Alpha 阶段的旧单文件。
    await store.load();
    return store;
  }

  const previous = await createStore(
    directory,
    existing,
    options.storage,
    options.adapters,
  );
  const memory = await previous.load();
  const next = await createStore(
    directory,
    requested,
    options.storage,
    options.adapters,
  );
  try {
    await next.transact((draft) => {
      draft.messages = structuredClone(memory.messages);
    });
    await syncMarker(directory, requested);
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
): Promise<TranslationMemoryStorageName> {
  const resolved = path.resolve(directory);
  return (await readMarker(resolved))?.storage ?? 'json';
}

async function createStore(
  directory: string,
  storage: TranslationMemoryStorageName,
  configured?: TranslationMemoryStorage,
  adapters: readonly TranslationMemoryStorageAdapter[] = [],
): Promise<TranslationMemoryStore> {
  if (storage === 'json') {
    return new JsonTranslationMemoryStore(
      directory,
      jsonTranslationMemoryPath(directory),
    );
  }
  const adapter =
    typeof configured === 'object' && configured.storage === storage
      ? configured
      : (adapters.find((candidate) => candidate.storage === storage) ??
        (await loadStorageAdapter(directory, storage)));
  return adapter.open({ directory });
}

function storageName(
  storage: TranslationMemoryStorage,
): TranslationMemoryStorageName {
  return typeof storage === 'string' ? storage : storage.storage;
}

async function loadStorageAdapter(
  directory: string,
  storage: Exclude<TranslationMemoryStorageName, 'json'>,
): Promise<TranslationMemoryStorageAdapter> {
  const packageName = '@ai-i18n/sqlite';
  try {
    const require = createRequire(path.join(directory, 'package.json'));
    const resolved = require.resolve(packageName);
    const module = (await import(pathToFileURL(resolved).href)) as {
      sqlite?: () => TranslationMemoryStorageAdapter;
    };
    const adapter = module.sqlite?.();
    if (adapter?.storage === storage && typeof adapter.open === 'function') {
      return adapter;
    }
    throw new TypeError('Invalid SQLite adapter export.');
  } catch (cause) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 当前项目使用 SQLite Translation Memory，请安装 ${packageName}。`,
        `[ai-i18n] This project uses SQLite Translation Memory; install ${packageName}.`,
      ),
      { cause },
    );
  }
}

async function readMarker(
  directory: string,
): Promise<TranslationMemoryStorageMarker | undefined> {
  const value = await readJson(storageMarkerPath(directory));
  if (value === undefined) return undefined;
  // TODO(stable-release): 首个非 prerelease 稳定版本发布前，移除对
  // storage: 'json' 旧标记的兼容解析；缺少标记直接表示 JSON。
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

async function syncMarker(
  directory: string,
  storage: TranslationMemoryStorageName,
): Promise<void> {
  const file = storageMarkerPath(directory);
  if (storage === 'json') {
    await fs.rm(file, { force: true });
    return;
  }
  const marker: TranslationMemoryStorageMarker = { version: 1, storage };
  await writeFile(file, stableJson(marker), {
    encoding: 'utf8',
    chown: false,
    mode: false,
  });
}
