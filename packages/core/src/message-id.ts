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
  commentOrOptions?: string | TranslationOptions,
): string {
  if (
    typeof commentOrOptions !== 'object' ||
    commentOrOptions === null ||
    commentOrOptions.id === undefined
  ) {
    return source;
  }
  if (typeof commentOrOptions.id !== 'string') {
    throw new Error('[ai-i18n] translation id must be a string');
  }
  const id = commentOrOptions.id.trim();
  if (!id) throw new Error('[ai-i18n] translation id must not be empty');
  return id;
}

export function translationComment(
  commentOrOptions?: string | TranslationOptions,
): string | undefined {
  const comment =
    typeof commentOrOptions === 'string'
      ? commentOrOptions
      : commentOrOptions?.comment;
  return normalizeComment(comment);
}
