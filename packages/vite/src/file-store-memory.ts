import path from 'node:path';
import type { CacheMessage, TranslationMemoryFile } from '@ai-i18n/core';
import {
  openTranslationMemoryStore,
  type TranslationMemoryStore,
} from '@ai-i18n/core/translation-memory';
import { enforceCacheCapacity } from './cache-capacity.js';
import { removeOrphanMessages } from './file-store-cleanup.js';
import { mergeProjectMessages } from './file-store-merge.js';
import type { FileStoreOptions } from './file-store-types.js';
import type { ProjectSnapshot } from './project-snapshot.js';

export class FileStoreMemory {
  private store: Promise<TranslationMemoryStore> | undefined;

  constructor(
    private readonly directory: string,
    private readonly options: FileStoreOptions,
    private readonly providerFields: ReadonlySet<string>,
    private readonly updateManagedFiles: (files: readonly string[]) => void,
  ) {}

  async update(
    snapshot?: ProjectSnapshot,
    activeMessageIds?: readonly string[],
  ): Promise<TranslationMemoryFile> {
    const store = await this.getStore();
    const persistent = await store.transact((memory) => {
      if (snapshot) {
        memory.messages = mergeProjectMessages(
          memory.messages,
          snapshot.cache.messages,
          this.providerFields,
        );
      }
      this.ensureCurrentLocales(memory.messages);
      if (activeMessageIds) {
        removeOrphanMessages(
          memory,
          activeMessageIds,
          Boolean(this.options.cleanupOrphanMessages),
        );
        enforceCacheCapacity(
          memory,
          activeMessageIds,
          this.options.capacity,
          this.options.onWarning,
        );
      }
    });
    this.updateManagedFiles(
      (await store.watchFiles()).map((file) => path.resolve(file)),
    );
    return persistent;
  }

  async close(): Promise<void> {
    await this.store?.then(
      (store) => store.close(),
      () => undefined,
    );
  }

  private getStore(): Promise<TranslationMemoryStore> {
    return (this.store ??= openTranslationMemoryStore({
      directory: this.directory,
      storage: this.options.translationMemory?.storage ?? 'json',
    }));
  }

  private ensureCurrentLocales(messages: Record<string, CacheMessage>): void {
    const targetLocales = this.options.locales.filter(
      (locale) => locale.value !== this.options.sourceLang,
    );
    for (const message of Object.values(messages)) {
      for (const locale of targetLocales) {
        if (locale.value === message.sourceLang) continue;
        if (!(locale.value in message.translations)) {
          message.translations[locale.value] = null;
        }
      }
    }
  }
}
