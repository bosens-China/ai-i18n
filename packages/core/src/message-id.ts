export interface TranslationOptions {
  id?: string;
  comment?: string;
}

export function normalizeComment(comment?: string): string | undefined {
  const normalized = comment?.trim();
  return normalized ? normalized : undefined;
}

export function createMessageId(
  source: string,
  options?: TranslationOptions,
): string {
  const resolved = validateTranslationOptions(options);
  if (resolved?.id === undefined) return source;
  if (typeof resolved.id !== 'string') {
    throw new Error('[ai-i18n] translation id must be a string');
  }
  const id = resolved.id.trim();
  if (!id) throw new Error('[ai-i18n] translation id must not be empty');
  return id;
}

export function translationComment(
  options?: TranslationOptions,
): string | undefined {
  return normalizeComment(validateTranslationOptions(options)?.comment);
}

function validateTranslationOptions(
  options: TranslationOptions | undefined,
): TranslationOptions | undefined {
  if (
    options !== undefined &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new Error('[ai-i18n] translation options must be an object');
  }
  return options;
}
