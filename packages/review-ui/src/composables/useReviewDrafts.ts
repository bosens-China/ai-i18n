import { reactive } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import {
  activeOverride,
  draftKey,
  mutationScope,
  reviewBaseline,
  type ReviewScope,
} from '../review-state';

export function useReviewDrafts() {
  const drafts = reactive(new Map<string, string>());

  function draftFor(
    message: ReviewMessage,
    locale: string,
    scope: ReviewScope,
  ): string {
    const key = draftKey(message.message, locale, scope);
    // 没有人工覆盖时保持空白，避免把自动译文误认为人工确认内容。
    return (
      drafts.get(key) ?? activeOverride(message, locale, scope)?.value ?? ''
    );
  }

  function updateDraft(
    message: ReviewMessage,
    locale: string,
    scope: ReviewScope,
    value: string,
  ): void {
    const key = draftKey(message.message, locale, scope);
    if (
      activeOverride(message, locale, scope) &&
      value === reviewBaseline(message, locale, scope)
    ) {
      drafts.delete(key);
      return;
    }
    drafts.set(key, value);
  }

  function clearDraft(mutation: ReviewMutation): void {
    drafts.delete(
      draftKey(mutation.message, mutation.locale, mutationScope(mutation)),
    );
  }

  return { draftFor, updateDraft, clearDraft };
}
