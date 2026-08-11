import { reactive } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import { draftKey, reviewBaseline } from '../review-state';

export function useReviewDrafts() {
  const drafts = reactive(new Map<string, string>());

  function draftFor(
    message: ReviewMessage,
    locale: string,
    scope: string,
  ): string {
    return (
      drafts.get(draftKey(message.message, locale, scope)) ??
      reviewBaseline(message, locale, scope)
    );
  }

  function updateDraft(
    message: ReviewMessage,
    locale: string,
    scope: string,
    value: string,
  ): void {
    const key = draftKey(message.message, locale, scope);
    if (value === reviewBaseline(message, locale, scope)) {
      drafts.delete(key);
      return;
    }
    drafts.set(key, value);
  }

  function clearDraft(mutation: ReviewMutation): void {
    drafts.delete(
      draftKey(mutation.message, mutation.locale, mutation.file ?? ''),
    );
  }

  return { draftFor, updateDraft, clearDraft };
}
