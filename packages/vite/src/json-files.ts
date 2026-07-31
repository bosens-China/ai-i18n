import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { stableJson } from '@ai-i18n/core/translation-memory';

export { stableJson };

export async function readJson(file: string): Promise<unknown | undefined> {
  const content = await readText(file);
  if (content === undefined) return undefined;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] JSON 文件“${file}”无效。`,
        `[ai-i18n] Invalid JSON file "${file}".`,
      ),
    );
  }
}

export async function readText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
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
