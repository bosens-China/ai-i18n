import path from 'node:path';
import type { CacheMessage, TranslationMemoryFile } from '@ai-i18n/core';
import {
  type TranslationMemoryCandidate,
  type TranslationMemoryCandidateCache,
  type TranslationMemoryCandidateTarget,
  openTranslationMemoryStore,
  type TranslationMemoryStore,
} from '@ai-i18n/core/translation-memory';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { enforceCacheCapacity } from './cache-capacity.js';
import { removeOrphanMessages } from './file-store-cleanup.js';
import {
  mergeProjectMessages,
  translationFieldKey,
  type PendingProviderTranslation,
} from './file-store-merge.js';
import type { FileStoreOptions } from './file-store-types.js';
import type { ProjectSnapshot } from './project-snapshot.js';
import type { ProviderResult } from './provider-coordinator.js';

export class FileStoreMemory {
  private readonly providerFields = new Map<
    string,
    PendingProviderTranslation
  >();
  private store: Promise<TranslationMemoryStore> | undefined;
  private candidateCache:
    Promise<TranslationMemoryCandidateCache | undefined> | undefined;

  constructor(
    private readonly directory: string,
    private readonly options: FileStoreOptions,
    private readonly updateManagedFiles: (files: readonly string[]) => void,
  ) {}

  markProviderTranslations(
    results: readonly ProviderResult[],
    baseline: TranslationMemoryFile,
  ): void {
    for (const result of results) {
      if (result.value !== null) {
        this.providerFields.set(
          translationFieldKey(result.messageId, result.locale),
          {
            baseline:
              baseline.messages[result.messageId]?.translations?.[
                result.locale
              ] ?? null,
            value: result.value,
          },
        );
      }
    }
  }

  async update(
    snapshot?: ProjectSnapshot,
    activeMessageIds?: readonly string[],
  ): Promise<TranslationMemoryFile> {
    const store = await this.getStore();
    const cache = await this.getCandidateCache();
    const pendingProvider = new Map<string, PendingProviderTranslation>();
    for (const [id, message] of Object.entries(
      snapshot?.cache.messages ?? {},
    )) {
      for (const [locale, value] of Object.entries(message.translations)) {
        const key = translationFieldKey(id, locale);
        const pending = this.providerFields.get(key);
        if (pending?.value === value) pendingProvider.set(key, pending);
      }
    }
    const persistent = await store.transact(async (memory) => {
      if (snapshot) {
        memory.messages = mergeProjectMessages(
          memory.messages,
          snapshot.cache.messages,
          pendingProvider,
        );
      }
      this.ensureCurrentLocales(memory.messages);
      if (cache) await this.fillFromCandidateCache(cache, memory.messages);
      if (activeMessageIds) {
        removeOrphanMessages(
          memory,
          activeMessageIds,
          Boolean(this.options.cleanupOrphanMessages),
        );
        enforceCacheCapacity(
          memory,
          activeMessageIds,
          this.options.capacity,
          this.options.onWarning,
        );
      }
    });
    // 仅在事务成功后消费本快照的写入意图；失败可重试，后续外部编辑不再被旧结果覆盖。
    for (const [key, pending] of pendingProvider) {
      if (this.providerFields.get(key) === pending)
        this.providerFields.delete(key);
    }
    this.updateManagedFiles(
      (await store.watchFiles()).map((file) => path.resolve(file)),
    );
    if (cache) await this.rememberCandidates(cache, persistent.messages);
    return persistent;
  }

  async close(): Promise<void> {
    await this.store?.then(
      (store) => store.close(),
      () => undefined,
    );
    await this.candidateCache?.then(
      (cache) => cache?.close(),
      () => undefined,
    );
  }

  private getStore(): Promise<TranslationMemoryStore> {
    return (this.store ??= openTranslationMemoryStore(this.directory));
  }

  private getCandidateCache(): Promise<
    TranslationMemoryCandidateCache | undefined
  > {
    return (this.candidateCache ??= this.openCandidateCache());
  }

  private async openCandidateCache(): Promise<
    TranslationMemoryCandidateCache | undefined
  > {
    const adapter = this.options.translationMemory?.cache;
    if (!adapter) return undefined;
    try {
      return await adapter.open();
    } catch (cause) {
      this.warnCandidateCache(cause);
      return undefined;
    }
  }

  private async fillFromCandidateCache(
    cache: TranslationMemoryCandidateCache,
    messages: Record<string, CacheMessage>,
  ): Promise<void> {
    const targets: Array<{
      translations: CacheMessage['translations'];
      locale: string;
      query: TranslationMemoryCandidateTarget;
    }> = [];
    for (const message of Object.values(messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        if (value !== null) continue;
        targets.push({
          translations: message.translations,
          locale,
          query: candidateTarget(message, locale),
        });
      }
    }
    if (!targets.length) return;
    try {
      const values = await cache.findUnique(
        targets.map((target) => target.query),
      );
      for (const [index, value] of values.entries()) {
        const target = targets[index];
        if (target && value !== undefined) {
          target.translations[target.locale] = value;
        }
      }
    } catch (cause) {
      this.warnCandidateCache(cause);
    }
  }

  private async rememberCandidates(
    cache: TranslationMemoryCandidateCache,
    messages: Record<string, CacheMessage>,
  ): Promise<void> {
    const candidates: TranslationMemoryCandidate[] = [];
    for (const message of Object.values(messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        if (value !== null) {
          candidates.push({ ...candidateTarget(message, locale), value });
        }
      }
    }
    if (!candidates.length) return;
    try {
      // 项目 JSON 已提交后再回填；缓存失败不能回滚项目事实。
      await cache.remember(candidates);
    } catch (cause) {
      this.warnCandidateCache(cause);
    }
  }

  private warnCandidateCache(cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : String(cause);
    this.options.onWarning?.(
      diagnosticMessage(
        `[ai-i18n] 个人 Translation Memory 缓存不可用，将继续使用项目 JSON。原因：${reason}`,
        `[ai-i18n] Personal Translation Memory cache is unavailable; continuing with project JSON. Cause: ${reason}`,
      ),
    );
  }

  private ensureCurrentLocales(messages: Record<string, CacheMessage>): void {
    const targetLocales = this.options.locales.filter(
      (locale) => locale.value !== this.options.sourceLang,
    );
    for (const message of Object.values(messages)) {
      for (const locale of targetLocales) {
        if (locale.value === message.sourceLang) continue;
        if (!(locale.value in message.translations)) {
          message.translations[locale.value] = null;
        }
      }
    }
  }
}

function candidateTarget(
  message: CacheMessage,
  targetLang: string,
): TranslationMemoryCandidateTarget {
  return {
    sourceLang: message.sourceLang,
    targetLang,
    source: message.source,
    ...(message.comment ? { comment: message.comment } : {}),
  };
}
