import { Buffer } from 'node:buffer';
import type { CacheFileV1 } from '@ai-i18n/core';
import type { AiI18nCacheOptions } from './options.js';
import { stableJson } from './json-files.js';

interface CacheUsage {
  messages: number;
  bytes?: number;
  fits: boolean;
}

export function enforceCacheCapacity(
  cache: CacheFileV1,
  activeFiles: CacheFileV1['files'],
  options: AiI18nCacheOptions | undefined,
  onWarning?: (message: string) => void,
): void {
  if (!options?.maxMessages && !options?.maxBytes) return;
  if (cacheUsage(cache, options).fits) return;

  const active = new Set(
    [...Object.values(cache.files), ...Object.values(activeFiles)].flatMap(
      (file) => file.messageIds,
    ),
  );
  const candidates = Object.keys(cache.messages)
    .filter((messageId) => !active.has(messageId))
    .sort((left, right) => left.localeCompare(right));

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
  cache: CacheFileV1,
  candidates: readonly string[],
  count: number,
): CacheFileV1 {
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
  cache: CacheFileV1,
  options: AiI18nCacheOptions,
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
  options: AiI18nCacheOptions,
): string {
  const limits = [
    options.maxMessages === undefined
      ? undefined
      : `${usage.messages}/${options.maxMessages} messages`,
    options.maxBytes === undefined
      ? undefined
      : `${usage.bytes}/${options.maxBytes} bytes`,
  ]
    .filter(Boolean)
    .join(', ');
  return `cache capacity remains above configured limits after preserving active messages (${limits})`;
}
