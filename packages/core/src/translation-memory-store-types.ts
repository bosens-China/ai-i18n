import type { TranslationMemoryFile } from './schema.js';

export type TranslationMemoryStorage = 'json' | 'sqlite';

export interface TranslationMemoryStore {
  readonly storage: TranslationMemoryStorage;
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
  dataDirectory?: string;
}

export interface TranslationMemoryStorageMarker {
  version: 1;
  storage: TranslationMemoryStorage;
}
