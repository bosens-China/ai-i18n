import { Buffer } from 'node:buffer';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { AiI18nTranslationMemoryCapacityOptions } from './options.js';
import { stableJson } from './json-files.js';

interface CacheUsage {
  messages: number;
  bytes?: number;
  fits: boolean;
}

export function enforceCacheCapacity(
  cache: TranslationMemoryFile,
  activeMessageIds: Iterable<string>,
  options: AiI18nTranslationMemoryCapacityOptions | undefined,
  onWarning?: (message: string) => void,
): void {
  if (!options?.maxMessages && !options?.maxBytes) return;
  if (cacheUsage(cache, options).fits) return;

  const active = new Set(activeMessageIds);
  const candidates = Object.keys(cache.messages)
    .filter((messageId) => !active.has(messageId))
    .sort();

  // 删除候选前缀后容量单调下降，二分可避免对大 cache 逐条重复序列化。
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = withoutMessages(cache, candidates, middle);
    if (cacheUsage(candidate, options).fits) high = middle;
    else low = middle + 1;
  }

  cache.messages = withoutMessages(cache, candidates, low).messages;
  const usage = cacheUsage(cache, options);
  if (!usage.fits) onWarning?.(capacityWarning(usage, options));
}

function withoutMessages(
  cache: TranslationMemoryFile,
  candidates: readonly string[],
  count: number,
): TranslationMemoryFile {
  const removed = new Set(candidates.slice(0, count));
  return {
    ...cache,
    messages: Object.fromEntries(
      Object.entries(cache.messages).filter(
        ([messageId]) => !removed.has(messageId),
      ),
    ),
  };
}

function cacheUsage(
  cache: TranslationMemoryFile,
  options: AiI18nTranslationMemoryCapacityOptions,
): CacheUsage {
  const messages = Object.keys(cache.messages).length;
  const bytes =
    options.maxBytes === undefined
      ? undefined
      : Buffer.byteLength(stableJson(cache), 'utf8');
  return {
    messages,
    ...(bytes === undefined ? {} : { bytes }),
    fits:
      (options.maxMessages === undefined || messages <= options.maxMessages) &&
      (options.maxBytes === undefined || bytes! <= options.maxBytes),
  };
}

function capacityWarning(
  usage: CacheUsage,
  options: AiI18nTranslationMemoryCapacityOptions,
): string {
  const englishLimits = [
    options.maxMessages === undefined
      ? undefined
      : `${usage.messages}/${options.maxMessages} messages`,
    options.maxBytes === undefined
      ? undefined
      : `${usage.bytes}/${options.maxBytes} bytes`,
  ]
    .filter(Boolean)
    .join(', ');
  const chineseLimits = [
    options.maxMessages === undefined
      ? undefined
      : `${usage.messages}/${options.maxMessages} 条消息`,
    options.maxBytes === undefined
      ? undefined
      : `${usage.bytes}/${options.maxBytes} 字节`,
  ]
    .filter(Boolean)
    .join('，');
  return diagnosticMessage(
    `保留活动消息后，缓存容量仍超过配置限制（${chineseLimits}）。`,
    `Cache capacity remains above configured limits after preserving active messages (${englishLimits}).`,
  );
}
