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
  readTranslationOverrides,
  transactTranslationMemory,
  transactTranslationOverrides,
} from '@ai-i18n/core/translation-memory';
import { enforceCacheCapacity } from './cache-capacity.js';
import {
  findMissingSources,
  removeOrphanMessages,
} from './file-store-cleanup.js';
import {
  extractedPath,
  localePath,
  translationMemoryPath,
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
    // 每次任务都从最新磁盘状态开始；失败不会阻塞后续写入任务。
    const task = this.queue.then(
      () => this.writeSnapshot(snapshot, options),
      () => this.writeSnapshot(snapshot, options),
    );
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  manages(file: string): boolean {
    const relative = path.relative(this.directory, path.resolve(file));
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
      translationMemoryPath(this.directory),
      translationOverridesPath(this.directory),
      extractedPath(this.directory, moduleId),
      ...this.options.locales
        .filter((locale) => locale.value !== this.options.sourceLang)
        .map((locale) => localePath(this.directory, locale.value)),
    ];
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
    return transactTranslationMemory(
      translationMemoryPath(this.directory),
      (memory) => {
        if (snapshot) {
          memory.messages = mergeProjectMessages(
            memory.messages,
            snapshot.cache.messages,
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
            this.options.cache,
            this.options.onWarning,
          );
        }
      },
    );
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
