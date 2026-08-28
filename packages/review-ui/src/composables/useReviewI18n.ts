import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import {
  REVIEW_UI_LANGUAGE_CHANGE_EVENT,
  readResolvedReviewUiLanguage,
  readReviewUiLanguagePreference,
  resolveReviewUiLanguage,
  saveReviewUiLanguagePreference,
  type ReviewUiLanguage,
  type ReviewUiLanguagePreference,
} from '@ai-i18n/core';
import { reviewUiCopy, type ReviewCopy } from '@ai-i18n/core/review-i18n';

export interface ReviewI18nState {
  copy: ComputedRef<ReviewCopy>;
  language: Readonly<ShallowRef<ReviewUiLanguage>>;
  preference: Readonly<ShallowRef<ReviewUiLanguagePreference>>;
  setPreference(preference: ReviewUiLanguagePreference): void;
}

export function useReviewI18n(): ReviewI18nState {
  const preference = shallowRef(readReviewUiLanguagePreference());
  const language = shallowRef(readResolvedReviewUiLanguage());
  const copy = computed<ReviewCopy>(() => reviewUiCopy(language.value));

  function setPreference(next: ReviewUiLanguagePreference): void {
    preference.value = next;
    language.value = resolveReviewUiLanguage(
      next,
      typeof navigator === 'undefined' ? 'en-US' : navigator.language,
    );
    saveReviewUiLanguagePreference(next);
    if (typeof document !== 'undefined') {
      document.dispatchEvent(
        new CustomEvent(REVIEW_UI_LANGUAGE_CHANGE_EVENT, {
          detail: { language: language.value, preference: next },
        }),
      );
    }
  }

  return { copy, language, preference, setPreference };
}
