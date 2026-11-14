import path from 'node:path';
import {
  createMessageId,
  type ExtractedFile,
  type ExtractedMessage,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import type { ManualMessages } from './manual-translations.js';
import { fileId, fileMessageKey } from './repository-paths.js';

export interface OverrideMigration {
  global: Record<string, ManualMessages>;
  files: Record<string, ManualMessages>;
}

/** 旧 occurrence 只有覆盖该身份的全部调用点时，才可并入新文件身份。 */
export function planOverrideMigration(
  root: string,
  extracted: readonly ExtractedFile[],
  overrides: TranslationOverridesFile,
  locales: readonly string[],
  existing: OverrideMigration = { global: {}, files: {} },
): OverrideMigration {
  const result = structuredClone(existing);
  const targets = new Map<string, ExtractedMessage>();
  for (const file of extracted) {
    for (const message of file.messages) {
      if (message.scope === 'file')
        targets.set(`${file.source}\0${message.id}`, message);
    }
  }
  const errors: string[] = [];
  const allowed = new Set(locales);
  for (const rule of overrides.rules) {
    const messageId = createMessageId(rule.source, { comment: rule.comment });
    const locations = rule.occurrences;
    const sourceFiles =
      rule.files ??
      (locations ? [...new Set(locations.map((item) => item.file))] : []);
    const global = !rule.files && !locations;
    const selected = global ? [undefined] : sourceFiles;
    for (const source of selected) {
      const active =
        source === undefined
          ? undefined
          : targets.get(`${source}\0${messageId}`);
      if (source !== undefined && !active) {
        errors.push(`${source}: ${messageId} (scope: file)`);
        continue;
      }
      if (source !== undefined && locations) {
        const covered = new Set(
          locations
            .filter((item) => item.file === source)
            .map((item) => `${item.line}:${item.column}`),
        );
        if (
          !active!.locations.length ||
          active!.locations.some(
            (item) => !covered.has(`${item.line}:${item.column}`),
          )
        ) {
          errors.push(`${source}: ${messageId} (occurrence)`);
          continue;
        }
      }
      const key =
        source === undefined
          ? messageId
          : fileMessageKey(fileId(root, path.resolve(root, source)), messageId);
      for (const [locale, value] of Object.entries(rule.translations)) {
        if (!allowed.has(locale)) {
          errors.push(`${source ?? '<global>'}: ${messageId} (${locale})`);
          continue;
        }
        const dictionary = ((source === undefined
          ? result.global
          : result.files)[locale] ??= {});
        const previous = dictionary[key];
        if (previous !== undefined && previous !== value) {
          errors.push(
            `${source ?? '<global>'}: ${messageId} (${locale}, conflict)`,
          );
          continue;
        }
        dictionary[key] = value;
      }
    }
  }
  if (errors.length) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 以下旧人工译文无法无损迁移，请显式标记文件范围或人工处理；旧文件未改动：\n${errors.join('\n')}`,
        `[ai-i18n] The following manual translations cannot be migrated without loss. Mark file scope or resolve them manually; legacy files were not changed:\n${errors.join('\n')}`,
      ),
    );
  }
  return result;
}
