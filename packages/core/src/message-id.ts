export interface TranslationOptions {
  comment?: string;
}

function escapeMessageIdPart(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('#', '\\#');
}

export function normalizeComment(comment?: string): string | undefined {
  const normalized = comment?.trim();
  return normalized ? normalized : undefined;
}

export function createMessageId(
  source: string,
  options?: TranslationOptions,
): string {
  const comment = normalizeComment(options?.comment);
  const escapedSource = escapeMessageIdPart(source);
  return comment === undefined
    ? escapedSource
    : `${escapedSource}#${escapeMessageIdPart(comment)}`;
}

export function translationComment(
  options?: TranslationOptions,
): string | undefined {
  return normalizeComment(options?.comment);
}
