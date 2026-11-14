import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ExtractedFile } from '@ai-i18n/core';
import { fileId, repositoryPath } from './repository-paths.js';

interface Chunk {
  type: 'chunk' | 'asset';
  fileName: string;
  modules?: Readonly<Record<string, unknown>>;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function buildFileGroups(
  root: string,
  files: readonly ExtractedFile[],
  bundle: Readonly<Record<string, Chunk>>,
): Record<string, string> {
  const chunks = new Map<string, string>();
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk') continue;
    const group = shortHash(item.fileName);
    for (const moduleId of Object.keys(item.modules ?? {})) {
      if (moduleId.startsWith('\0')) continue;
      const file = path.resolve(moduleId.split('?')[0]!);
      chunks.set(file, group);
    }
  }
  return Object.fromEntries(
    files.map((file) => {
      const absolute = path.resolve(root, file.source);
      const group =
        chunks.get(absolute) ??
        shortHash(path.dirname(repositoryPath(root, absolute)));
      return [fileId(root, absolute), group];
    }),
  );
}
