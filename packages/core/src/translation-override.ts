import type { ExtractedMessage, TranslationOverridesFile } from './schema.js';

export function resolveTranslationOverride(
  overrides: TranslationOverridesFile,
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
): string | undefined {
  const override = overrides.messages[message.source];
  return (
    (message.comment ? override?.byId?.[message.id]?.[locale] : undefined) ??
    override?.default?.[locale]
  );
}
