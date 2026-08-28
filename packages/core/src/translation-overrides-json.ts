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

type OverrideBucketEntry = Omit<AtomicOverride, 'locale'>;

interface OverrideBucketFile {
  version: 1;
  locale: string;
  entries: Record<string, OverrideBucketEntry>;
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
    const bucket = parseOverrideBucket(await readJson(file), file);
    const bucketName = path.basename(file, '.json');
    const expected = bucketPath(directory, bucket.locale, bucketName);
    if (path.resolve(file) !== path.resolve(expected)) {
      throw invalidBucketFile(
        file,
        '人工覆盖分桶路径与其 locale 不匹配',
        'override bucket path does not match its locale',
      );
    }
    for (const [hash, bucketEntry] of Object.entries(bucket.entries)) {
      const entry: AtomicOverride = { ...bucketEntry, locale: bucket.locale };
      if (
        overrideTargetHash(entry) !== hash ||
        hash.slice(0, 1) !== bucketName
      ) {
        throw invalidBucketFile(
          file,
          `条目“${hash}”位于错误的分桶中`,
          `entry "${hash}" is in the wrong bucket`,
        );
      }
      const key = atomicOverrideKey(entry);
      if (entries.has(key)) {
        throw invalidBucketFile(
          file,
          '人工覆盖目标重复',
          'duplicate override target',
        );
      }
      entries.set(key, entry);
    }
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
  const desired = new Map<string, OverrideBucketFile>();
  for (const entry of atomicOverrides(overrides).values()) {
    const hash = overrideTargetHash(entry);
    const file = bucketPath(directory, entry.locale, hash.slice(0, 1));
    const bucket = desired.get(file) ?? {
      version: 1,
      locale: entry.locale,
      entries: {},
    };
    bucket.entries[hash] = {
      source: entry.source,
      ...(entry.comment ? { comment: entry.comment } : {}),
      ...(entry.file ? { file: entry.file } : {}),
      ...(entry.location ? { location: entry.location } : {}),
      value: entry.value,
    };
    desired.set(file, bucket);
  }
  await syncAtomicJsonFiles(directory, desired);
}

function bucketPath(directory: string, locale: string, bucket: string): string {
  return path.join(directory, encodeURIComponent(locale), `${bucket}.json`);
}

function overrideTargetHash(entry: AtomicOverride): string {
  return createHash('sha256').update(atomicOverrideKey(entry)).digest('hex');
}

function parseOverrideBucket(value: unknown, file: string): OverrideBucketFile {
  if (!isRecord(value)) {
    throw invalidBucketFile(file, '应为对象', 'expected an object');
  }
  const keys = new Set(['version', 'locale', 'entries']);
  if (
    value.version !== 1 ||
    typeof value.locale !== 'string' ||
    !isRecord(value.entries) ||
    Object.keys(value.entries).length === 0 ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    throw invalidBucketFile(file, '字段无效', 'invalid fields');
  }
  for (const [hash, entry] of Object.entries(value.entries)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw invalidBucketFile(
        file,
        `条目“${hash}”无效`,
        `invalid entry "${hash}"`,
      );
    }
    parseOverrideEntry(entry, value.locale, file, hash);
  }
  return value as unknown as OverrideBucketFile;
}

function parseOverrideEntry(
  value: unknown,
  locale: string,
  file: string,
  hash: string,
): OverrideBucketEntry {
  if (!isRecord(value)) {
    throw invalidBucketFile(
      file,
      `条目“${hash}”无效`,
      `invalid entry "${hash}"`,
    );
  }
  const keys = new Set(['source', 'comment', 'file', 'location', 'value']);
  if (
    typeof value.source !== 'string' ||
    (value.comment !== undefined && typeof value.comment !== 'string') ||
    (value.file !== undefined && typeof value.file !== 'string') ||
    typeof value.value !== 'string' ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    throw invalidBucketFile(
      file,
      `条目“${hash}”无效`,
      `invalid entry "${hash}"`,
    );
  }
  if (value.location !== undefined) {
    if (!isRecord(value.location)) {
      throw invalidBucketFile(
        file,
        'location 必须是对象',
        'location must be an object',
      );
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
      throw invalidBucketFile(file, 'location 无效', 'invalid location');
    }
    if (value.file === undefined) {
      throw invalidBucketFile(
        file,
        '出现位置作用范围必须提供文件',
        'occurrence scope requires a file',
      );
    }
  }
  const entry = value as unknown as OverrideBucketEntry;
  // 复用公开聚合 schema 校验 source path、comment 和作用范围。
  overridesFromAtomic([{ ...entry, locale }]);
  return entry;
}

function journalPath(directory: string): string {
  return atomicJsonJournalPath(directory);
}

function invalidBucketFile(
  file: string,
  chineseReason: string,
  englishReason: string,
): Error {
  const relative = path.basename(file);
  return new Error(
    diagnosticMessage(
      `[ai-i18n] 人工覆盖分桶“${relative}”无效：${chineseReason}。`,
      `[ai-i18n] Invalid override bucket "${relative}": ${englishReason}.`,
    ),
  );
}
