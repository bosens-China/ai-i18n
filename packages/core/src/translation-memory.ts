import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { writeFile } from 'atomically';
import {
  parseTranslationOverridesFile,
  parseTranslationMemoryFile,
  type TranslationOverridesFile,
  type TranslationMemoryFile,
} from './schema.js';

const { waitForLock, unlock } = createRequire(import.meta.url)(
  'fs-native-extensions',
) as {
  waitForLock(fd: number): Promise<void>;
  unlock(fd: number): void;
};

export async function readTranslationMemory(
  file: string,
): Promise<TranslationMemoryFile> {
  return readDocument(
    file,
    () => ({ version: 1, revision: 0, messages: {} }),
    parseTranslationMemoryFile,
  );
}

export async function transactTranslationMemory(
  file: string,
  update: (memory: TranslationMemoryFile) => void | Promise<void>,
): Promise<TranslationMemoryFile> {
  return transactDocument(
    file,
    () => ({ version: 1, revision: 0, messages: {} }),
    parseTranslationMemoryFile,
    update,
    {
      beforeCompare(draft, current) {
        draft.version = 1;
        draft.revision = current.revision;
      },
      beforeWrite(draft) {
        draft.revision += 1;
      },
    },
  );
}

export async function readTranslationOverrides(
  file: string,
): Promise<TranslationOverridesFile> {
  return readDocument(
    file,
    () => ({ version: 1, messages: {} }),
    parseTranslationOverridesFile,
  );
}

export async function transactTranslationOverrides(
  file: string,
  update: (overrides: TranslationOverridesFile) => void | Promise<void>,
): Promise<TranslationOverridesFile> {
  return transactDocument(
    file,
    () => ({ version: 1, messages: {} }),
    parseTranslationOverridesFile,
    update,
  );
}

async function readDocument<T>(
  file: string,
  create: () => T,
  parse: (value: unknown) => T,
): Promise<T> {
  const value = await readJson(file);
  return value === undefined ? create() : parse(value);
}

async function transactDocument<T>(
  file: string,
  create: () => T,
  parse: (value: unknown) => T,
  update: (draft: T) => void | Promise<void>,
  hooks: {
    beforeCompare?(draft: T, current: T): void;
    beforeWrite?(draft: T, current: T): void;
  } = {},
): Promise<T> {
  const resolved = path.resolve(file);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return withFileLock(resolved, async () => {
    const target = await readJson(resolved);
    const current = target === undefined ? create() : parse(target);
    const draft = structuredClone(current);
    await update(draft);
    hooks.beforeCompare?.(draft, current);
    parse(draft);

    const changed =
      target === undefined || stableJson(draft) !== stableJson(current);
    if (changed) {
      hooks.beforeWrite?.(draft, current);
      parse(draft);
      await writeFile(resolved, stableJson(draft), {
        encoding: 'utf8',
        chown: false,
        mode: false,
      });
    }
    return draft;
  });
}

async function withFileLock<T>(
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
    // 锁稳定的旁路文件；原子替换 translations.json 时锁身份不会变化。
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

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
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
