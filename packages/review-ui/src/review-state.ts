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
  location?: ReviewSourceLocation;
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
  if (scope.file && scope.location) {
    const exactScope = { file: scope.file, location: scope.location };
    const exact = targets.find((target) => sameOccurrence(target, exactScope));
    if (exact) return exact;
  }
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
    message.translations[locale] ??
    message.message.source
  );
}

export function mutationScope(
  scope: Pick<ReviewScope, 'file' | 'location'>,
): Pick<ReviewOverride, 'file' | 'location'> {
  return {
    ...(scope.file ? { file: scope.file } : {}),
    ...(scope.location ? { location: { ...scope.location } } : {}),
  };
}

function sameScope(
  left: Pick<ReviewOverride, 'file' | 'location'>,
  right: ReviewScope,
): boolean {
  return (
    left.file === right.file &&
    left.location?.line === right.location?.line &&
    left.location?.column === right.location?.column
  );
}

function sameOccurrence(
  left: ReviewOccurrenceTarget,
  right: ReviewOccurrenceTarget,
): boolean {
  return (
    left.file === right.file &&
    left.location.line === right.location.line &&
    left.location.column === right.location.column
  );
}

function scopeKey(scope: ReviewScope): string {
  return JSON.stringify([
    scope.file ?? null,
    scope.location?.line ?? null,
    scope.location?.column ?? null,
  ]);
}

export function reviewAction(
  hasOverride: boolean,
  draft: string,
  baseline: string,
): ReviewAction {
  if (!hasOverride) return 'confirm';
  return draft === baseline ? 'saved' : 'save';
}

/** 当前范围继承更宽的人工覆盖；候选标记不能把自动基线误当成最终展示值。 */
export function reviewEffectiveValue(
  message: ReviewMessage,
  locale: string,
  scope: ReviewScope,
): string {
  const overrides = message.overrides.filter(
    (item) =>
      item.locale === locale &&
      (!item.file || item.file === scope.file) &&
      (!item.location ||
        (item.location.line === scope.location?.line &&
          item.location.column === scope.location?.column)),
  );
  const rank = (item: ReviewOverride) =>
    item.location ? 2 : item.file ? 1 : 0;
  overrides.sort((a, b) => rank(b) - rank(a));
  return (
    overrides[0]?.value ??
    message.translations[locale] ??
    message.message.source
  );
}
