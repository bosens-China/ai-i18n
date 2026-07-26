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
  return options?.id === undefined ? source : options.id.trim();
}

export function translationComment(
  options?: TranslationOptions,
): string | undefined {
  return normalizeComment(options?.comment);
}
