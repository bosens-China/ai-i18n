import { createMessageId, hasSameTemplateTokens } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import type { ManualMessages } from './manual-translations.js';

export interface TranslationCatalogEntry {
  key: string;
  source: string;
  comment?: string;
  scope: 'global' | 'file';
  file?: { id: string; path: string };
}

export interface TranslationCatalog {
  sourceLang: string;
  locales: readonly string[];
  messages: readonly TranslationCatalogEntry[];
}

export type TranslationSnapshot = Readonly<
  Record<string, Readonly<Record<string, string | null>>>
>;

export type TranslationAdapter = (
  catalog: TranslationCatalog,
) => Promise<TranslationSnapshot | null>;

export function validateTranslationSnapshot(
  catalog: TranslationCatalog,
  value: TranslationSnapshot | null,
): TranslationSnapshot {
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidSnapshot(
      '结果必须是按语言索引的对象。',
      'Result must be an object keyed by locale.',
    );
  }
  const messages = new Map(
    catalog.messages.map((message) => [message.key, message]),
  );
  if (messages.size !== catalog.messages.length) {
    throw invalidSnapshot(
      '文案目录包含重复 key。',
      'Catalog contains duplicate keys.',
    );
  }
  const locales = new Set(
    catalog.locales.filter((locale) => locale !== catalog.sourceLang),
  );
  for (const [locale, translations] of Object.entries(value)) {
    if (!locales.has(locale)) {
      throw invalidSnapshot(
        `未知语言“${locale}”。`,
        `Unknown locale "${locale}".`,
      );
    }
    if (
      typeof translations !== 'object' ||
      translations === null ||
      Array.isArray(translations)
    ) {
      throw invalidSnapshot(
        `语言“${locale}”必须返回 key→value 对象。`,
        `Locale "${locale}" must return a key-value object.`,
      );
    }
    for (const [key, translation] of Object.entries(translations)) {
      const message = messages.get(key);
      if (!message) {
        throw invalidSnapshot(
          `未知文案 key“${key}”。`,
          `Unknown message key "${key}".`,
        );
      }
      if (
        translation !== null &&
        (typeof translation !== 'string' ||
          !hasSameTemplateTokens(message.source, translation))
      ) {
        throw invalidSnapshot(
          `译文“${locale}/${key}”无效或模板占位符不一致。`,
          `Translation "${locale}/${key}" is invalid or its template placeholders differ.`,
        );
      }
    }
  }
  return value;
}

export function resolveTranslation(
  message: TranslationCatalogEntry,
  locale: string,
  globalManual: ManualMessages,
  fileManual: ManualMessages,
  snapshot: TranslationSnapshot,
): string {
  const globalKey = createMessageId(message.source, {
    comment: message.comment,
  });
  const manualKeys =
    message.scope === 'file'
      ? ([
          [fileManual, message.key],
          [globalManual, globalKey],
        ] as const)
      : ([[globalManual, globalKey]] as const);
  for (const [dictionary, key] of manualKeys) {
    if (Object.hasOwn(dictionary, key)) return dictionary[key]!;
  }
  const translations = snapshot[locale];
  const adapterKeys =
    message.scope === 'file' ? [message.key, globalKey] : [globalKey];
  for (const key of adapterKeys) {
    const value = translations?.[key];
    if (value !== null && value !== undefined) return value;
  }
  return message.source;
}

function invalidSnapshot(zh: string, en: string): TypeError {
  return new TypeError(
    diagnosticMessage(`[ai-i18n] 适配器${zh}`, `[ai-i18n] Adapter ${en}`),
  );
}
