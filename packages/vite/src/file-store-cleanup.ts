import path from 'node:path';
import type { CacheFileV2, ExtractedFileV1 } from '@ai-i18n/core';
import { fileExists } from './json-files.js';

export async function findMissingSources(
  root: string,
  extractedFiles: readonly ExtractedFileV1[],
  enabled: boolean,
): Promise<string[]> {
  if (!enabled) return [];
  const missing: string[] = [];
  for (const file of extractedFiles) {
    if (!(await fileExists(path.resolve(root, file.source)))) {
      missing.push(file.source);
    }
  }
  return missing;
}

export function removeOrphanMessages(
  cache: CacheFileV2,
  activeMessageIds: Iterable<string>,
  enabled: boolean,
): void {
  if (!enabled) return;
  const active = new Set(activeMessageIds);
  for (const messageId of Object.keys(cache.messages)) {
    if (!active.has(messageId)) delete cache.messages[messageId];
  }
}
