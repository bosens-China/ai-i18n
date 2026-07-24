import fs from 'node:fs/promises';
import path from 'node:path';
import {
  mergeCacheMessages,
  parseCacheFile,
  parseExtractedFile,
  parseLocaleFile,
  type CacheFileV1,
  type CacheMessage,
  type ExtractedFileV1,
  type LangOption,
  type LocaleFileV1,
} from '@ai-i18n/core';
import { enforceCacheCapacity } from './cache-capacity.js';
import {
  hydrateExtracted,
  hydrateLocale,
  mergeProjectMessages,
  messagesFromExtracted,
  overlayMessages,
  withConflictFiles,
} from './file-store-merge.js';
import type { AiI18nCacheOptions } from './options.js';
import type { ProjectSnapshot } from './project-state.js';
import {
  fileExists,
  listJsonFiles,
  readJson,
  readJsonRequired,
  readText,
  stableJson,
} from './json-files.js';

export interface FileStoreOptions {
  root: string;
  sourceLang: string;
  locales: readonly LangOption[];
  directory?: string;
  cleanupMissingSourceFiles?: boolean;
  cleanupOrphanMessages?: boolean;
  cache?: AiI18nCacheOptions;
  onWarning?: (message: string) => void;
}

export interface FileStoreLoadOptions {
  preferredSources?: readonly string[];
  preferredLocales?: readonly string[];
}

export class FileStore {
  readonly directory: string;
  private queue = Promise.resolve();
  private temporaryIndex = 0;
  private readonly lastWritten = new Map<string, string>();

  constructor(private readonly options: FileStoreOptions) {
    this.directory = path.resolve(options.root, options.directory ?? 'i18n');
  }

  async load(options: FileStoreLoadOptions = {}): Promise<CacheFileV1> {
    const cache = this.mergeExtracted(
      await this.readCache(),
      await this.readExtractedFiles(),
      options.preferredSources,
    );
    return this.mergeLocales(
      cache,
      await this.readLocaleFiles(),
      options.preferredLocales,
    );
  }

  sync(
    snapshot: ProjectSnapshot,
    options: FileStoreLoadOptions = {},
  ): Promise<CacheFileV1> {
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

  extractedSource(file: string): string | undefined {
    const base = path.join(this.directory, 'extracted');
    const relative = path.relative(base, path.resolve(file));
    if (
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      !relative.endsWith('.json')
    ) {
      return undefined;
    }
    return relative.slice(0, -'.json'.length).split(path.sep).join('/');
  }

  localeValue(file: string): string | undefined {
    const resolved = path.resolve(file);
    return this.options.locales.find(
      (locale) => this.localePath(locale.value) === resolved,
    )?.value;
  }

  loadOptions(files: Iterable<string>): FileStoreLoadOptions {
    const preferredSources = new Set<string>();
    const preferredLocales = new Set<string>();
    for (const file of files) {
      const source = this.extractedSource(file);
      if (source) preferredSources.add(source);
      const locale = this.localeValue(file);
      if (locale && locale !== this.options.sourceLang) {
        preferredLocales.add(locale);
      }
    }
    return {
      preferredSources: [...preferredSources].sort(),
      preferredLocales: [...preferredLocales].sort(),
    };
  }

  watchFiles(moduleId: string): string[] {
    return [
      this.cachePath(),
      this.extractedPath(moduleId),
      ...this.options.locales
        .filter((locale) => locale.value !== this.options.sourceLang)
        .map((locale) => this.localePath(locale.value)),
    ];
  }

  private async writeSnapshot(
    snapshot: ProjectSnapshot,
    options: FileStoreLoadOptions,
  ): Promise<CacheFileV1> {
    const diskExtracted = await this.readExtractedFiles();
    let cache = this.mergeExtracted(
      await this.readCache(),
      diskExtracted,
      options.preferredSources,
    );
    cache = this.mergeLocales(
      cache,
      await this.readLocaleFiles(),
      options.preferredLocales,
    );
    try {
      cache = {
        version: 1,
        files: { ...cache.files, ...snapshot.cache.files },
        messages: mergeProjectMessages(cache.messages, snapshot.cache.messages),
      };
    } catch (error) {
      throw withConflictFiles(error, [
        ...diskExtracted,
        ...Object.values(snapshot.extracted),
      ]);
    }
    this.ensureCurrentLocales(cache.messages);

    const missingSources = await this.removeMissingSources(cache);
    this.removeOrphanMessages(cache);
    const { cache: capacity, onWarning } = this.options;
    enforceCacheCapacity(cache, snapshot.cache.files, capacity, onWarning);
    const activeExtracted = new Set(Object.keys(snapshot.extracted));
    for (const source of snapshot.seen) {
      if (!activeExtracted.has(source)) await this.removeExtracted(source);
    }
    for (const source of missingSources) await this.removeExtracted(source);

    for (const [source, extracted] of Object.entries(snapshot.extracted)) {
      await this.writeJson(
        this.extractedPath(source),
        hydrateExtracted(
          extracted,
          cache.messages,
          this.options.locales
            .map((locale) => locale.value)
            .filter((locale) => locale !== this.options.sourceLang),
        ),
      );
    }
    await this.writeLocales(snapshot.locales, cache.messages);
    // cache 最后写，异常中断后下次可由 extracted/locales 重新校准。
    await this.writeJson(this.cachePath(), cache);
    return cache;
  }

  private async readCache(): Promise<CacheFileV1> {
    const value = await readJson(this.cachePath());
    return value === undefined
      ? { version: 1, files: {}, messages: {} }
      : parseCacheFile(value);
  }

  private async readExtractedFiles(): Promise<ExtractedFileV1[]> {
    const directory = path.join(this.directory, 'extracted');
    const files = await listJsonFiles(directory);
    return Promise.all(
      files.map(async (file) =>
        parseExtractedFile(await readJsonRequired(file)),
      ),
    );
  }

  private async readLocaleFiles(): Promise<LocaleFileV1[]> {
    const directory = path.join(this.directory, 'locales');
    const files = await listJsonFiles(directory);
    return Promise.all(
      files.map(async (file) => parseLocaleFile(await readJsonRequired(file))),
    );
  }

  private mergeExtracted(
    cache: CacheFileV1,
    extractedFiles: readonly ExtractedFileV1[],
    preferredSources: readonly string[] = [],
  ): CacheFileV1 {
    let activeMessages: Record<string, CacheMessage> = {};
    const preferredSet = new Set(preferredSources);
    const regularFiles = extractedFiles.filter(
      (file) => !preferredSet.has(file.source),
    );
    for (const extracted of regularFiles) {
      try {
        activeMessages = mergeCacheMessages(
          activeMessages,
          Object.fromEntries(
            extracted.messages.map((message) => [
              message.id,
              {
                source: message.source,
                ...(message.comment ? { comment: message.comment } : {}),
                translations: message.translations,
              },
            ]),
          ),
        );
      } catch (error) {
        throw withConflictFiles(error, regularFiles);
      }
    }
    let messages = overlayMessages(cache.messages, activeMessages, false);
    const preferredFiles = extractedFiles.filter((file) =>
      preferredSet.has(file.source),
    );
    if (preferredFiles.length) {
      let preferredMessages: Record<string, CacheMessage> = {};
      for (const preferred of preferredFiles) {
        preferredMessages = mergeCacheMessages(
          preferredMessages,
          messagesFromExtracted(preferred),
        );
      }
      messages = overlayMessages(messages, preferredMessages, true);
    }
    this.ensureCurrentLocales(messages);
    return { version: 1, files: { ...cache.files }, messages };
  }

  private mergeLocales(
    cache: CacheFileV1,
    localeFiles: readonly LocaleFileV1[],
    preferredLocales: readonly string[] = [],
  ): CacheFileV1 {
    const preferred = new Set(preferredLocales);
    for (const localeFile of localeFiles) {
      const locale = localeFile.locale.value;
      if (!preferred.has(locale) || locale === this.options.sourceLang) {
        continue;
      }
      for (const [messageId, value] of Object.entries(localeFile.messages)) {
        const message = cache.messages[messageId];
        if (message) message.translations[locale] = value;
      }
    }
    this.ensureCurrentLocales(cache.messages);
    return cache;
  }

  private ensureCurrentLocales(messages: Record<string, CacheMessage>): void {
    const targetLocales = this.options.locales.filter(
      (locale) => locale.value !== this.options.sourceLang,
    );
    for (const message of Object.values(messages)) {
      for (const locale of targetLocales) {
        if (!(locale.value in message.translations)) {
          message.translations[locale.value] = null;
        }
      }
    }
  }

  private async removeMissingSources(cache: CacheFileV1): Promise<string[]> {
    if (this.options.cleanupMissingSourceFiles === false) return [];
    const missing: string[] = [];
    for (const source of Object.keys(cache.files)) {
      if (!(await fileExists(path.resolve(this.options.root, source)))) {
        delete cache.files[source];
        missing.push(source);
      }
    }
    return missing;
  }

  private removeOrphanMessages(cache: CacheFileV1): void {
    if (!this.options.cleanupOrphanMessages) return;
    const active = new Set(
      Object.values(cache.files).flatMap((file) => file.messageIds),
    );
    for (const messageId of Object.keys(cache.messages)) {
      if (!active.has(messageId)) delete cache.messages[messageId];
    }
  }

  private async writeLocales(
    locales: readonly LocaleFileV1[],
    cacheMessages: Record<string, CacheMessage>,
  ): Promise<void> {
    const directory = path.join(this.directory, 'locales');
    const expected = new Set<string>();
    for (const locale of locales) {
      const file = path.join(
        directory,
        `${encodeURIComponent(locale.locale.value)}.json`,
      );
      expected.add(file);
      await this.writeJson(
        file,
        hydrateLocale(locale, cacheMessages, this.options.sourceLang),
      );
    }
    for (const file of await listJsonFiles(directory)) {
      if (!expected.has(file)) await fs.rm(file, { force: true });
    }
  }

  private cachePath(): string {
    return path.join(this.directory, 'cache.json');
  }

  private localePath(locale: string): string {
    return path.join(
      this.directory,
      'locales',
      `${encodeURIComponent(locale)}.json`,
    );
  }

  private extractedPath(source: string): string {
    const base = path.join(this.directory, 'extracted');
    const file = path.resolve(base, `${source}.json`);
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
      throw new Error(`[ai-i18n] invalid extracted source path "${source}"`);
    }
    return file;
  }

  private async removeExtracted(source: string): Promise<void> {
    await fs.rm(this.extractedPath(source), { force: true });
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    const content = stableJson(value);
    if ((await readText(file)) === content) return;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${this.temporaryIndex++}.tmp`;
    try {
      await fs.writeFile(temporary, content, 'utf8');
      await fs.rename(temporary, file);
      this.lastWritten.set(path.resolve(file), content);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
}
