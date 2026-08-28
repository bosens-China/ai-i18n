export type ReviewUiLanguagePreference = 'en-US' | 'system' | 'zh-CN';

export type ReviewUiLanguage = Exclude<ReviewUiLanguagePreference, 'system'>;

export const REVIEW_UI_LANGUAGE_STORAGE_KEY = 'ai-i18n.review.language.v1';

export const REVIEW_UI_LANGUAGE_CHANGE_EVENT = 'ai-i18n-review-language-change';

export function parseReviewUiLanguagePreference(
  value: string | null,
): ReviewUiLanguagePreference {
  if (value === 'en-US' || value === 'system' || value === 'zh-CN') {
    return value;
  }
  return 'system';
}

export function resolveReviewUiLanguage(
  preference: ReviewUiLanguagePreference,
  browserLanguage: string,
): ReviewUiLanguage {
  if (preference === 'en-US' || preference === 'zh-CN') return preference;
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function readReviewUiLanguagePreference(): ReviewUiLanguagePreference {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    return parseReviewUiLanguagePreference(
      localStorage.getItem(REVIEW_UI_LANGUAGE_STORAGE_KEY),
    );
  } catch {
    return 'system';
  }
}

export function saveReviewUiLanguagePreference(
  preference: ReviewUiLanguagePreference,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REVIEW_UI_LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // 隐私模式或宿主禁用存储时，当前会话的界面语言仍然可用。
  }
}

export function readResolvedReviewUiLanguage(
  browserLanguage = typeof navigator === 'undefined'
    ? 'en-US'
    : navigator.language,
): ReviewUiLanguage {
  return resolveReviewUiLanguage(
    readReviewUiLanguagePreference(),
    browserLanguage,
  );
}
