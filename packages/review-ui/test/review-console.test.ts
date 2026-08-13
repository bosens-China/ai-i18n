import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSnapshot } from '@ai-i18n/core';
import type { ReviewCopy } from '../src/copy';
import { useReviewConsole } from '../src/composables/useReviewConsole';

const copy = {
  failed: 'failed',
  saved: 'saved',
  removed: 'removed',
} as ReviewCopy;

const snapshot: ReviewSnapshot = {
  sourceLang: 'zh-CN',
  locales: [{ value: 'en-US', label: 'English' }],
  messages: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('review console refresh', () => {
  it('refreshes visible review data and stops polling on cleanup', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      documentElement: { lang: 'en' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('window', {
      setInterval,
      clearInterval,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const review = useReviewConsole(copy);
    const stop = review.startAutoRefresh();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(review.snapshot.value).toEqual(snapshot);

    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
