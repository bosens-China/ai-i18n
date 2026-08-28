import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';
import { diagnosticMessage } from './diagnostics.js';
import {
  atomicOverrideKey,
  atomicOverrides,
  overridesFromAtomic,
  type AtomicOverride,
} from './override-rules.js';
import {
  parseTranslationOverridesFile,
  type TranslationOverridesFile,
} from './schema.js';
import {
  atomicJsonJournalPath,
  isRecord,
  listAtomicJsonFiles,
  readJson,
  stableJson,
  syncAtomicJsonFiles,
  withFileLock,
} from './translation-memory-files.js';

interface AtomicOverrideFile extends AtomicOverride {
  version: 1;
}

export async function readAtomicTranslationOverrides(
  directory: string,
): Promise<TranslationOverridesFile> {
  return withFileLock(directory, async () => {
    await recover(directory);
    return readCurrent(directory);
  });
}

export async function transactAtomicTranslationOverrides(
  directory: string,
  update: (overrides: TranslationOverridesFile) => void | Promise<void>,
): Promise<TranslationOverridesFile> {
  await fs.mkdir(directory, { recursive: true });
  return withFileLock(directory, async () => {
    await recover(directory);
    const current = await readCurrent(directory);
    const draft = structuredClone(current);
    await update(draft);
    const normalized = parseTranslationOverridesFile(draft);
    if (stableJson(normalized) === stableJson(current)) return normalized;
    await writeFile(journalPath(directory), stableJson(normalized), {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
    await commit(directory, normalized);
    return normalized;
  });
}

export async function translationOverrideFiles(
  directory: string,
): Promise<string[]> {
  return listAtomicJsonFiles(directory);
}

async function readCurrent(
  directory: string,
): Promise<TranslationOverridesFile> {
  const entries = new Map<string, AtomicOverride>();
  for (const file of await translationOverrideFiles(directory)) {
    const entry = parseAtomicOverride(await readJson(file), file);
    const expected = targetPath(directory, entry);
    if (path.resolve(file) !== path.resolve(expected)) {
      throw invalidAtomicFile(
        file,
        'override shard path does not match its identity',
      );
    }
    const key = atomicOverrideKey(entry);
    if (entries.has(key)) {
      throw invalidAtomicFile(file, 'duplicate override target');
    }
    entries.set(key, entry);
  }
  return overridesFromAtomic(entries.values());
}

async function recover(directory: string): Promise<void> {
  const value = await readJson(journalPath(directory));
  if (value !== undefined) {
    await commit(directory, parseTranslationOverridesFile(value));
  }
}

async function commit(
  directory: string,
  overrides: TranslationOverridesFile,
): Promise<void> {
  const desired = new Map<string, AtomicOverrideFile>();
  for (const entry of atomicOverrides(overrides).values()) {
    const value: AtomicOverrideFile = { version: 1, ...entry };
    desired.set(targetPath(directory, value), value);
  }
  await syncAtomicJsonFiles(directory, desired);
}

function targetPath(
  directory: string,
  entry: Pick<AtomicOverride, keyof AtomicOverride>,
): string {
  const hash = createHash('sha256')
    .update(atomicOverrideKey(entry))
    .digest('hex');
  return path.join(
    directory,
    encodeURIComponent(entry.locale),
    hash.slice(0, 2),
    `${hash}.json`,
  );
}

function parseAtomicOverride(value: unknown, file: string): AtomicOverrideFile {
  if (!isRecord(value)) throw invalidAtomicFile(file, 'expected an object');
  const keys = new Set([
    'version',
    'source',
    'comment',
    'file',
    'location',
    'locale',
    'value',
  ]);
  if (
    value.version !== 1 ||
    typeof value.source !== 'string' ||
    (value.comment !== undefined && typeof value.comment !== 'string') ||
    (value.file !== undefined && typeof value.file !== 'string') ||
    typeof value.locale !== 'string' ||
    typeof value.value !== 'string' ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    throw invalidAtomicFile(file, 'invalid fields');
  }
  if (value.location !== undefined) {
    if (!isRecord(value.location)) {
      throw invalidAtomicFile(file, 'location must be an object');
    }
    if (
      !Number.isInteger(value.location.line) ||
      (value.location.line as number) < 1 ||
      !Number.isInteger(value.location.column) ||
      (value.location.column as number) < 0 ||
      Object.keys(value.location).some(
        (key) => key !== 'line' && key !== 'column',
      )
    ) {
      throw invalidAtomicFile(file, 'invalid location');
    }
    if (value.file === undefined) {
      throw invalidAtomicFile(file, 'occurrence scope requires a file');
    }
  }
  const entry = value as unknown as AtomicOverrideFile;
  // 复用公开聚合 schema 校验 source path、comment 和作用范围。
  overridesFromAtomic([entry]);
  return entry;
}

function journalPath(directory: string): string {
  return atomicJsonJournalPath(directory);
}

function invalidAtomicFile(file: string, reason: string): Error {
  const relative = path.basename(file);
  return new Error(
    diagnosticMessage(
      `[ai-i18n] 原子人工覆盖分片“${relative}”无效：${reason}。`,
      `[ai-i18n] Invalid atomic override shard "${relative}": ${reason}.`,
    ),
  );
}
