import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseExtractedFile,
  type CacheMessage,
  type ExtractedFile,
  type ExtractedMessage,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import {
  openTranslationMemoryStore,
  readTranslationOverrides,
  type TranslationMemoryStore,
} from '@ai-i18n/core/translation-memory';
import { fail } from './errors.js';

export interface LoadedProject {
  directory: string;
  extracted: ExtractedFile[];
  messages: Record<string, CacheMessage>;
  overrides: TranslationOverridesFile;
  locales: Set<string>;
  memoryStore: TranslationMemoryStore;
}

const memoryStores = new Map<string, Promise<TranslationMemoryStore>>();

export async function closeProjectMemoryStores(): Promise<void> {
  const stores = [...memoryStores.values()];
  memoryStores.clear();
  for (const store of await Promise.all(stores)) store.close();
}

export async function resolveI18nDirectory(input: string): Promise<string> {
  if (!path.isAbsolute(input)) {
    fail('I18N_DIRECTORY_NOT_ABSOLUTE', { i18n_directory: input });
  }
  let directory: string;
  try {
    directory = await fs.realpath(input);
  } catch (error) {
    if (isNotFound(error)) {
      fail('I18N_DIRECTORY_NOT_FOUND', { i18n_directory: input });
    }
    throw error;
  }
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) {
    fail('I18N_DIRECTORY_NOT_DIRECTORY', { i18n_directory: input });
  }
  return directory;
}

export async function readJsonRequired(file: string): Promise<unknown> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      fail('REQUIRED_PROTOCOL_FILE_MISSING', {
        file: path.basename(file),
      });
    }
    throw error;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    fail('INVALID_PROTOCOL_JSON', { file: path.basename(file) });
  }
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

async function requireDirectory(directory: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch (error) {
    if (isNotFound(error)) {
      fail('REQUIRED_PROTOCOL_DIRECTORY_MISSING', {
        directory: path.basename(directory),
      });
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    fail('PROTOCOL_PATH_NOT_DIRECTORY', {
      directory: path.basename(directory),
    });
  }
}

export async function loadProject(
  i18nDirectory: string,
): Promise<LoadedProject> {
  const directory = await resolveI18nDirectory(i18nDirectory);
  const extractedDirectory = path.join(directory, 'extracted');
  const memoryStore = await projectMemoryStore(directory);
  const [memory, overrides] = await Promise.all([
    memoryStore.load(),
    readTranslationOverrides(path.join(directory, 'overrides')),
    requireDirectory(extractedDirectory),
  ]);
  const extractedPaths = await listJsonFiles(extractedDirectory);
  const extracted = await Promise.all(
    extractedPaths.map((file) => readProtocolFile(file, parseExtractedFile)),
  );
  const filesBySource = new Map<string, string[]>();
  const messageSources = new Map<string, string>();
  for (const [index, item] of extracted.entries()) {
    const protocolPath = path
      .relative(directory, extractedPaths[index]!)
      .split(path.sep)
      .join('/');
    const files = filesBySource.get(item.source) ?? [];
    files.push(protocolPath);
    filesBySource.set(item.source, files);
  }
  const duplicate = [...filesBySource.entries()].find(
    ([, files]) => files.length > 1,
  );
  if (duplicate) {
    fail('DUPLICATE_EXTRACTED_SOURCE', {
      source_file: duplicate[0],
      conflicting_files: duplicate[1].sort(),
    });
  }
  for (const item of extracted) {
    for (const message of item.messages) {
      const previous = messageSources.get(message.id);
      if (previous !== undefined && previous !== message.source) {
        fail('MESSAGE_ID_SOURCE_CONFLICT', {
          message_id: message.id,
          first_source: previous,
          second_source: message.source,
        });
      }
      messageSources.set(message.id, message.source);
    }
  }
  const messages = memory.messages;
  return {
    directory,
    memoryStore,
    extracted,
    messages,
    overrides,
    locales: new Set(
      Object.values(messages).flatMap((message) =>
        Object.keys(message.translations),
      ),
    ),
  };
}

async function projectMemoryStore(
  directory: string,
): Promise<TranslationMemoryStore> {
  const existing = memoryStores.get(directory);
  if (existing) return existing;
  const opened = openTranslationMemoryStore(directory);
  memoryStores.set(directory, opened);
  try {
    return await opened;
  } catch (error) {
    memoryStores.delete(directory);
    throw error;
  }
}

export function filterTranslations(
  translations: Record<string, string | null>,
  locales?: readonly string[],
): Record<string, string | null> {
  return locales
    ? Object.fromEntries(
        locales.map((locale) => [locale, translations[locale] ?? null]),
      )
    : { ...translations };
}

export function validateLocales(
  project: LoadedProject,
  locales?: readonly string[],
): void {
  for (const locale of locales ?? []) {
    if (project.locales.size > 0 && !project.locales.has(locale)) {
      fail('UNKNOWN_LOCALE', {
        locale,
        available_locales: [...project.locales].sort(),
      });
    }
  }
}

export function findExtracted(
  project: LoadedProject,
  source: string,
): ExtractedFile {
  const extracted = project.extracted.find((item) => item.source === source);
  if (!extracted) {
    fail('SOURCE_FILE_NOT_FOUND', { source_file: source });
  }
  return extracted;
}

export function collectOccurrences(files: readonly ExtractedFile[]): Map<
  string,
  Array<{
    file: string;
    id: string;
    source: string;
    comment?: string;
    locations: Array<{ line: number; column: number }>;
  }>
> {
  const occurrences = new Map<
    string,
    Array<{
      file: string;
      id: string;
      source: string;
      comment?: string;
      locations: Array<{ line: number; column: number }>;
    }>
  >();
  for (const file of files) {
    for (const message of file.messages) {
      const items = occurrences.get(message.id) ?? [];
      items.push({
        file: file.source,
        id: message.id,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        locations: message.locations,
      });
      occurrences.set(message.id, items);
    }
  }
  for (const items of occurrences.values()) {
    items.sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : 0,
    );
  }
  return occurrences;
}

export function cacheMessage(
  project: LoadedProject,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
): CacheMessage {
  const cached = project.messages[message.id];
  if (!cached) {
    fail('MESSAGE_MISSING_FROM_TRANSLATIONS', {
      message_id: message.id,
    });
  }
  if (cached.source !== message.source || cached.comment !== message.comment) {
    fail('MESSAGE_METADATA_MISMATCH', {
      message_id: message.id,
    });
  }
  return cached;
}

async function readProtocolFile<T>(
  file: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const value = await readJsonRequired(file);
  try {
    return parse(value);
  } catch {
    fail('INVALID_PROTOCOL_FILE', {
      file: path.basename(file),
    });
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
