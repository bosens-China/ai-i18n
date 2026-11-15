import {
  parseProtocolJson,
  DuplicateJsonKeyError,
} from '@ai-i18n/core/internal/files';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { writeFile } from 'atomically';
import { readText, stableJson } from './json-files.js';

export async function writeProtocolJson(
  file: string,
  value: unknown,
): Promise<string | undefined> {
  const content = stableJson(value);
  try {
    const current = await readText(file);
    if (current === content) return undefined;
    if (current !== undefined) parseProtocolJson(current, file);
    await writeFile(file, content, {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
    return content;
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 写入协议文件“${file}”失败：${message}`,
        `[ai-i18n] Failed to write protocol file "${file}": ${message}`,
      ),
      { cause: error },
    );
  }
}
