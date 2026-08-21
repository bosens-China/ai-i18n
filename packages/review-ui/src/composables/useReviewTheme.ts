import {
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
  type ShallowRef,
} from 'vue';
import {
  REVIEW_UI_THEME_CHANGE_EVENT,
  readResolvedReviewUiTheme,
  readReviewUiThemePreference,
  resolveReviewUiTheme,
  saveReviewUiThemePreference,
  type ReviewUiTheme,
  type ReviewUiThemePreference,
} from '@ai-i18n/core';

export interface ReviewThemeState {
  preference: ShallowRef<ReviewUiThemePreference>;
  resolved: ShallowRef<ReviewUiTheme>;
  setPreference(preference: ReviewUiThemePreference): void;
}

function applyThemeToRoot(root: HTMLElement, theme: ReviewUiTheme): void {
  root.dataset.theme = theme;
  const rootNode = root.getRootNode();
  if (rootNode instanceof ShadowRoot) {
    const host = rootNode.host;
    if (host instanceof HTMLElement) host.dataset.theme = theme;
  }
}

export function useReviewTheme(root: HTMLElement): ReviewThemeState {
  const preference = shallowRef(readReviewUiThemePreference());
  const resolved = shallowRef(readResolvedReviewUiTheme());
  let media: MediaQueryList | undefined;

  function syncResolved(): void {
    const next = resolveReviewUiTheme(
      preference.value,
      media?.matches ?? readResolvedReviewUiTheme() === 'dark',
    );
    resolved.value = next;
    applyThemeToRoot(root, next);
    if (typeof document !== 'undefined') {
      document.dispatchEvent(
        new CustomEvent(REVIEW_UI_THEME_CHANGE_EVENT, {
          detail: { preference: preference.value, theme: next },
        }),
      );
    }
  }

  function setPreference(next: ReviewUiThemePreference): void {
    preference.value = next;
    saveReviewUiThemePreference(next);
  }

  function onSystemThemeChange(): void {
    if (preference.value === 'system') syncResolved();
  }

  onMounted(() => {
    if (typeof globalThis.matchMedia === 'function') {
      media = globalThis.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', onSystemThemeChange);
    }
  });

  onUnmounted(() => {
    media?.removeEventListener('change', onSystemThemeChange);
  });

  watch(preference, syncResolved, { immediate: true });

  return { preference, resolved, setPreference };
}
