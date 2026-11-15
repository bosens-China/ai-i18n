import path from 'node:path';
import type { ExtractedFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { isInternalStoreFile, localePath } from './file-store-paths.js';
import type { FileStoreOptions } from './file-store-types.js';
import { readJson } from './json-files.js';
import { RepositoryStore } from './repository-store.js';

export class FileStore {
  readonly directory: string;
  readonly repository: RepositoryStore;

  constructor(private readonly options: FileStoreOptions) {
    this.repository = new RepositoryStore(options.root, options.directory);
    this.directory = this.repository.directory;
  }

  loadExtracted(): Promise<ExtractedFile[]> {
    return Promise.resolve(this.repository.loadExtracted());
  }

  async loadGeneratedLocale(locale: string): Promise<Record<string, string>> {
    const file = localePath(this.directory, locale);
    const value = await readJson(file);
    if (value === undefined) return {};
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.values(value).some((item) => typeof item !== 'string')
    ) {
      throw new TypeError(
        diagnosticMessage(
          `[ai-i18n] 生成资源“${file}”必须是 key→value 对象。`,
          `[ai-i18n] Generated locale "${file}" must be a key-value object.`,
        ),
      );
    }
    return value as Record<string, string>;
  }

  manages(file: string): boolean {
    const resolved = path.resolve(file);
    if (isInternalStoreFile(this.directory, resolved)) return false;
    const relative = path.relative(this.directory, resolved);
    return (
      relative !== '' &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      relative.endsWith('.json')
    );
  }

  devWatchTargets(): string[] {
    return [this.directory];
  }
  watchFiles(): string[] {
    return this.options.locales
      .filter((locale) => locale.value !== this.options.sourceLang)
      .map((locale) => localePath(this.directory, locale.value));
  }
  async close(): Promise<void> {}
}
