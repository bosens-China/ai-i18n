import type { ExtractedMessage, TranslationOverridesFile } from './schema.js';

export function resolveTranslationOverride(
  overrides: TranslationOverridesFile,
  message: Pick<ExtractedMessage, 'id' | 'source'>,
  locale: string,
): string | undefined {
  const override = overrides.messages[message.source];
  return (
    (message.id === message.source
      ? undefined
      : override?.byId?.[message.id]?.[locale]) ?? override?.default?.[locale]
  );
}
