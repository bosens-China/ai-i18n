import type { ManualMessages } from './manual-translations.js';
import type {
  TranslationCatalog,
  TranslationSnapshot,
} from './translation-adapter.js';

export interface MaterializedLocale {
  global: Record<string, string>;
  files: Record<string, Record<string, string>>;
}

export function materializeLocale(
  catalog: TranslationCatalog,
  locale: string,
  globalManual: ManualMessages,
  fileManual: ManualMessages,
  snapshot: TranslationSnapshot,
): MaterializedLocale {
  const global: Record<string, string> = Object.create(null);
  const files: Record<string, Record<string, string>> = Object.create(null);
  const adapted = snapshot[locale];
  const checked = (value: string, source: string, key: string): string => {
    if (!hasSameTemplateTokens(source, value)) {
      throw new TypeError(
        diagnosticMessage(
          `[ai-i18n] 译文“${locale}/${key}”的模板占位符与原文不一致。`,
          `[ai-i18n] Translation "${locale}/${key}" has different template placeholders from its source.`,
        ),
      );
    }
    return value;
  };
  for (const message of catalog.messages) {
    if (message.scope === 'global') {
      const value = Object.hasOwn(globalManual, message.key)
        ? globalManual[message.key]
        : adapted && Object.hasOwn(adapted, message.key)
          ? adapted[message.key]
          : undefined;
      if (value !== null && value !== undefined)
        global[message.key] = checked(value, message.source, message.key);
      continue;
    }
    const file = message.file;
    if (!file)
      throw new TypeError('File-scoped catalog entry has no file identity.');
    const globalKey = createMessageId(message.source, {
      comment: message.comment,
    });
    const value = Object.hasOwn(fileManual, message.key)
      ? fileManual[message.key]
      : Object.hasOwn(globalManual, globalKey)
        ? undefined
        : adapted && Object.hasOwn(adapted, message.key)
          ? adapted[message.key]
          : undefined;
    if (value === null || value === undefined) continue;
    (files[file.id] ??= Object.create(null))[message.key] = checked(
      value,
      message.source,
      message.key,
    );
  }
  return { global, files };
}
import { createMessageId, hasSameTemplateTokens } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
