import {
  createMessageId,
  hasSameTemplateTokens,
  type TranslationMemoryFile,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { RemoteAdapter, RemoteContext } from './remote.js';
import type { TranslationMeta } from './runtime.js';

function invalid(chinese: string, english: string): never {
  throw new TypeError(
    diagnosticMessage(`[ai-i18n] ${chinese}`, `[ai-i18n] ${english}`),
  );
}

export function validateRemote(
  remote: RemoteAdapter | undefined,
  provider: unknown,
) {
  if (remote === undefined) return;
  if (
    !remote ||
    typeof remote !== 'object' ||
    (remote.publish === undefined && remote.load === undefined)
  ) {
    invalid(
      'remote 至少需要 publish 或 load 函数。',
      'remote requires a publish or load function.',
    );
  }
  if (
    remote.mode !== undefined &&
    !['replace', 'overlay'].includes(remote.mode)
  ) {
    invalid(
      'remote.mode 必须是 replace 或 overlay。',
      'remote.mode must be replace or overlay.',
    );
  }
  if (remote.mode === 'overlay' && !remote.load) {
    invalid(
      'remote overlay 模式需要 load 函数。',
      'Remote overlay mode requires a load function.',
    );
  }
  for (const name of ['publish', 'load'] as const) {
    if (remote[name] !== undefined && typeof remote[name] !== 'function') {
      invalid(
        `remote.${name} 必须是函数。`,
        `remote.${name} must be a function.`,
      );
    }
  }
  if (remote.load && provider !== undefined) {
    invalid(
      'remote.load 与 provider 不能同时配置。',
      'remote.load and provider cannot be configured together.',
    );
  }
}

export function validateRemoteSnapshot(value: unknown, context: RemoteContext) {
  if (!record(value) || !Array.isArray(value.translations)) {
    invalid(
      'remote.load 必须返回包含 translations 数组的快照。',
      'remote.load must return a snapshot with a translations array.',
    );
  }
  const cache: TranslationMemoryFile = {
    version: 1,
    revision: 0,
    messages: Object.create(null),
  };
  for (const message of context.messages) {
    cache.messages[createMessageId(message.source, message)] = {
      source: message.source,
      sourceLang: context.sourceLang,
      ...(message.comment ? { comment: message.comment } : {}),
      translations: Object.fromEntries(
        context.locales.map((locale) => [locale, null]),
      ),
    };
  }
  const seen = new Map<string, string | null>();
  for (const entry of value.translations) {
    if (
      !record(entry) ||
      !record(entry.message) ||
      typeof entry.message.source !== 'string' ||
      (entry.message.comment !== undefined &&
        typeof entry.message.comment !== 'string') ||
      typeof entry.locale !== 'string' ||
      (entry.value !== null && typeof entry.value !== 'string')
    ) {
      invalid(
        '远程译文必须包含合法的 message、locale 和 value。',
        'Remote translations require valid message, locale, and value fields.',
      );
    }
    const id = createMessageId(entry.message.source, {
      comment: entry.message.comment,
    });
    const message = cache.messages[id];
    if (!message || !context.locales.includes(entry.locale)) {
      invalid(
        '远程译文包含当前快照之外的消息或目标语言。',
        'Remote translations contain a message or target locale outside the current snapshot.',
      );
    }
    if (
      entry.value !== null &&
      !hasSameTemplateTokens(message.source, entry.value)
    ) {
      invalid(
        '远程译文的模板占位符与原文不一致。',
        'Remote translation template tokens do not match the source.',
      );
    }
    const key = JSON.stringify([id, entry.locale]);
    if (seen.has(key) && seen.get(key) !== entry.value) {
      invalid(
        '同一消息和语言存在冲突的远程译文。',
        'Conflicting remote translations exist for the same message and locale.',
      );
    }
    seen.set(key, entry.value);
    message.translations[entry.locale] = entry.value;
  }
  let publicMeta: TranslationMeta | undefined;
  if (value.publicMeta !== undefined) {
    if (!record(value.publicMeta))
      invalid(
        'publicMeta 必须是 JSON 对象。',
        'publicMeta must be a JSON object.',
      );
    assertJson(value.publicMeta, new Set());
    publicMeta = structuredClone(value.publicMeta) as TranslationMeta;
  }
  return { cache, publicMeta };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertJson(value: unknown, ancestors: Set<object>): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (
    typeof value !== 'object' ||
    !value ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    invalid(
      'publicMeta 只能包含无循环的 JSON 数据。',
      'publicMeta must contain only non-circular JSON data.',
    );
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      invalid(
        'publicMeta 不能包含 Symbol、访问器或非枚举字段。',
        'publicMeta cannot contain symbols, accessors, or non-enumerable fields.',
      );
    }
    assertJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}
