import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { withFileQueue } from '@ai-i18n/core/translation-memory';
import { readJson } from './json-files.js';

export type ManualMessages = Record<string, string>;

/** 同进程的 MCP 编辑与旧规则迁移共用队列，避免基于过期快照覆盖人工值。 */
export function withManualTranslationQueue<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  return withFileQueue(path.join(directory, 'locales', '.manual'), task);
}

export function manualLocalePath(
  directory: string,
  locale: string,
  scope: 'global' | 'file',
): string {
  const name = `${encodeURIComponent(locale)}.manual.json`;
  return scope === 'file'
    ? path.join(directory, 'locales', 'files', name)
    : path.join(directory, 'locales', name);
}

export async function readManualLocale(
  directory: string,
  locale: string,
  scope: 'global' | 'file',
): Promise<ManualMessages> {
  const file = manualLocalePath(directory, locale, scope);
  const value = await readJson(file);
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(
      diagnosticMessage(
        `[ai-i18n] 人工译文“${file}”必须是 key→value 对象。`,
        `[ai-i18n] Manual translations in "${file}" must be a key-value object.`,
      ),
    );
  }
  for (const [key, translation] of Object.entries(value)) {
    if (typeof translation !== 'string') {
      throw new TypeError(
        diagnosticMessage(
          `[ai-i18n] 人工译文“${file}”中的“${key}”必须是字符串。`,
          `[ai-i18n] Manual translation "${key}" in "${file}" must be a string.`,
        ),
      );
    }
  }
  return value as ManualMessages;
}

export async function writeManualLocale(
  directory: string,
  locale: string,
  scope: 'global' | 'file',
  messages: ManualMessages,
): Promise<void> {
  const file = manualLocalePath(directory, locale, scope);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(messages, null, 2)}\n`);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
