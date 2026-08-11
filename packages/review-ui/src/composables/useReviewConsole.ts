import { computed, readonly, shallowRef } from 'vue';
import type {
  ReviewFilter,
  ReviewMessage,
  ReviewMutation,
  ReviewSnapshot,
} from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

interface ToastState {
  message: string;
  error: boolean;
}

export function useReviewConsole(copy: ReviewCopy) {
  const snapshot = shallowRef<ReviewSnapshot | null>(null);
  const locale = shallowRef('');
  const filter = shallowRef<ReviewFilter>('all');
  const query = shallowRef('');
  const loading = shallowRef(true);
  const toast = shallowRef<ToastState | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const visibleMessages = computed(() =>
    (snapshot.value?.messages ?? []).filter(matches),
  );

  async function load(): Promise<void> {
    try {
      const response = await fetch('/__ai-i18n/api/messages', {
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as ReviewSnapshot & {
        error?: Record<string, string>;
      };
      if (!response.ok) throw apiError(payload);
      snapshot.value = payload;
      if (!payload.locales.some((item) => item.value === locale.value)) {
        locale.value = payload.locales[0]?.value ?? '';
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.failed, true);
    } finally {
      loading.value = false;
    }
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
          ...(mutation.method === 'POST' ? { value: mutation.value } : {}),
        }),
      });
      const payload = (await response.json()) as {
        error?: Record<string, string>;
      };
      if (!response.ok) throw apiError(payload);
      await load();
      showToast(mutation.method === 'POST' ? copy.saved : copy.removed, false);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.failed, true);
      return false;
    }
  }

  function matches(message: ReviewMessage): boolean {
    const reviewed = message.overrides.some(
      (item) => item.locale === locale.value,
    );
    if (filter.value === 'reviewed' && !reviewed) return false;
    if (filter.value === 'unreviewed' && reviewed) return false;
    if (!query.value) return true;
    const haystack = [
      message.message.source,
      message.message.comment ?? '',
      ...message.occurrences.map((item) => item.sourceFile),
    ]
      .join('\n')
      .toLocaleLowerCase();
    return haystack.includes(query.value.trim().toLocaleLowerCase());
  }

  function apiError(payload: { error?: Record<string, string> }): Error {
    const language = document.documentElement.lang.startsWith('zh')
      ? 'zh'
      : 'en';
    return new Error(
      payload.error?.[language] ?? payload.error?.en ?? copy.failed,
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
    query,
    loading: readonly(loading),
    toast: readonly(toast),
    visibleMessages,
    load,
    mutate,
  };
}
