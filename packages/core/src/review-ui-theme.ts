export type ReviewUiThemePreference = 'dark' | 'light' | 'system';

export type ReviewUiTheme = 'dark' | 'light';

export const REVIEW_UI_THEME_STORAGE_KEY = 'ai-i18n.review.theme.v1';

export const REVIEW_UI_THEME_CHANGE_EVENT = 'ai-i18n-review-theme-change';

export function parseReviewUiThemePreference(
  value: string | null,
): ReviewUiThemePreference {
  if (value === 'dark' || value === 'light' || value === 'system') return value;
  return 'system';
}

export function resolveReviewUiTheme(
  preference: ReviewUiThemePreference,
  prefersDark: boolean,
): ReviewUiTheme {
  if (preference === 'dark' || preference === 'light') return preference;
  return prefersDark ? 'dark' : 'light';
}

export function readReviewUiThemePreference(): ReviewUiThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    return parseReviewUiThemePreference(
      localStorage.getItem(REVIEW_UI_THEME_STORAGE_KEY),
    );
  } catch {
    return 'system';
  }
}

export function saveReviewUiThemePreference(
  preference: ReviewUiThemePreference,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REVIEW_UI_THEME_STORAGE_KEY, preference);
  } catch {
    // 隐私模式或宿主禁用存储时，当前会话的主题仍然可用。
  }
}

export function readResolvedReviewUiTheme(
  prefersDark = typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches,
): ReviewUiTheme {
  return resolveReviewUiTheme(readReviewUiThemePreference(), prefersDark);
}
