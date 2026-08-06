import { createHash } from 'node:crypto';
import os from 'node:os';
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

export function globalTranslationMemoryPath(
  explicitDirectory?: string,
): string {
  const directory = path.resolve(
    explicitDirectory ??
      process.env.AI_I18N_DATA_DIR ??
      platformDataDirectory(),
  );
  return path.join(directory, 'translation-memory.sqlite');
}

function platformDataDirectory(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ai-i18n');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'ai-i18n',
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
    'ai-i18n',
  );
}
