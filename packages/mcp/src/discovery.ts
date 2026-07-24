import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCacheFile } from '@ai-i18n/core';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
]);

export interface DiscoveredI18nDirectory {
  i18n_directory: string;
  workspace_root: string;
}

export async function discoverI18nDirectories(
  workspaceRoots: readonly string[],
): Promise<DiscoveredI18nDirectory[]> {
  const found = new Map<string, DiscoveredI18nDirectory>();
  for (const input of workspaceRoots) {
    const root = await resolveDirectory(input);
    await walk(root, root, found);
  }
  return [...found.values()].sort((left, right) =>
    left.i18n_directory.localeCompare(right.i18n_directory),
  );
}

async function walk(
  directory: string,
  workspaceRoot: string,
  found: Map<string, DiscoveredI18nDirectory>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  const names = new Set(entries.map((entry) => entry.name));
  if (await isProtocolDirectory(directory, names)) {
    found.set(directory, {
      i18n_directory: directory,
      workspace_root: workspaceRoot,
    });
    return;
  }
  await Promise.all(
    entries
      .filter(
        (entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name),
      )
      .map((entry) =>
        walk(path.join(directory, entry.name), workspaceRoot, found),
      ),
  );
}

async function isProtocolDirectory(
  directory: string,
  entries: ReadonlySet<string>,
): Promise<boolean> {
  if (!entries.has('cache.json') || !entries.has('extracted')) return false;
  try {
    const extracted = await fs.stat(path.join(directory, 'extracted'));
    parseCacheFile(
      JSON.parse(await fs.readFile(path.join(directory, 'cache.json'), 'utf8')),
    );
    return extracted.isDirectory();
  } catch {
    return false;
  }
}

async function resolveDirectory(directory: string): Promise<string> {
  const resolved = await fs.realpath(path.resolve(directory));
  if (!(await fs.stat(resolved)).isDirectory()) {
    throw new Error(
      `[ai-i18n/mcp] workspace root is not a directory: ${directory}`,
    );
  }
  return resolved;
}
