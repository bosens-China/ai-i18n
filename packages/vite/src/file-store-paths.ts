import path from 'node:path';
import { encodeExtractedSource } from './extracted-path.js';

export function translationMemoryPath(directory: string): string {
  return path.join(directory, 'translations.json');
}

export function translationOverridesPath(directory: string): string {
  return path.join(directory, 'overrides.json');
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
