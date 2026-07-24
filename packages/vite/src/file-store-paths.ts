import path from 'node:path';
import { encodeExtractedSource } from './extracted-path.js';

export function cachePath(directory: string): string {
  return path.join(directory, 'cache.json');
}

export function localePath(directory: string, locale: string): string {
  return path.join(directory, 'locales', `${encodeURIComponent(locale)}.json`);
}

export function extractedPath(directory: string, source: string): string {
  return path.join(
    directory,
    'extracted',
    `${encodeExtractedSource(source)}.json`,
  );
}

export function legacyExtractedPath(directory: string, source: string): string {
  const base = path.join(directory, 'extracted');
  const file = path.resolve(base, `${source}.json`);
  if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
    throw new Error(`[ai-i18n] invalid extracted source path "${source}"`);
  }
  return file;
}
