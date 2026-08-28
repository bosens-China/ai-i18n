import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseExtractedFile,
  type ExtractedFile,
  type TranslationMemoryFile,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import {
  readTranslationOverrides,
  translationOverrideFiles,
  transactTranslationOverrides,
} from '@ai-i18n/core/translation-memory';
import { findMissingSources } from './file-store-cleanup.js';
import {
  extractedPath,
  localePath,
  translationOverridesPath,
} from './file-store-paths.js';
import {
  readGeneratedJsonFiles,
  type GeneratedJsonFile,
  warnExtractedMismatches,
  writeProtocolJson,
} from './file-store-io.js';
import { hydrateExtracted, translationFieldKey } from './file-store-merge.js';
import {
  loadIncrementalSyncState,
  writeFullLocales,
  writeIncrementalExtracted,
  writeIncrementalLocales,
} from './file-store-incremental.js';
import { FileStoreMemory } from './file-store-memory.js';
import type {
  FileStoreLoadOptions,
  FileStoreOptions,
} from './file-store-types.js';
import type { ProjectSnapshot } from './project-state.js';
import type { DevTimingStage } from './dev-timing.js';
import { readJson, readText } from './json-files.js';

export type {
  FileStoreLoadOptions,
  FileStoreOptions,
} from './file-store-types.js';

export class FileStore {
  readonly directory: string;
  private queue = Promise.resolve();
  private readonly lastWritten = new Map<string, string>();
  private readonly memory: FileStoreMemory;
  private readonly providerFields = new Set<string>();
  private readonly pendingProviderBatches = new Set<string>();
  private readonly translationManagedFiles = new Set<string>();
  private readonly overrideManagedFiles = new Set<string>();

  constructor(private readonly options: FileStoreOptions) {
    this.directory = path.resolve(options.root, options.directory ?? 'i18n');
    this.memory = new FileStoreMemory(
      this.directory,
      options,
      this.providerFields,
      (files) => {
        this.translationManagedFiles.clear();
        for (const file of files) this.translationManagedFiles.add(file);
      },
    );
  }

  async load(): Promise<TranslationMemoryFile> {
    return this.memory.update();
  }

  loadExtracted(): Promise<ExtractedFile[]> {
    return this.readExtractedFiles();
  }

  async loadOverrides(): Promise<TranslationOverridesFile> {
    const directory = translationOverridesPath(this.directory);
    const overrides = await readTranslationOverrides(directory);
    this.updateOverrideManagedFiles(await translationOverrideFiles(directory));
    return overrides;
  }

  async transactOverrides(
    update: (overrides: TranslationOverridesFile) => void | Promise<void>,
  ): Promise<TranslationOverridesFile> {
    const directory = translationOverridesPath(this.directory);
    const overrides = await transactTranslationOverrides(directory, update);
    this.updateOverrideManagedFiles(await translationOverrideFiles(directory));
    return overrides;
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

  devWatchTargets(): string[] {
    return [
      this.directory,
      ...this.translationManagedFiles,
      ...this.overrideManagedFiles,
    ];
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
      ...this.overrideManagedFiles,
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

  private updateOverrideManagedFiles(files: readonly string[]): void {
    this.overrideManagedFiles.clear();
    for (const file of files) this.overrideManagedFiles.add(path.resolve(file));
  }

  async close(): Promise<void> {
    await this.memory.close();
  }

  private async writeSnapshot(
    snapshot: ProjectSnapshot,
    options: FileStoreLoadOptions,
  ): Promise<TranslationMemoryFile> {
    if (options.changedSources?.length) {
      const incremental = await this.measure('extracted-scan', options, () =>
        loadIncrementalSyncState(
          {
            directory: this.directory,
            sourceLang: this.options.sourceLang,
            locales: this.options.locales,
          },
          snapshot,
          options.changedSources!,
        ),
      );
      if (incremental) {
        const cache = await this.measure(
          'translation-memory-sync',
          options,
          () => this.memory.update(snapshot),
        );
        await this.measure('extracted-write', options, () =>
          writeIncrementalExtracted(
            {
              directory: this.directory,
              sourceLang: this.options.sourceLang,
              locales: this.options.locales,
            },
            incremental,
            (file, value) => this.writeJson(file, value),
          ),
        );
        await this.measure('locale-write', options, async () =>
          writeIncrementalLocales(
            {
              directory: this.directory,
              sourceLang: this.options.sourceLang,
              locales: this.options.locales,
            },
            incremental,
            cache.messages,
            await transactTranslationOverrides(
              translationOverridesPath(this.directory),
              () => undefined,
            ),
            (file, value) => this.writeJson(file, value),
          ),
        );
        return cache;
      }
    }

    const { allDiskEntries, allDiskExtracted, missingSources } =
      await this.measure('extracted-scan', options, async () => {
        const allDiskEntries = await this.readExtractedFileEntries();
        const allDiskExtracted = allDiskEntries.map((entry) => entry.value);
        const missingSources = await findMissingSources(
          this.options.root,
          allDiskExtracted,
          this.options.cleanupMissingSourceFiles !== false,
        );
        return { allDiskEntries, allDiskExtracted, missingSources };
      });
    warnExtractedMismatches(
      allDiskExtracted,
      snapshot,
      options.preferredSources,
      this.options.onWarning,
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
    const cache = await this.measure('translation-memory-sync', options, () =>
      this.memory.update(snapshot, activeMessageIds),
    );
    const activeExtracted = new Set(Object.keys(snapshot.extracted));
    const staleSources = options.complete
      ? diskExtracted.map((file) => file.source)
      : snapshot.seen;
    await this.measure('extracted-write', options, async () => {
      if (options.complete) {
        // 完整 Build 的 snapshot 是全量真相，可以安全移除旧命名 generated 文件。
        for (const entry of allDiskEntries) {
          if (
            path.resolve(entry.file) !==
            path.resolve(extractedPath(this.directory, entry.value.source))
          ) {
            await fs.rm(entry.file, { force: true });
          }
        }
      }
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
    });
    await this.measure('locale-write', options, async () =>
      writeFullLocales(
        {
          directory: this.directory,
          sourceLang: this.options.sourceLang,
          locales: this.options.locales,
        },
        activeFiles,
        cache.messages,
        await transactTranslationOverrides(
          translationOverridesPath(this.directory),
          () => undefined,
        ),
        (file, value) => this.writeJson(file, value),
      ),
    );
    return cache;
  }

  private async readExtractedFiles(): Promise<ExtractedFile[]> {
    return (await this.readExtractedFileEntries()).map((entry) => entry.value);
  }

  private readExtractedFileEntries(): Promise<
    Array<GeneratedJsonFile<ExtractedFile>>
  > {
    return readGeneratedJsonFiles(
      path.join(this.directory, 'extracted'),
      'extracted',
      parseExtractedFile,
      this.options.onWarning,
    );
  }

  private async removeExtracted(source: string): Promise<void> {
    await fs.rm(extractedPath(this.directory, source), { force: true });
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    const content = await writeProtocolJson(file, value);
    if (content !== undefined)
      this.lastWritten.set(path.resolve(file), content);
  }

  private async measure<T>(
    stage: DevTimingStage,
    options: FileStoreLoadOptions,
    task: () => T | PromiseLike<T>,
  ): Promise<T> {
    const timing = this.options.timing;
    return timing
      ? timing.measure(stage, options.timingModuleId ?? '<project>', task)
      : await task();
  }
}
