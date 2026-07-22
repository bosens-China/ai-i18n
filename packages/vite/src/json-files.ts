import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJson(file: string): Promise<unknown | undefined> {
  const content = await readText(file);
  if (content === undefined) return undefined;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`[ai-i18n] invalid JSON file "${file}"`);
  }
}

export async function readJsonRequired(file: string): Promise<unknown> {
  const value = await readJson(file);
  if (value === undefined) throw new Error(`[ai-i18n] file disappeared "${file}"`);
  return value;
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
    const files = await Promise.all(
      entries.map((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory()
          ? listJsonFiles(file)
          : Promise.resolve(entry.name.endsWith('.json') ? [file] : []);
      }),
    );
    return files.flat().sort();
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

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortValue(entry)]),
  );
}
