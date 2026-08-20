import { createHash } from 'node:crypto';
import path from 'node:path';

export const STORAGE_MARKER = 'storage.json';
export const LEGACY_TRANSLATIONS = 'translations.json';
export const JSON_TRANSLATIONS_DIRECTORY = 'translations';

export function storageMarkerPath(directory: string): string {
  return path.join(directory, STORAGE_MARKER);
}

export function legacyTranslationMemoryPath(directory: string): string {
  return path.join(directory, LEGACY_TRANSLATIONS);
}

export function jsonTranslationMemoryPath(directory: string): string {
  return path.join(directory, JSON_TRANSLATIONS_DIRECTORY);
}

export function projectKey(directory: string): string {
  const resolved = path.resolve(directory);
  const stable =
    process.platform === 'win32'
      ? resolved.toLocaleLowerCase('en-US')
      : resolved;
  return createHash('sha256').update(stable).digest('hex');
}
