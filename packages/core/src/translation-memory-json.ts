import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';
import { diagnosticMessage } from './diagnostics.js';
import {
  parseTranslationMemoryFile,
  type CacheMessage,
  type TranslationMemoryFile,
} from './schema.js';
import {
  legacyTranslationMemoryPath,
  projectKey,
} from './translation-memory-paths.js';
import type { TranslationMemoryStore } from './translation-memory-store-types.js';
import { readJson, stableJson, withFileLock } from './translation-memory.js';

interface ShardManifest {
  version: 1;
  revision: number;
  prefixLength: 2;
  shards: string[];
}

interface ShardFile {
  version: 1;
  messages: Record<string, CacheMessage>;
}

const MANIFEST = 'manifest.json';
const JOURNAL = '.transaction.json';

export class JsonTranslationMemoryStore implements TranslationMemoryStore {
  readonly storage = 'json' as const;
  readonly projectKey: string;

  constructor(
    readonly directory: string,
    private readonly translationsDirectory: string,
  ) {
    this.projectKey = projectKey(directory);
  }

  async load(): Promise<TranslationMemoryFile> {
    return withFileLock(this.translationsDirectory, async () => {
      await this.recover();
      const current = await this.readCurrent();
      // TODO(stable-release): 首个非 prerelease 稳定版本发布前，删除单文件
      // translations.json 的读取、自动迁移、旧路径、测试与文档。
      if (await exists(legacyTranslationMemoryPath(this.directory))) {
        await this.commit(current);
      }
      return current;
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
      if (stableJson(draft) === stableJson(current)) return draft;
      draft.revision += 1;
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
    const manifest = await this.readManifest();
    return [
      this.manifestPath(),
      ...(manifest?.shards ?? []).map((shard) => this.shardPath(shard)),
    ];
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

  async removeProjectData(): Promise<void> {
    await fs.rm(this.translationsDirectory, { recursive: true, force: true });
    await fs.rm(legacyTranslationMemoryPath(this.directory), { force: true });
  }

  close(): void {}

  private async readCurrent(): Promise<TranslationMemoryFile> {
    const journal = await readJson(this.journalPath());
    if (journal !== undefined) return parseTranslationMemoryFile(journal);
    const manifest = await this.readManifest();
    if (!manifest) {
      const legacy = await readJson(
        legacyTranslationMemoryPath(this.directory),
      );
      return legacy === undefined
        ? emptyMemory()
        : parseTranslationMemoryFile(legacy);
    }
    const messages: Record<string, CacheMessage> = {};
    for (const shard of manifest.shards) {
      const value = await readJson(this.shardPath(shard));
      const parsed = parseShard(value, shard);
      for (const [messageId, message] of Object.entries(parsed.messages)) {
        if (messages[messageId]) {
          throw new Error(
            diagnosticMessage(
              `[ai-i18n] JSON 翻译分片中存在重复消息 ID“${messageId}”。`,
              `[ai-i18n] Duplicate message ID "${messageId}" in JSON translation shards.`,
            ),
          );
        }
        messages[messageId] = message;
      }
    }
    return parseTranslationMemoryFile({
      version: 1,
      revision: manifest.revision,
      messages,
    });
  }

  private async recover(): Promise<void> {
    const value = await readJson(this.journalPath());
    if (value !== undefined)
      await this.commit(parseTranslationMemoryFile(value));
  }

  private async commit(memory: TranslationMemoryFile): Promise<void> {
    await fs.mkdir(this.translationsDirectory, { recursive: true });
    const grouped = new Map<string, Record<string, CacheMessage>>();
    for (const [messageId, message] of Object.entries(memory.messages)) {
      const shard = shardName(messageId);
      const messages = grouped.get(shard) ?? {};
      messages[messageId] = message;
      grouped.set(shard, messages);
    }
    const shards = [...grouped.keys()].sort();
    for (const shard of shards) {
      const value: ShardFile = { version: 1, messages: grouped.get(shard)! };
      await writeFile(this.shardPath(shard), stableJson(value), {
        encoding: 'utf8',
        chown: false,
        mode: false,
      });
    }
    const previous = await this.readManifest();
    const stale = (previous?.shards ?? []).filter(
      (shard) => !grouped.has(shard),
    );
    for (const shard of stale)
      await fs.rm(this.shardPath(shard), { force: true });
    const manifest: ShardManifest = {
      version: 1,
      revision: memory.revision,
      prefixLength: 2,
      shards,
    };
    await writeFile(this.manifestPath(), stableJson(manifest), {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
    await fs.rm(legacyTranslationMemoryPath(this.directory), { force: true });
    await fs.rm(this.journalPath(), { force: true });
  }

  private async readManifest(): Promise<ShardManifest | undefined> {
    const value = await readJson(this.manifestPath());
    if (value === undefined) return undefined;
    if (!isRecord(value)) throw invalidManifest();
    if (
      value.version !== 1 ||
      value.prefixLength !== 2 ||
      !Number.isInteger(value.revision) ||
      (value.revision as number) < 0 ||
      !Array.isArray(value.shards) ||
      value.shards.some(
        (entry) => typeof entry !== 'string' || !/^[0-9a-f]{2}$/.test(entry),
      )
    ) {
      throw invalidManifest();
    }
    const shards = [...new Set(value.shards as string[])].sort();
    if (shards.length !== value.shards.length) throw invalidManifest();
    return {
      version: 1,
      revision: value.revision as number,
      prefixLength: 2,
      shards,
    };
  }

  private manifestPath(): string {
    return path.join(this.translationsDirectory, MANIFEST);
  }

  private journalPath(): string {
    return path.join(this.translationsDirectory, JOURNAL);
  }

  private shardPath(shard: string): string {
    return path.join(this.translationsDirectory, `${shard}.json`);
  }
}

function shardName(messageId: string): string {
  return createHash('sha256').update(messageId).digest('hex').slice(0, 2);
}

function parseShard(value: unknown, shard: string): ShardFile {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.messages)) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 翻译分片“${shard}.json”无效。`,
        `[ai-i18n] Invalid translation shard "${shard}.json".`,
      ),
    );
  }
  const memory = parseTranslationMemoryFile({
    version: 1,
    revision: 0,
    messages: value.messages,
  });
  for (const messageId of Object.keys(memory.messages)) {
    if (shardName(messageId) !== shard) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 消息“${messageId}”存放在错误的翻译分片中。`,
          `[ai-i18n] Message "${messageId}" is stored in the wrong translation shard.`,
        ),
      );
    }
  }
  return { version: 1, messages: memory.messages };
}

function emptyMemory(): TranslationMemoryFile {
  return { version: 1, revision: 0, messages: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidManifest(): Error {
  return new Error(
    diagnosticMessage(
      '[ai-i18n] 翻译分片清单无效。',
      '[ai-i18n] Invalid translation shard manifest.',
    ),
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
