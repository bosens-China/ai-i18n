import { computed, readonly, shallowRef, type Ref } from 'vue';
import type { ReviewUiLanguage } from '@ai-i18n/core';
import type {
  ReviewMessage,
  ReviewMutation,
  ReviewSnapshot,
} from '@ai-i18n/core';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';
import { matchesReviewFileSuffix, reviewFileSuffixes } from '../review-files';
import type { ReviewWorkbenchFilter } from '../review-state';
import { validateTokens } from '../tokens';

interface ToastState {
  message: string;
  error: boolean;
}

interface ReviewLoadOptions {
  silent?: boolean;
}

const REVIEW_REFRESH_INTERVAL_MS = 1_000;

export function useReviewConsole(
  copy: Readonly<Ref<ReviewCopy>>,
  interfaceLanguage: Readonly<Ref<ReviewUiLanguage>>,
) {
  const snapshot = shallowRef<ReviewSnapshot | null>(null);
  const locale = shallowRef('');
  const filter = shallowRef<ReviewWorkbenchFilter>('all');
  const fileSuffix = shallowRef('');
  const query = shallowRef('');
  const loading = shallowRef(true);
  const toast = shallowRef<ToastState | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let requestSequence = 0;

  const searchableMessages = computed(() =>
    (snapshot.value?.messages ?? []).map((message) => ({
      message,
      searchText: [
        message.message.source,
        message.message.comment ?? '',
        message.translations[locale.value] ?? '',
        ...message.overrides
          .filter((item) => item.locale === locale.value)
          .map((item) => item.value),
        ...message.occurrences.map((item) => item.sourceFile),
      ]
        .join('\n')
        .toLocaleLowerCase(),
    })),
  );
  const visibleMessages = computed(() =>
    searchableMessages.value
      .filter(({ message, searchText }) => matches(message, searchText))
      .map(({ message }) => message),
  );
  const fileSuffixes = computed(() =>
    reviewFileSuffixes(snapshot.value?.messages ?? []),
  );
  const confirmedCount = computed(
    () =>
      (snapshot.value?.messages ?? []).filter((message) =>
        message.overrides.some((item) => item.locale === locale.value),
      ).length,
  );

  async function load({
    silent = false,
  }: ReviewLoadOptions = {}): Promise<void> {
    const request = ++requestSequence;
    try {
      const response = await fetch('/__ai-i18n/api/messages', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as ReviewSnapshot & {
        error?: Record<string, string>;
      };
      if (!response.ok) throw apiError(payload);
      if (request !== requestSequence) return;
      snapshot.value = payload;
      if (fileSuffix.value && !fileSuffixes.value.includes(fileSuffix.value)) {
        fileSuffix.value = '';
      }
      if (!payload.locales.some((item) => item.value === locale.value)) {
        locale.value = payload.locales[0]?.value ?? '';
      }
    } catch (error) {
      if (!silent && request === requestSequence) {
        showToast(
          error instanceof Error ? error.message : copy.value.reviewDataFailed,
          true,
        );
      }
    } finally {
      loading.value = false;
    }
  }

  function startAutoRefresh(): () => void {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    };
    const timer = window.setInterval(refresh, REVIEW_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }

  async function mutate(mutation: ReviewMutation): Promise<boolean> {
    try {
      const response = await fetch('/__ai-i18n/api/overrides', {
        method: mutation.method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: mutation.message,
          locale: mutation.locale,
          ...(mutation.file ? { file: mutation.file } : {}),
          ...(mutation.location ? { location: mutation.location } : {}),
          ...(mutation.method === 'POST' ? { value: mutation.value } : {}),
        }),
      });
      const payload = (await response.json()) as {
        error?: Record<string, string>;
      };
      if (!response.ok) throw apiError(payload);
      await load();
      showToast(
        mutation.method === 'POST' ? copy.value.saved : copy.value.removed,
        false,
      );
      return true;
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : copy.value.reviewDataFailed,
        true,
      );
      return false;
    }
  }

  function matches(message: ReviewMessage, searchText: string): boolean {
    const reviewed = message.overrides.some(
      (item) => item.locale === locale.value,
    );
    if (filter.value === 'reviewed' && !reviewed) return false;
    if (filter.value === 'unreviewed' && reviewed) return false;
    if (
      filter.value === 'token-error' &&
      !hasTokenError(message, locale.value)
    ) {
      return false;
    }
    if (!matchesReviewFileSuffix(message, fileSuffix.value)) return false;
    const normalizedQuery = query.value.trim().toLocaleLowerCase();
    return !normalizedQuery || searchText.includes(normalizedQuery);
  }

  function apiError(payload: { error?: Record<string, string> }): Error {
    const language = interfaceLanguage.value === 'zh-CN' ? 'zh' : 'en';
    return new Error(
      payload.error?.[language] ??
        payload.error?.en ??
        copy.value.reviewDataFailed,
    );
  }

  function showToast(message: string, error: boolean): void {
    toast.value = { message, error };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = null;
    }, 4200);
  }

  return {
    snapshot: readonly(snapshot),
    locale,
    filter,
    fileSuffix,
    query,
    loading: readonly(loading),
    toast: readonly(toast),
    visibleMessages,
    fileSuffixes,
    confirmedCount,
    load,
    startAutoRefresh,
    mutate,
  };
}

function hasTokenError(message: ReviewMessage, locale: string): boolean {
  const translation = message.translations[locale];
  return (
    translation !== null && !validateTokens(message.message.source, translation)
  );
}
