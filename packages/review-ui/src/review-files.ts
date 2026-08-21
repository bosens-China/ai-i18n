import type { ReviewMessage } from '@ai-i18n/core';

export function reviewFileSuffix(sourceFile: string): string | undefined {
  const normalized = sourceFile.replaceAll('\\', '/');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return undefined;
  return fileName.slice(dot).toLocaleLowerCase();
}

export function reviewFileSuffixes(
  messages: readonly ReviewMessage[],
): string[] {
  return [
    ...new Set(
      messages.flatMap((message) =>
        message.occurrences.flatMap((occurrence) => {
          const suffix = reviewFileSuffix(occurrence.sourceFile);
          return suffix ? [suffix] : [];
        }),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function matchesReviewFileSuffix(
  message: ReviewMessage,
  suffix: string,
): boolean {
  return (
    !suffix ||
    message.occurrences.some(
      (occurrence) => reviewFileSuffix(occurrence.sourceFile) === suffix,
    )
  );
}
