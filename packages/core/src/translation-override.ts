import type { ExtractedMessage, TranslationOverridesFile } from './schema.js';

export function resolveTranslationOverride(
  overrides: TranslationOverridesFile,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  sourceFile?: string,
): string | undefined {
  let selected: { priority: number; value: string } | undefined;
  for (const rule of overrides.rules) {
    if (rule.source !== message.source) continue;
    const commentMatch = rule.comment === message.comment;
    const defaultMatch = rule.comment === undefined;
    if (!commentMatch && !defaultMatch) continue;
    const fileMatch =
      rule.files !== undefined &&
      sourceFile !== undefined &&
      rule.files.includes(sourceFile);
    if (rule.files !== undefined && !fileMatch) continue;
    const value = rule.translations[locale];
    if (value === undefined) continue;
    const priority = commentMatch ? (fileMatch ? 4 : 3) : fileMatch ? 2 : 1;
    if (!selected || priority > selected.priority)
      selected = { priority, value };
  }
  return selected?.value;
}
