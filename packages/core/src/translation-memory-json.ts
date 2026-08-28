import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';
import { diagnosticMessage } from './diagnostics.js';
import {
  parseTranslationMemoryFile,
  type CacheMessage,
  type TranslationMemoryFile,
  type TranslationValue,
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

interface TranslationBucketEntry {
  id: string;
  source: string;
  sourceLang: string;
  comment?: string;
  value: TranslationValue;
}

interface TranslationBucketFile {
  version: 1;
  locale: string;
  entries: Record<string, TranslationBucketEntry>;
}

export class JsonTranslationMemoryStore {
  constructor(private readonly translationsDirectory: string) {}

  async load(): Promise<TranslationMemoryFile> {
    return withFileLock(this.translationsDirectory, async () => {
      await this.recover();
      return this.readCurrent();
    });
  }

  async transact(
    update: (memory: TranslationMemoryFile) => void | Promise<void>,
  ): Promise<TranslationMemoryFile> {
    await fs.mkdir(this.translationsDirectory, { recursive: true });
    return withFileLock(this.translationsDirectory, async () => {
      await this.recover();
      const current = await this.readCurrent();
      const draft = structuredClone(current);
      await update(draft);
      draft.version = 1;
      draft.revision = current.revision;
      parseTranslationMemoryFile(draft);
      if (stableJson(draft.messages) === stableJson(current.messages)) {
        return draft;
      }
      draft.revision = revisionFor(draft.messages);
      await writeFile(this.journalPath(), stableJson(draft), {
        encoding: 'utf8',
        chown: false,
        mode: false,
      });
      await this.commit(draft);
      return draft;
    });
  }

  async watchFiles(): Promise<string[]> {
    return listAtomicJsonFiles(this.translationsDirectory);
  }

  manages(file: string): boolean {
    const relative = path.relative(
      this.translationsDirectory,
      path.resolve(file),
    );
    return (
      relative !== '' &&
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..'
    );
  }

  close(): void {}

  private async readCurrent(): Promise<TranslationMemoryFile> {
    const messages: Record<string, CacheMessage> = {};
    for (const file of await listAtomicJsonFiles(this.translationsDirectory)) {
      const bucket = parseTranslationBucket(await readJson(file), file);
      const bucketName = path.basename(file, '.json');
      const expected = this.bucketPath(bucket.locale, bucketName);
      if (path.resolve(file) !== path.resolve(expected)) {
        throw invalidBucketFile(
          file,
          '翻译分桶路径与其 locale 不匹配',
          'translation bucket path does not match its locale',
        );
      }
      for (const [hash, entry] of Object.entries(bucket.entries)) {
        if (
          translationTargetHash({ ...entry, locale: bucket.locale }) !== hash ||
          hash.slice(0, 1) !== bucketName
        ) {
          throw invalidBucketFile(
            file,
            `条目“${hash}”位于错误的分桶中`,
            `entry "${hash}" is in the wrong bucket`,
          );
        }
        const current = messages[entry.id];
        if (
          current &&
          (current.source !== entry.source ||
            current.sourceLang !== entry.sourceLang ||
            current.comment !== entry.comment)
        ) {
          throw invalidBucketFile(
            file,
            `消息 ID“${entry.id}”的元数据冲突`,
            `message ID "${entry.id}" has conflicting metadata`,
          );
        }
        const message = (messages[entry.id] ??= {
          source: entry.source,
          sourceLang: entry.sourceLang,
          ...(entry.comment ? { comment: entry.comment } : {}),
          translations: {},
        });
        if (bucket.locale in message.translations) {
          throw invalidBucketFile(
            file,
            `消息“${entry.id}”存在重复的 locale“${bucket.locale}”`,
            `duplicate locale "${bucket.locale}" for message "${entry.id}"`,
          );
        }
        message.translations[bucket.locale] = entry.value;
      }
    }
    return parseTranslationMemoryFile({
      version: 1,
      revision: revisionFor(messages),
      messages,
    });
  }

  private async recover(): Promise<void> {
    const value = await readJson(this.journalPath());
    if (value !== undefined)
      await this.commit(parseTranslationMemoryFile(value));
  }

  private async commit(memory: TranslationMemoryFile): Promise<void> {
    const desired = new Map<string, TranslationBucketFile>();
    for (const [id, message] of Object.entries(memory.messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        const entry: TranslationBucketEntry = {
          id,
          source: message.source,
          sourceLang: message.sourceLang,
          ...(message.comment ? { comment: message.comment } : {}),
          value,
        };
        const hash = translationTargetHash({ ...entry, locale });
        const file = this.bucketPath(locale, hash.slice(0, 1));
        const bucket = desired.get(file) ?? {
          version: 1,
          locale,
          entries: {},
        };
        bucket.entries[hash] = entry;
        desired.set(file, bucket);
      }
    }
    await syncAtomicJsonFiles(this.translationsDirectory, desired);
  }

  private bucketPath(locale: string, bucket: string): string {
    return path.join(
      this.translationsDirectory,
      encodeURIComponent(locale),
      `${bucket}.json`,
    );
  }

  private journalPath(): string {
    return atomicJsonJournalPath(this.translationsDirectory);
  }
}

function translationTargetHash(
  entry: Pick<
    TranslationBucketEntry & { locale: string },
    'sourceLang' | 'source' | 'comment' | 'locale'
  >,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        entry.sourceLang,
        entry.source,
        entry.comment ?? null,
        entry.locale,
      ]),
    )
    .digest('hex');
}

function parseTranslationBucket(
  value: unknown,
  file: string,
): TranslationBucketFile {
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
    if (!/^[0-9a-f]{64}$/.test(hash) || !isRecord(entry)) {
      throw invalidBucketFile(
        file,
        `条目“${hash}”无效`,
        `invalid entry "${hash}"`,
      );
    }
    const entryKeys = new Set([
      'id',
      'source',
      'sourceLang',
      'comment',
      'value',
    ]);
    if (
      typeof entry.id !== 'string' ||
      typeof entry.source !== 'string' ||
      typeof entry.sourceLang !== 'string' ||
      (entry.comment !== undefined && typeof entry.comment !== 'string') ||
      (typeof entry.value !== 'string' && entry.value !== null) ||
      Object.keys(entry).some((key) => !entryKeys.has(key))
    ) {
      throw invalidBucketFile(
        file,
        `条目“${hash}”无效`,
        `invalid entry "${hash}"`,
      );
    }
  }
  return value as unknown as TranslationBucketFile;
}

function revisionFor(messages: Record<string, CacheMessage>): number {
  if (Object.keys(messages).length === 0) return 0;
  return Number.parseInt(
    createHash('sha256')
      .update(stableJson(messages))
      .digest('hex')
      .slice(0, 12),
    16,
  );
}

function invalidBucketFile(
  file: string,
  chineseReason: string,
  englishReason: string,
): Error {
  const relative = path.basename(file);
  return new Error(
    diagnosticMessage(
      `[ai-i18n] 翻译分桶“${relative}”无效：${chineseReason}。`,
      `[ai-i18n] Invalid translation bucket "${relative}": ${englishReason}.`,
    ),
  );
}
