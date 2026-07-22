import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolveI18nDirectory(
  workspaceRoot: string,
  input: string,
): Promise<string> {
  if (path.isAbsolute(input) || path.win32.isAbsolute(input)) {
    throw new Error('[ai-i18n/mcp] i18n_directory must be relative to workspace root');
  }
  if (input.split(/[\\/]+/).includes('..')) {
    throw new Error('[ai-i18n/mcp] i18n_directory must not contain ".."');
  }
  const root = await fs.realpath(workspaceRoot);
  const candidate = path.resolve(root, input);
  assertInside(root, candidate);
  let directory: string;
  try {
    directory = await fs.realpath(candidate);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        '[ai-i18n/mcp] i18n directory not found; read the Vite config and pass its final workspace-relative path',
      );
    }
    throw error;
  }
  assertInside(root, directory);
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) {
    throw new Error('[ai-i18n/mcp] i18n_directory is not a directory');
  }
  return directory;
}

export async function readJsonRequired(file: string): Promise<unknown> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `[ai-i18n/mcp] required ai-i18n file is missing: ${path.basename(file)}`,
      );
    }
    throw error;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`[ai-i18n/mcp] invalid JSON file: ${path.basename(file)}`);
  }
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJsonFiles(file);
      return entry.isFile() && entry.name.endsWith('.json') ? [file] : [];
    }),
  );
  return nested.flat().sort();
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, stableJson(value), 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
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

function assertInside(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('[ai-i18n/mcp] i18n_directory escapes workspace root');
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
