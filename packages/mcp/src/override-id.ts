import { fail, McpToolError } from './errors.js';

export interface OverrideTarget {
  source: string;
  comment?: string;
  files?: string[];
  occurrences?: Array<{ source_file: string; line: number; column: number }>;
  locale: string;
}

export function encodeOverrideId(target: OverrideTarget): string {
  // ID 只负责稳定寻址，Agent 应始终从列表结果原样复制。
  return Buffer.from(JSON.stringify(target)).toString('base64url');
}

export function decodeOverrideId(value: string): OverrideTarget {
  try {
    const target = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const keys = Object.keys(target).sort().join(',');
    const expectedKeys = [
      ...(target.comment === undefined ? [] : ['comment']),
      ...(target.files === undefined ? [] : ['files']),
      ...(target.occurrences === undefined ? [] : ['occurrences']),
      'locale',
      'source',
    ]
      .sort()
      .join(',');
    if (
      keys !== expectedKeys ||
      typeof target.source !== 'string' ||
      typeof target.locale !== 'string' ||
      !target.locale ||
      (target.comment !== undefined &&
        (typeof target.comment !== 'string' || !target.comment.trim())) ||
      (target.files !== undefined &&
        (!Array.isArray(target.files) ||
          target.files.length === 0 ||
          target.files.some((file) => typeof file !== 'string' || !file))) ||
      (target.occurrences !== undefined &&
        (!Array.isArray(target.occurrences) ||
          target.occurrences.length === 0 ||
          target.occurrences.some(
            (occurrence) => !validOccurrence(occurrence),
          ))) ||
      (target.files !== undefined && target.occurrences !== undefined)
    ) {
      fail('INVALID_OVERRIDE_ID', { override_id: value });
    }
    return target as unknown as OverrideTarget;
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    fail('INVALID_OVERRIDE_ID', { override_id: value });
  }
}

export function overrideTargetKey(target: OverrideTarget): string {
  return JSON.stringify([
    target.source,
    target.comment ?? null,
    target.files ? [...new Set(target.files)].sort() : null,
    target.occurrences
      ? [...target.occurrences]
          .map((item) => [item.source_file, item.line, item.column])
          .sort()
      : null,
    target.locale,
  ]);
}

function validOccurrence(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).sort().join(',') === 'column,line,source_file' &&
    typeof item.source_file === 'string' &&
    item.source_file.length > 0 &&
    Number.isSafeInteger(item.line) &&
    (item.line as number) > 0 &&
    Number.isSafeInteger(item.column) &&
    (item.column as number) >= 0
  );
}
