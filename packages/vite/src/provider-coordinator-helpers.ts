import {
  hasSameTemplateTokens,
  type TranslationMessage,
  type TranslationResult,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ProviderRequest } from './provider-coordinator.js';

interface BatchPending {
  request: ProviderRequest;
  serializedLength: number;
}

export function promptMessage(request: ProviderRequest): TranslationMessage {
  return {
    source: request.source,
    ...(request.comment === undefined ? {} : { comment: request.comment }),
  };
}

export function localeKey(request: ProviderRequest): string {
  return JSON.stringify(request.locales);
}

function emptyBatchLength(locales: readonly string[]): number {
  return JSON.stringify({ locales, messages: [] }).length;
}

export function readyLocalesKey(
  requests: Iterable<BatchPending>,
  limit: number,
): string | undefined {
  const lengths = new Map<string, number>();
  for (const pending of requests) {
    const key = localeKey(pending.request);
    const current =
      lengths.get(key) ?? emptyBatchLength(pending.request.locales);
    const next =
      current +
      pending.serializedLength +
      (current > emptyBatchLength(pending.request.locales) ? 1 : 0);
    if (next >= limit) return key;
    lengths.set(key, next);
  }
  return undefined;
}

export function takeBatch<T extends BatchPending>(
  requests: Iterable<T>,
  localesKey: string,
  limit: number,
): T[] {
  const batch: T[] = [];
  let length = 0;
  for (const pending of requests) {
    if (localeKey(pending.request) !== localesKey) continue;
    if (!batch.length) length = emptyBatchLength(pending.request.locales);
    const nextLength =
      length + pending.serializedLength + (batch.length ? 1 : 0);
    if (batch.length && nextLength > limit) break;
    batch.push(pending);
    length = nextLength;
    if (length >= limit) break;
  }
  return batch;
}

export function validateRequest(request: ProviderRequest): void {
  if (
    !request.locales.length ||
    request.locales.some((locale) => !locale) ||
    new Set(request.locales).size !== request.locales.length
  ) {
    throw new Error(
      diagnosticMessage(
        'Provider 请求必须包含不重复的目标语言。',
        'Provider requests must contain unique target locales.',
      ),
    );
  }
}

export function validateResults(
  messages: readonly TranslationMessage[],
  locales: readonly string[],
  results: readonly TranslationResult[],
): TranslationResult[] {
  if (!Array.isArray(results) || results.length !== messages.length) {
    throw new Error(
      diagnosticMessage(
        'Translator 必须返回与消息数量相同的结果数组。',
        'Translator must return one result row per message.',
      ),
    );
  }
  const expectedLocales = new Set(locales);
  return results.map((result, index) => {
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      Object.keys(result).length !== expectedLocales.size ||
      Object.keys(result).some((locale) => !expectedLocales.has(locale))
    ) {
      throw new Error(
        diagnosticMessage(
          'Translator 返回了无效或语言字段不完整的结果。',
          'Translator returned an invalid result or incomplete locale fields.',
        ),
      );
    }
    for (const locale of locales) {
      const value = result[locale];
      if (
        (typeof value !== 'string' && value !== null) ||
        (value !== null &&
          !hasSameTemplateTokens(messages[index]!.source, value))
      ) {
        throw new Error(
          diagnosticMessage(
            'Translator 返回了无效或占位符不匹配的译文。',
            'Translator returned an invalid or placeholder-mismatched value.',
          ),
        );
      }
    }
    return result;
  });
}

export function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      diagnosticMessage(
        `[ai-i18n] ${name} 必须是非负数。`,
        `[ai-i18n] ${name} must be a non-negative number.`,
      ),
    );
  }
  return value;
}

export function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(
      diagnosticMessage(
        `[ai-i18n] ${name} 必须是正整数。`,
        `[ai-i18n] ${name} must be a positive integer.`,
      ),
    );
  }
  return value;
}
