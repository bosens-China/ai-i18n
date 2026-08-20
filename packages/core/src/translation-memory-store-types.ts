import type { TranslationMemoryFile } from './schema.js';

export type TranslationMemoryStorageName = 'json' | 'sqlite';

export interface TranslationMemoryStorageAdapter {
  readonly storage: Exclude<TranslationMemoryStorageName, 'json'>;
  open(options: { directory: string }): Promise<TranslationMemoryStore>;
}

export type TranslationMemoryStorage = 'json' | TranslationMemoryStorageAdapter;

export interface TranslationMemoryStore {
  readonly storage: TranslationMemoryStorageName;
  readonly projectKey: string;
  load(): Promise<TranslationMemoryFile>;
  transact(
    update: (memory: TranslationMemoryFile) => void | Promise<void>,
  ): Promise<TranslationMemoryFile>;
  watchFiles(): Promise<string[]>;
  manages(file: string): boolean;
  removeProjectData(): Promise<void>;
  close(): void;
}

export interface OpenTranslationMemoryStoreOptions {
  directory: string;
  storage?: TranslationMemoryStorage;
  /** 读取现有非 JSON marker 时可供选择的已安装适配器。 */
  adapters?: readonly TranslationMemoryStorageAdapter[];
}

export interface TranslationMemoryStorageMarker {
  version: 1;
  storage: TranslationMemoryStorageName;
}
