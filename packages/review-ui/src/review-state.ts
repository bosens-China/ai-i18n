import type {
  ReviewMessage,
  ReviewMessageReference,
  ReviewOverride,
} from '@ai-i18n/core';

export type ReviewAction = 'confirm' | 'save' | 'saved';

export function messageKey(message: ReviewMessageReference): string {
  return JSON.stringify([message.source, message.comment ?? null]);
}

export function draftKey(
  message: ReviewMessageReference,
  locale: string,
  scope: string,
): string {
  return JSON.stringify([
    message.source,
    message.comment ?? null,
    locale,
    scope,
  ]);
}

export function activeOverride(
  message: ReviewMessage,
  locale: string,
  scope: string,
): ReviewOverride | undefined {
  return message.overrides.find(
    (item) => item.locale === locale && (item.file ?? '') === scope,
  );
}

export function reviewBaseline(
  message: ReviewMessage,
  locale: string,
  scope: string,
): string {
  return (
    activeOverride(message, locale, scope)?.value ??
    message.translations[locale] ??
    message.message.source
  );
}

export function reviewAction(
  hasOverride: boolean,
  draft: string,
  baseline: string,
): ReviewAction {
  if (draft !== baseline) return 'save';
  return hasOverride ? 'saved' : 'confirm';
}
