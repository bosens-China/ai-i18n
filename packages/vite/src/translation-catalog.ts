import path from 'node:path';
import { createMessageId, type ExtractedFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { fileId, fileMessageKey, repositoryPath } from './repository-paths.js';
import type {
  TranslationCatalog,
  TranslationCatalogEntry,
} from './translation-adapter.js';

export function buildTranslationCatalog(
  root: string,
  sourceLang: string,
  locales: readonly string[],
  files: readonly ExtractedFile[],
): TranslationCatalog {
  const messages = new Map<string, TranslationCatalogEntry>();
  const paths = new Map<string, string>();
  for (const file of files) {
    const absolute = path.resolve(root, file.source);
    const relative = repositoryPath(root, absolute);
    const id = fileId(root, absolute);
    const previous = paths.get(id);
    if (previous && previous !== relative) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 文件身份冲突：“${previous}”和“${relative}”。`,
          `[ai-i18n] File identity collision: "${previous}" and "${relative}".`,
        ),
      );
    }
    paths.set(id, relative);
    for (const message of file.messages) {
      const expected = createMessageId(message.source, {
        comment: message.comment,
      });
      if (message.id !== expected) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 文案“${file.source}”的身份与原文不一致。`,
            `[ai-i18n] Message identity in "${file.source}" does not match its source.`,
          ),
        );
      }
      const global: TranslationCatalogEntry = {
        key: message.id,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        scope: 'global',
      };
      const existing = messages.get(global.key);
      if (existing && existing.source !== global.source) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 文案 key“${global.key}”对应多个原文。`,
            `[ai-i18n] Message key "${global.key}" has multiple source strings.`,
          ),
        );
      }
      messages.set(global.key, global);
      if (message.scope === 'file') {
        const scoped: TranslationCatalogEntry = {
          ...global,
          key: fileMessageKey(id, message.id),
          scope: 'file',
          file: { id, path: relative },
        };
        messages.set(scoped.key, scoped);
      }
    }
  }
  return {
    sourceLang,
    locales: [...locales],
    messages: [...messages.values()].sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    ),
  };
}
