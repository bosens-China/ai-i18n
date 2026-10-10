import { onScopeDispose, shallowRef, watch } from 'vue';
import type {
  ReviewMessageReference,
  TranslationMemoryCandidatePage,
} from '@ai-i18n/core';

export function useReviewCandidates(
  message: () => ReviewMessageReference,
  locale: () => string,
) {
  const page = shallowRef<TranslationMemoryCandidatePage>({
    candidates: [],
    hasMore: false,
  });
  const loading = shallowRef(false);
  const failed = shallowRef(false);
  let controller: AbortController | undefined;
  let sequence = 0;
  let offset = 0;

  async function load(
    mode: 'reset' | 'more' | 'sources' = 'reset',
    value?: string,
  ) {
    controller?.abort();
    controller = new AbortController();
    const request = ++sequence;
    loading.value = true;
    failed.value = false;
    const nextOffset = mode === 'more' ? offset + 10 : 0;
    const candidate = page.value.candidates.find(
      (item) => item.value === value,
    );
    const search = new URLSearchParams({
      message: JSON.stringify(message()),
      locale: locale(),
      offset: String(nextOffset),
    });
    if (mode === 'sources' && candidate) {
      search.set('value', candidate.value);
      search.set('source_offset', String(candidate.sources.length));
    }
    try {
      const response = await fetch(`/__ai-i18n/api/candidates?${search}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('CACHE_UNAVAILABLE');
      const result = (await response.json()) as TranslationMemoryCandidatePage;
      if (request !== sequence) return;
      if (mode === 'sources' && candidate) {
        page.value = {
          ...page.value,
          candidates: page.value.candidates.map((item) =>
            item.value === value
              ? {
                  ...item,
                  sources: [
                    ...item.sources,
                    ...(result.candidates[0]?.sources ?? []),
                  ],
                  sourcesHasMore: result.candidates[0]?.sourcesHasMore ?? false,
                }
              : item,
          ),
        };
      } else {
        page.value = {
          ...result,
          candidates:
            mode === 'more'
              ? [...page.value.candidates, ...result.candidates]
              : result.candidates,
        };
        offset = nextOffset;
      }
    } catch {
      if (request === sequence && !controller.signal.aborted)
        failed.value = true;
    } finally {
      if (request === sequence) loading.value = false;
    }
  }

  watch(
    () => JSON.stringify([message(), locale()]),
    () => {
      page.value = { candidates: [], hasMore: false };
      offset = 0;
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    sequence++;
    controller?.abort();
  });
  return { page, loading, failed, load };
}
