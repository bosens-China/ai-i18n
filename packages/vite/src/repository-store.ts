import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExtractedFile } from '@ai-i18n/core';
import { readTranslationOverrides } from '@ai-i18n/core/translation-memory';
import { ExtractionIndex } from './extraction-index.js';
import { writeLocaleOutput } from './locale-output.js';
import {
  readManualLocale,
  withManualTranslationQueue,
  writeManualLocale,
} from './manual-translations.js';
import { planOverrideMigration } from './override-migration.js';
import type { OverrideMigration } from './override-migration.js';
import { buildTranslationCatalog } from './translation-catalog.js';
import {
  validateTranslationSnapshot,
  type TranslationAdapter,
  type TranslationCatalog,
  type TranslationSnapshot,
} from './translation-adapter.js';

export interface PreparedRepository {
  files: readonly ExtractedFile[];
  catalog: TranslationCatalog;
  snapshot: TranslationSnapshot;
  manual: OverrideMigration;
}

export class RepositoryStore {
  readonly directory: string;
  private index?: ExtractionIndex;

  constructor(
    readonly root: string,
    directory = 'i18n',
  ) {
    this.directory = path.resolve(root, directory);
  }

  private extractionIndex(): ExtractionIndex {
    return (this.index ??= new ExtractionIndex(this.root));
  }

  loadExtracted(): ExtractedFile[] {
    return this.extractionIndex().load();
  }

  async prepare(
    files: readonly ExtractedFile[],
    sourceLang: string,
    locales: readonly string[],
    adapter?: TranslationAdapter,
  ): Promise<PreparedRepository> {
    const catalog = buildTranslationCatalog(
      this.root,
      sourceLang,
      locales,
      files,
    );
    const existing = { global: {}, files: {} } as {
      global: Record<string, Record<string, string>>;
      files: Record<string, Record<string, string>>;
    };
    for (const locale of locales) {
      if (locale === sourceLang) continue;
      existing.global[locale] = await readManualLocale(
        this.directory,
        locale,
        'global',
      );
      existing.files[locale] = await readManualLocale(
        this.directory,
        locale,
        'file',
      );
    }
    const legacy = await readTranslationOverrides(
      path.join(this.directory, 'overrides'),
    );
    const manual = planOverrideMigration(
      this.root,
      files,
      legacy,
      locales,
      existing,
    );
    const snapshot = validateTranslationSnapshot(
      catalog,
      (await adapter?.(catalog)) ?? null,
    );
    return {
      files,
      catalog,
      snapshot,
      manual,
    };
  }

  /** 构建全量成功后才替换 SQLite 索引和清理旧目录。 */
  async commit(
    prepared: PreparedRepository,
    groupForFile: Readonly<Record<string, string>>,
    cleanupLegacy = true,
  ): Promise<Map<string, Record<string, string>>> {
    const { files, catalog, snapshot } = prepared;
    return withManualTranslationQueue(this.directory, async () => {
      const existing = { global: {}, files: {} } as OverrideMigration;
      for (const locale of catalog.locales) {
        if (locale === catalog.sourceLang) continue;
        existing.global[locale] = await readManualLocale(
          this.directory,
          locale,
          'global',
        );
        existing.files[locale] = await readManualLocale(
          this.directory,
          locale,
          'file',
        );
      }
      const legacy = await readTranslationOverrides(
        path.join(this.directory, 'overrides'),
      );
      const manual = planOverrideMigration(
        this.root,
        files,
        legacy,
        catalog.locales,
        existing,
      );
      if (legacy.rules.length) {
        for (const locale of catalog.locales) {
          if (locale === catalog.sourceLang) continue;
          for (const scope of ['global', 'file'] as const) {
            const value =
              scope === 'global' ? manual.global[locale] : manual.files[locale];
            const previous =
              scope === 'global'
                ? existing.global[locale]
                : existing.files[locale];
            if (JSON.stringify(value) === JSON.stringify(previous)) continue;
            await writeManualLocale(this.directory, locale, scope, value);
          }
        }
      }
      const outputs = await writeLocaleOutput(
        this.directory,
        catalog,
        snapshot,
        groupForFile,
        manual,
      );
      this.extractionIndex().write(
        Object.fromEntries(files.map((file) => [file.source, file])),
        [],
        true,
      );
      if (cleanupLegacy) await this.cleanupLegacy();
      return outputs;
    });
  }

  async cleanupLegacy(): Promise<void> {
    for (const name of ['extracted', 'translations', 'overrides']) {
      const target = path.resolve(this.directory, name);
      if (path.dirname(target) !== this.directory)
        throw new Error('Invalid cleanup path');
      await fs.rm(target, { recursive: true, force: true });
    }
  }

  async rebuild(
    files: readonly ExtractedFile[],
    sourceLang: string,
    locales: readonly string[],
    groupForFile: Readonly<Record<string, string>>,
    adapter?: TranslationAdapter,
  ): Promise<void> {
    const prepared = await this.prepare(files, sourceLang, locales, adapter);
    await this.commit(prepared, groupForFile);
  }
}
