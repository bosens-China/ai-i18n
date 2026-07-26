import type { ExtractedFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { writeFile } from 'atomically';
import { listJsonFiles, readJson, readText, stableJson } from './json-files.js';
import type { ProjectSnapshot } from './project-state.js';

export async function readGeneratedJsonFiles<T>(
  directory: string,
  kind: string,
  parse: (value: unknown) => T,
  onWarning?: (message: string) => void,
): Promise<T[]> {
  const values: T[] = [];
  for (const file of await listJsonFiles(directory)) {
    const value = await readJson(file);
    if (value !== undefined) values.push(parse(value));
    else
      onWarning?.(
        diagnosticMessage(
          `读取时生成的 ${kind} 文件已消失；已跳过“${file}”。`,
          `Generated ${kind} file disappeared while reading; skipped "${file}".`,
        ),
      );
  }
  return values;
}

export async function writeProtocolJson(
  file: string,
  value: unknown,
): Promise<string | undefined> {
  const content = stableJson(value);
  try {
    if ((await readText(file)) === content) return undefined;
    await writeFile(file, content, {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
    return content;
  } catch (error) {
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

export function warnExtractedMismatches(
  diskFiles: readonly ExtractedFile[],
  snapshot: ProjectSnapshot,
  preferredSources: readonly string[] = [],
  onWarning?: (message: string) => void,
): void {
  const preferred = new Set(preferredSources);
  for (const diskFile of diskFiles) {
    const current = snapshot.extracted[diskFile.source];
    if (!current || !preferred.has(diskFile.source)) continue;
    const diskIds = diskFile.messages.map((message) => message.id).sort();
    const currentIds = current.messages.map((message) => message.id).sort();
    if (diskIds.join('\0') === currentIds.join('\0')) continue;
    onWarning?.(
      diagnosticMessage(
        `提取文件“${diskFile.source}”的消息结构已过期；已保留源码分析结果。编辑前请重新加载生成文件。`,
        `The message structure in extracted file "${diskFile.source}" is stale; source analysis was kept. Reload the generated file before editing.`,
      ),
    );
  }
}
