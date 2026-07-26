import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseExtractedFile,
  parseTranslationMemoryFile,
  parseTranslationOverridesFile,
  resolveTranslationOverride,
  type CacheMessage,
  type ExtractedFile,
  type ExtractedMessage,
  type TranslationOverridesFile,
  type TranslationValue,
} from '@ai-i18n/core';
import type { TranslationFileItem } from './project.js';

export interface LoadedProject {
  directory: string;
  extracted: ExtractedFile[];
  messages: Record<string, CacheMessage>;
  overrides: TranslationOverridesFile;
  locales: Set<string>;
}

export async function resolveI18nDirectory(input: string): Promise<string> {
  if (!path.isAbsolute(input)) {
    throw new Error('[ai-i18n/mcp] i18n_directory must be an absolute path');
  }
  let directory: string;
  try {
    directory = await fs.realpath(input);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        '[ai-i18n/mcp] i18n directory not found; read the Vite config and pass its final absolute path',
      );
    }
    throw error;
  }
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) {
    throw new Error('[ai-i18n/mcp] i18n_directory is not a directory');
  }
  return directory;
}

export async function readJsonRequired(file: string): Promise<unknown> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `[ai-i18n/mcp] required ai-i18n file is missing: ${path.basename(file)}`,
      );
    }
    throw error;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`[ai-i18n/mcp] invalid JSON file: ${path.basename(file)}`);
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
      throw new Error(
        `[ai-i18n/mcp] 缺少必需的 ai-i18n 目录 / required ai-i18n directory is missing: ${path.basename(directory)}`,
      );
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `[ai-i18n/mcp] 必需的 ai-i18n 路径不是目录 / required ai-i18n path is not a directory: ${path.basename(directory)}`,
    );
  }
}

export async function loadProject(
  i18nDirectory: string,
): Promise<LoadedProject> {
  const directory = await resolveI18nDirectory(i18nDirectory);
  const extractedDirectory = path.join(directory, 'extracted');
  const [memory, overrides] = await Promise.all([
    readJsonRequired(path.join(directory, 'translations.json')).then(
      parseTranslationMemoryFile,
    ),
    readJsonRequired(path.join(directory, 'overrides.json')).then(
      parseTranslationOverridesFile,
    ),
    requireDirectory(extractedDirectory),
  ]);
  const extractedPaths = await listJsonFiles(extractedDirectory);
  const extracted = await Promise.all(
    extractedPaths.map(async (file) =>
      parseExtractedFile(await readJsonRequired(file)),
    ),
  );
  const sources = new Set<string>();
  const messageSources = new Map<string, string>();
  for (const item of extracted) {
    if (sources.has(item.source)) {
      throw new Error(
        `[ai-i18n/mcp] duplicate extracted source "${item.source}"`,
      );
    }
    sources.add(item.source);
    for (const message of item.messages) {
      const previous = messageSources.get(message.id);
      if (previous !== undefined && previous !== message.source) {
        throw new Error(
          `[ai-i18n/mcp] message ID "${message.id}" refers to both "${previous}" and "${message.source}"`,
        );
      }
      messageSources.set(message.id, message.source);
    }
  }
  const messages = memory.messages;
  return {
    directory,
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

export function summarizeFile(
  file: ExtractedFile,
  project: LoadedProject,
  locale?: string,
): TranslationFileItem {
  const missingByLocale: Record<string, number> = {};
  for (const extractedMessage of file.messages) {
    const translations = filterTranslations(
      effectiveTranslations(project, extractedMessage),
      locale,
    );
    for (const [targetLocale, value] of Object.entries(translations)) {
      if (value === null)
        missingByLocale[targetLocale] =
          (missingByLocale[targetLocale] ?? 0) + 1;
    }
  }
  return {
    file: file.source,
    message_count: file.messages.length,
    missing_count: Object.values(missingByLocale).reduce(
      (sum, count) => sum + count,
      0,
    ),
    missing_by_locale: missingByLocale,
  };
}

export function filterTranslations(
  translations: Record<string, string | null>,
  locale?: string,
): Record<string, string | null> {
  return locale
    ? { [locale]: translations[locale] ?? null }
    : { ...translations };
}

export function validateLocale(project: LoadedProject, locale?: string): void {
  if (locale && project.locales.size > 0 && !project.locales.has(locale)) {
    throw new Error(`[ai-i18n/mcp] unknown target locale "${locale}"`);
  }
}

export function findExtracted(
  project: LoadedProject,
  source: string,
): ExtractedFile {
  const extracted = project.extracted.find((item) => item.source === source);
  if (!extracted)
    throw new Error(`[ai-i18n/mcp] extracted source not found: "${source}"`);
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

export function effectiveTranslations(
  project: LoadedProject,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
): Record<string, TranslationValue> {
  const cached = cacheMessage(project, message).translations;
  return Object.fromEntries(
    Object.keys(cached).map((locale) => [
      locale,
      resolveTranslationOverride(project.overrides, message, locale) ??
        cached[locale] ??
        null,
    ]),
  );
}

export function cacheMessage(
  project: LoadedProject,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
): CacheMessage {
  const cached = project.messages[message.id];
  if (!cached) {
    throw new Error(
      `[ai-i18n/mcp] message "${message.id}" is missing from translations.json; run Vite Dev/Build and retry`,
    );
  }
  if (cached.source !== message.source || cached.comment !== message.comment) {
    throw new Error(
      `[ai-i18n/mcp] message "${message.id}" metadata differs between extracted and translations.json; run Vite Dev/Build and retry`,
    );
  }
  return cached;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
