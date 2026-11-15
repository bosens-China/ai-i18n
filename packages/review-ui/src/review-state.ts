import type {
  ReviewFilter,
  ReviewMessage,
  ReviewMessageReference,
  ReviewOverride,
  ReviewSourceLocation,
} from '@ai-i18n/core';

export type ReviewAction = 'confirm' | 'save' | 'saved';
export type ReviewWorkbenchFilter = ReviewFilter | 'token-error';

export interface ReviewOccurrenceTarget {
  file: string;
  location: ReviewSourceLocation;
}

export interface ReviewScope {
  file?: string;
}

export function reviewOccurrenceTargets(
  message: ReviewMessage,
): ReviewOccurrenceTarget[] {
  return message.occurrences.flatMap((occurrence) =>
    occurrence.locations.map((location) => ({
      file: occurrence.sourceFile,
      location: { ...location },
    })),
  );
}

export function currentReviewOccurrence(
  message: ReviewMessage,
  scope: ReviewScope,
): ReviewOccurrenceTarget | undefined {
  const targets = reviewOccurrenceTargets(message);
  return targets.find((target) => !scope.file || target.file === scope.file);
}

export function messageKey(message: ReviewMessageReference): string {
  return JSON.stringify([message.source, message.comment ?? null]);
}

export function draftKey(
  message: ReviewMessageReference,
  locale: string,
  scope: ReviewScope,
): string {
  return JSON.stringify([
    message.source,
    message.comment ?? null,
    locale,
    scopeKey(scope),
  ]);
}

export function activeOverride(
  message: ReviewMessage,
  locale: string,
  scope: ReviewScope,
): ReviewOverride | undefined {
  return message.overrides.find(
    (item) => item.locale === locale && sameScope(item, scope),
  );
}

export function reviewBaseline(
  message: ReviewMessage,
  locale: string,
  scope: ReviewScope,
): string {
  return (
    activeOverride(message, locale, scope)?.value ??
    (scope.file
      ? message.fileTranslations?.[scope.file]?.[locale]
      : undefined) ??
    message.translations[locale] ??
    message.message.source
  );
}

export function supportsFileScope(
  message: ReviewMessage,
  file: string,
): boolean {
  return message.occurrences.some(
    (occurrence) => occurrence.sourceFile === file && occurrence.fileScoped,
  );
}

export function mutationScope(
  scope: ReviewScope,
): Pick<ReviewOverride, 'file'> {
  return scope.file ? { file: scope.file } : {};
}

function sameScope(
  left: Pick<ReviewOverride, 'file'>,
  right: ReviewScope,
): boolean {
  return left.file === right.file;
}

function scopeKey(scope: ReviewScope): string {
  return JSON.stringify([scope.file ?? null]);
}

export function reviewAction(
  hasOverride: boolean,
  draft: string,
  baseline: string,
): ReviewAction {
  if (!hasOverride) return 'confirm';
  return draft === baseline ? 'saved' : 'save';
}
