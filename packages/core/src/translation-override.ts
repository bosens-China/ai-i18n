import type { ExtractedMessage, TranslationOverridesFile } from './schema.js';

export interface TranslationOccurrence {
  line: number;
  column: number;
}

export function translationOccurrenceKey(
  occurrence: TranslationOccurrence,
): string {
  return `${occurrence.line}:${occurrence.column}`;
}

export function resolveTranslationOverride(
  overrides: TranslationOverridesFile,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  sourceFile?: string,
  occurrence?: TranslationOccurrence,
): string | undefined {
  let selected: { priority: number; value: string } | undefined;
  for (const rule of overrides.rules) {
    if (rule.source !== message.source) continue;
    const commentMatch = rule.comment === message.comment;
    const defaultMatch = rule.comment === undefined;
    if (!commentMatch && !defaultMatch) continue;
    const occurrenceMatch =
      rule.occurrences !== undefined &&
      sourceFile !== undefined &&
      occurrence !== undefined &&
      rule.occurrences.some(
        (target) =>
          target.file === sourceFile &&
          target.line === occurrence.line &&
          target.column === occurrence.column,
      );
    if (rule.occurrences !== undefined && !occurrenceMatch) continue;
    const fileMatch =
      rule.files !== undefined &&
      sourceFile !== undefined &&
      rule.files.includes(sourceFile);
    if (rule.files !== undefined && !fileMatch) continue;
    const value = rule.translations[locale];
    if (value === undefined) continue;
    // 范围优先于 comment：精确出现位置 > 文件 > 全局。
    const scopePriority = occurrenceMatch ? 3 : fileMatch ? 2 : 1;
    const priority = scopePriority * 2 + (rule.comment ? 1 : 0);
    if (!selected || priority > selected.priority)
      selected = { priority, value };
  }
  return selected?.value;
}
