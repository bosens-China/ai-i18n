import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseExtractedFile,
  parseLocaleFile,
  runtimeMessageId,
  type CacheMessage,
  type ExtractedFile,
  type LangOption,
  type LocaleFileV1,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import { extractedPath, localePath } from './file-store-paths.js';
import { hydrateExtracted, hydrateLocale } from './file-store-merge.js';
import type { ProjectSnapshot } from './project-snapshot.js';
import { listJsonFiles, readJson } from './json-files.js';

interface IncrementalExtractedChange {
  source: string;
  previous?: ExtractedFile;
  next?: ExtractedFile;
}

export interface IncrementalSyncState {
  changes: readonly IncrementalExtractedChange[];
  localeFiles: ReadonlyMap<string, LocaleFileV1>;
}

interface IncrementalFileOptions {
  directory: string;
  sourceLang: string;
  locales: readonly LangOption[];
}

export async function loadIncrementalSyncState(
  options: IncrementalFileOptions,
  snapshot: ProjectSnapshot,
  changedSources: readonly string[],
): Promise<IncrementalSyncState | undefined> {
  const localeFiles = new Map<string, LocaleFileV1>();
  for (const locale of targetLocales(options)) {
    const value = await readJson(localePath(options.directory, locale.value));
    // 没有可复用的完整 locale 时回退全量同步，避免丢失未访问模块。
    if (value === undefined) return undefined;
    localeFiles.set(locale.value, parseLocaleFile(value));
  }

  const changes = await Promise.all(
    changedSources.map(async (source): Promise<IncrementalExtractedChange> => {
      const file = extractedPath(options.directory, source);
      const previousValue = await readJson(file);
      const previous =
        previousValue === undefined
          ? undefined
          : parseExtractedFile(previousValue);
      const next = snapshot.extracted[source];
      return {
        source,
        ...(previous ? { previous } : {}),
        ...(next ? { next } : {}),
      };
    }),
  );
  return { changes, localeFiles };
}

export async function writeIncrementalExtracted(
  options: IncrementalFileOptions,
  state: IncrementalSyncState,
  writeJson: (file: string, value: unknown) => Promise<void>,
): Promise<void> {
  for (const change of state.changes) {
    const file = extractedPath(options.directory, change.source);
    if (change.next) await writeJson(file, hydrateExtracted(change.next));
    else await fs.rm(file, { force: true });
  }
}

export async function writeIncrementalLocales(
  options: IncrementalFileOptions,
  state: IncrementalSyncState,
  cacheMessages: Record<string, CacheMessage>,
  overrides: TranslationOverridesFile,
  writeJson: (file: string, value: unknown) => Promise<void>,
): Promise<void> {
  const nextFiles = state.changes.flatMap((change) =>
    change.next ? [change.next] : [],
  );
  for (const locale of targetLocales(options)) {
    const current = state.localeFiles.get(locale.value)!;
    current.locale = { ...locale };
    for (const change of state.changes) {
      for (const message of change.previous?.messages ?? []) {
        delete current.messages[runtimeMessageId(change.source, message.id)];
      }
    }
    const updated = hydrateLocale(
      { version: 1, locale: { ...locale }, messages: {} },
      nextFiles,
      cacheMessages,
      overrides,
    );
    Object.assign(current.messages, updated.messages);
    await writeJson(localePath(options.directory, locale.value), current);
  }
}

export async function writeFullLocales(
  options: IncrementalFileOptions,
  files: readonly ExtractedFile[],
  cacheMessages: Record<string, CacheMessage>,
  overrides: TranslationOverridesFile,
  writeJson: (file: string, value: unknown) => Promise<void>,
): Promise<void> {
  const directory = path.join(options.directory, 'locales');
  const expected = new Set<string>();
  for (const locale of targetLocales(options)) {
    const file = localePath(options.directory, locale.value);
    expected.add(file);
    await writeJson(
      file,
      hydrateLocale(
        { version: 1, locale: { ...locale }, messages: {} },
        files,
        cacheMessages,
        overrides,
      ),
    );
  }
  for (const file of await listJsonFiles(directory)) {
    if (!expected.has(file)) await fs.rm(file, { force: true });
  }
}

function targetLocales(options: IncrementalFileOptions): readonly LangOption[] {
  return options.locales.filter(
    (locale) => locale.value !== options.sourceLang,
  );
}
