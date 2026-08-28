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

interface AtomicTranslationFile {
  version: 1;
  id: string;
  source: string;
  sourceLang: string;
  comment?: string;
  locale: string;
  value: TranslationValue;
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
      const entry = parseAtomicTranslation(await readJson(file), file);
      const expected = this.targetPath(entry);
      if (path.resolve(file) !== path.resolve(expected)) {
        throw invalidAtomicFile(
          file,
          'translation shard path does not match its identity',
        );
      }
      const current = messages[entry.id];
      if (
        current &&
        (current.source !== entry.source ||
          current.sourceLang !== entry.sourceLang ||
          current.comment !== entry.comment)
      ) {
        throw invalidAtomicFile(
          file,
          `message ID "${entry.id}" has conflicting metadata`,
        );
      }
      const message = (messages[entry.id] ??= {
        source: entry.source,
        sourceLang: entry.sourceLang,
        ...(entry.comment ? { comment: entry.comment } : {}),
        translations: {},
      });
      if (entry.locale in message.translations) {
        throw invalidAtomicFile(
          file,
          `duplicate locale "${entry.locale}" for message "${entry.id}"`,
        );
      }
      message.translations[entry.locale] = entry.value;
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
    const desired = new Map<string, AtomicTranslationFile>();
    for (const [id, message] of Object.entries(memory.messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        const entry: AtomicTranslationFile = {
          version: 1,
          id,
          source: message.source,
          sourceLang: message.sourceLang,
          ...(message.comment ? { comment: message.comment } : {}),
          locale,
          value,
        };
        desired.set(this.targetPath(entry), entry);
      }
    }
    await syncAtomicJsonFiles(this.translationsDirectory, desired);
  }

  private targetPath(entry: AtomicTranslationFile): string {
    const hash = translationTargetHash(entry);
    return path.join(
      this.translationsDirectory,
      encodeURIComponent(entry.locale),
      hash.slice(0, 2),
      `${hash}.json`,
    );
  }

  private journalPath(): string {
    return atomicJsonJournalPath(this.translationsDirectory);
  }
}

function translationTargetHash(
  entry: Pick<
    AtomicTranslationFile,
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

function parseAtomicTranslation(
  value: unknown,
  file: string,
): AtomicTranslationFile {
  if (!isRecord(value)) throw invalidAtomicFile(file, 'expected an object');
  const keys = new Set([
    'version',
    'id',
    'source',
    'sourceLang',
    'comment',
    'locale',
    'value',
  ]);
  if (
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.sourceLang !== 'string' ||
    (value.comment !== undefined && typeof value.comment !== 'string') ||
    typeof value.locale !== 'string' ||
    (typeof value.value !== 'string' && value.value !== null) ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    throw invalidAtomicFile(file, 'invalid fields');
  }
  return value as unknown as AtomicTranslationFile;
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

function invalidAtomicFile(file: string, reason: string): Error {
  const relative = path.basename(file);
  return new Error(
    diagnosticMessage(
      `[ai-i18n] 原子翻译分片“${relative}”无效：${reason}。`,
      `[ai-i18n] Invalid atomic translation shard "${relative}": ${reason}.`,
    ),
  );
}
