import type { ExtractedFile } from '@ai-i18n/core';
import { writeFile } from 'atomically';
import { listJsonFiles, readJson, readText, stableJson } from './json-files.js';
import type { ProjectSnapshot } from './project-state.js';

export async function readGeneratedJsonFiles<T>(
  directory: string,
  kind: string,
  parse: (value: unknown) => T,
  onWarning?: (message: string) => void,
): Promise<T[]> {
  const values: T[] = [];
  for (const file of await listJsonFiles(directory)) {
    const value = await readJson(file);
    if (value !== undefined) values.push(parse(value));
    else
      onWarning?.(
        `generated ${kind} file disappeared while reading; skipped "${file}"`,
      );
  }
  return values;
}

export async function writeProtocolJson(
  file: string,
  value: unknown,
): Promise<string | undefined> {
  const content = stableJson(value);
  try {
    if ((await readText(file)) === content) return undefined;
    await writeFile(file, content, {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[ai-i18n] failed to write protocol file "${file}": ${message}`,
      { cause: error },
    );
  }
}

export function warnExtractedMismatches(
  diskFiles: readonly ExtractedFile[],
  snapshot: ProjectSnapshot,
  preferredSources: readonly string[] = [],
  onWarning?: (message: string) => void,
): void {
  const preferred = new Set(preferredSources);
  for (const diskFile of diskFiles) {
    const current = snapshot.extracted[diskFile.source];
    if (!current || !preferred.has(diskFile.source)) continue;
    const diskIds = diskFile.messages.map((message) => message.id).sort();
    const currentIds = current.messages.map((message) => message.id).sort();
    if (diskIds.join('\0') === currentIds.join('\0')) continue;
    onWarning?.(
      `extracted file "${diskFile.source}" has stale message structure; source analysis was kept, reload the generated file before editing`,
    );
  }
}
