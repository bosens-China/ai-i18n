import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { writeFile } from 'atomically';

const JOURNAL = '.transaction.json';
const { waitForLock, unlock } = createRequire(import.meta.url)(
  'fs-native-extensions',
) as {
  waitForLock(fd: number): Promise<void>;
  unlock(fd: number): void;
};

export async function withFileLock<T>(
  file: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockDirectory = path.join(os.tmpdir(), 'ai-i18n-locks');
  await fs.mkdir(lockDirectory, { recursive: true });
  const key =
    process.platform === 'win32' ? file.toLocaleLowerCase('en-US') : file;
  const lockFile = path.join(
    lockDirectory,
    `${createHash('sha256').update(key).digest('hex')}.lock`,
  );
  const handle = await fs.open(lockFile, 'a+');
  let locked = false;
  try {
    // 锁稳定的旁路文件；原子替换协议文件时锁身份不会变化。
    await waitForLock(handle.fd);
    locked = true;
    return await task();
  } finally {
    try {
      if (locked) unlock(handle.fd);
    } finally {
      await handle.close();
    }
  }
}

export async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function atomicJsonJournalPath(directory: string): string {
  return path.join(directory, JOURNAL);
}

export async function listAtomicJsonFiles(
  directory: string,
): Promise<string[]> {
  const files: string[] = [];
  await visit(directory, files);
  return files.sort();
}

export async function syncAtomicJsonFiles(
  directory: string,
  desired: ReadonlyMap<string, unknown>,
): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const existing = await listAtomicJsonFiles(directory);
  for (const [file, entry] of desired) {
    const serialized = stableJson(entry);
    const current = await readJson(file);
    if (current !== undefined && stableJson(current) === serialized) continue;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serialized, {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
  }
  const keep = new Set([...desired.keys()].map((file) => path.resolve(file)));
  for (const file of existing) {
    if (!keep.has(path.resolve(file))) await fs.rm(file, { force: true });
  }
  await fs.rm(atomicJsonJournalPath(directory), { force: true });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function visit(directory: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file, files);
    else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      entry.name !== JOURNAL
    ) {
      files.push(file);
    }
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  // 使用固定码元顺序，避免生成文件随系统 locale 改变。
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortValue(entry)]),
  );
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
