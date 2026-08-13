import type {
  ReviewFilter,
  ReviewMessage,
  ReviewMessageReference,
  ReviewOverride,
} from '@ai-i18n/core';

export type ReviewAction = 'confirm' | 'save' | 'saved';
export type ReviewWorkbenchFilter = ReviewFilter | 'token-error';

export function currentReviewFile(message: ReviewMessage): string {
  // 左侧列表展示首个来源，因此“当前文件”与该条目的可见来源保持一致。
  return message.occurrences[0]?.sourceFile ?? '';
}

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
  if (!hasOverride) return 'confirm';
  return draft === baseline ? 'saved' : 'save';
}
