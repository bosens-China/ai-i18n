import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseExtractedFile,
  type CacheMessage,
  type ExtractedFile,
  type ExtractedMessage,
  type TranslationMemoryFile,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import {
  openTranslationMemoryStore,
  readTranslationOverrides,
  transactTranslationOverrides,
  type TranslationMemoryStore,
} from '@ai-i18n/core/translation-memory';
import { enforceCacheCapacity } from './cache-capacity.js';
import {
  findMissingSources,
  removeOrphanMessages,
} from './file-store-cleanup.js';
import {
  extractedPath,
  localePath,
  translationOverridesPath,
} from './file-store-paths.js';
import {
  readGeneratedJsonFiles,
  warnExtractedMismatches,
  writeProtocolJson,
} from './file-store-io.js';
import {
  hydrateExtracted,
  hydrateLocale,
  mergeProjectMessages,
  translationFieldKey,
} from './file-store-merge.js';
import type {
  FileStoreLoadOptions,
  FileStoreOptions,
} from './file-store-types.js';
import type { ProjectSnapshot } from './project-state.js';
import { listJsonFiles, readJson, readText } from './json-files.js';

export type {
  FileStoreLoadOptions,
  FileStoreOptions,
} from './file-store-types.js';

export class FileStore {
  readonly directory: string;
  private queue = Promise.resolve();
  private readonly lastWritten = new Map<string, string>();
  private memoryStore: Promise<TranslationMemoryStore> | undefined;
  private readonly providerFields = new Set<string>();
  private readonly pendingProviderBatches = new Set<string>();
  private readonly translationManagedFiles = new Set<string>();

  constructor(private readonly options: FileStoreOptions) {
    this.directory = path.resolve(options.root, options.directory ?? 'i18n');
  }

  async load(): Promise<TranslationMemoryFile> {
    return this.updateMemory();
  }

  loadOverrides(): Promise<TranslationOverridesFile> {
    return readTranslationOverrides(translationOverridesPath(this.directory));
  }

  sync(
    snapshot: ProjectSnapshot,
    options: FileStoreLoadOptions = {},
  ): Promise<TranslationMemoryFile> {
    const batchIds = [...this.pendingProviderBatches];
    for (const batchId of batchIds) this.pendingProviderBatches.delete(batchId);
    // 每次任务都从最新磁盘状态开始；失败不会阻塞后续写入任务。
    const write = () => this.writeSnapshot(snapshot, options);
    const task = this.queue
      .then(write, write)
      .then((cache) => {
        try {
          const pending = this.options.onSynced?.(batchIds);
          if (pending) {
            void Promise.resolve(pending).catch((cause) => {
              this.warnPersistenceTraceFailure(cause);
            });
          }
        } catch (cause) {
          this.warnPersistenceTraceFailure(cause);
        }
        return cache;
      })
      .catch((cause) => {
        for (const batchId of batchIds) {
          this.pendingProviderBatches.add(batchId);
        }
        throw cause;
      });
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  manages(file: string): boolean {
    const resolved = path.resolve(file);
    if (this.translationManagedFiles.has(resolved)) return true;
    const relative = path.relative(this.directory, resolved);
    return (
      relative !== '' &&
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      relative.endsWith('.json')
    );
  }

  isOwnWrite(file: string, content: string): boolean {
    return this.lastWritten.get(path.resolve(file)) === content;
  }

  async isOwnFile(file: string): Promise<boolean> {
    const content = await readText(file);
    return content !== undefined && this.isOwnWrite(file, content);
  }

  async extractedSource(file: string): Promise<string | undefined> {
    const base = path.join(this.directory, 'extracted');
    const relative = path.relative(base, path.resolve(file));
    if (
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      relative.includes(path.sep) ||
      !relative.endsWith('.json')
    ) {
      return undefined;
    }
    const value = await readJson(file);
    return value === undefined ? undefined : parseExtractedFile(value).source;
  }

  async loadOptions(files: Iterable<string>): Promise<FileStoreLoadOptions> {
    const preferredSources = new Set<string>();
    for (const file of files) {
      const source = await this.extractedSource(file);
      if (source) preferredSources.add(source);
    }
    return {
      preferredSources: [...preferredSources].sort(),
    };
  }

  watchFiles(moduleId: string): string[] {
    return [
      ...this.translationManagedFiles,
      translationOverridesPath(this.directory),
      extractedPath(this.directory, moduleId),
      ...this.options.locales
        .filter((locale) => locale.value !== this.options.sourceLang)
        .map((locale) => localePath(this.directory, locale.value)),
    ];
  }

  markProviderTranslations(
    results: readonly {
      messageId: string;
      locale: string;
      value: string | null;
    }[],
  ): void {
    for (const result of results) {
      if (result.value !== null) {
        this.providerFields.add(
          translationFieldKey(result.messageId, result.locale),
        );
      }
    }
  }

  markProviderBatch(batchId: string): void {
    this.pendingProviderBatches.add(batchId);
  }

  private warnPersistenceTraceFailure(cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : String(cause);
    this.options.onWarning?.(
      diagnosticMessage(
        `翻译批次持久化追踪失败，文件已成功写入。原因：${reason}`,
        `Translation batch persistence tracing failed after files were written. Cause: ${reason}`,
      ),
    );
  }

  async close(): Promise<void> {
    await this.memoryStore?.then(
      (store) => store.close(),
      () => undefined,
    );
  }

  private async writeSnapshot(
    snapshot: ProjectSnapshot,
    options: FileStoreLoadOptions,
  ): Promise<TranslationMemoryFile> {
    const allDiskExtracted = await this.readExtractedFiles();
    warnExtractedMismatches(
      allDiskExtracted,
      snapshot,
      options.preferredSources,
      this.options.onWarning,
    );
    const missingSources = await findMissingSources(
      this.options.root,
      allDiskExtracted,
      this.options.cleanupMissingSourceFiles !== false,
    );
    const missingSet = new Set(missingSources);
    const diskExtracted = allDiskExtracted;
    const seen = new Set(snapshot.seen);
    const activeFiles = options.complete
      ? Object.values(snapshot.extracted)
      : [
          ...diskExtracted.filter(
            (file) => !missingSet.has(file.source) && !seen.has(file.source),
          ),
          ...Object.values(snapshot.extracted),
        ];
    const activeMessageIds = activeFiles.flatMap((file) =>
      file.messages.map((message) => message.id),
    );
    const cache = await this.updateMemory(snapshot, activeMessageIds);
    const activeExtracted = new Set(Object.keys(snapshot.extracted));
    const staleSources = options.complete
      ? diskExtracted.map((file) => file.source)
      : snapshot.seen;
    for (const source of staleSources) {
      if (!activeExtracted.has(source)) await this.removeExtracted(source);
    }
    for (const source of missingSources) await this.removeExtracted(source);

    for (const [source, extracted] of Object.entries(snapshot.extracted)) {
      await this.writeJson(
        extractedPath(this.directory, source),
        hydrateExtracted(extracted),
      );
    }
    await this.writeLocales(
      uniqueMessages(activeFiles),
      cache.messages,
      await transactTranslationOverrides(
        translationOverridesPath(this.directory),
        () => undefined,
      ),
    );
    return cache;
  }

  private async readExtractedFiles(): Promise<ExtractedFile[]> {
    return readGeneratedJsonFiles(
      path.join(this.directory, 'extracted'),
      'extracted',
      parseExtractedFile,
      this.options.onWarning,
    );
  }

  private async updateMemory(
    snapshot?: ProjectSnapshot,
    activeMessageIds?: readonly string[],
  ): Promise<TranslationMemoryFile> {
    const store = await this.getMemoryStore();
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
    await this.refreshManagedFiles(store);
    return persistent;
  }

  private async refreshManagedFiles(
    store: TranslationMemoryStore,
  ): Promise<void> {
    this.translationManagedFiles.clear();
    for (const file of await store.watchFiles()) {
      this.translationManagedFiles.add(path.resolve(file));
    }
  }

  private getMemoryStore(): Promise<TranslationMemoryStore> {
    return (this.memoryStore ??= openTranslationMemoryStore({
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

  private async writeLocales(
    messages: readonly ExtractedMessage[],
    cacheMessages: Record<string, CacheMessage>,
    overrides: TranslationOverridesFile,
  ): Promise<void> {
    const directory = path.join(this.directory, 'locales');
    const expected = new Set<string>();
    for (const locale of this.options.locales) {
      if (locale.value === this.options.sourceLang) continue;
      const file = localePath(this.directory, locale.value);
      expected.add(file);
      await this.writeJson(
        file,
        hydrateLocale(
          {
            version: 1,
            locale: { ...locale },
            messages: {},
          },
          messages,
          cacheMessages,
          overrides,
        ),
      );
    }
    for (const file of await listJsonFiles(directory)) {
      if (!expected.has(file)) await fs.rm(file, { force: true });
    }
  }

  private async removeExtracted(source: string): Promise<void> {
    await fs.rm(extractedPath(this.directory, source), { force: true });
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    const content = await writeProtocolJson(file, value);
    if (content !== undefined)
      this.lastWritten.set(path.resolve(file), content);
  }
}

function uniqueMessages(files: readonly ExtractedFile[]): ExtractedMessage[] {
  const messages = new Map<string, ExtractedMessage>();
  for (const file of files) {
    for (const message of file.messages) {
      const previous = messages.get(message.id);
      if (previous && previous.source !== message.source) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 消息 ID“${message.id}”同时用于“${previous.source}”和“${message.source}”。`,
            `[ai-i18n] Message ID "${message.id}" is used by both "${previous.source}" and "${message.source}".`,
          ),
        );
      }
      messages.set(message.id, message);
    }
  }
  return [...messages.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}
