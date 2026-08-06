import path from 'node:path';
import { hashExtractedSource } from './extracted-path.js';

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
    `${hashExtractedSource(source)}.json`,
  );
}
