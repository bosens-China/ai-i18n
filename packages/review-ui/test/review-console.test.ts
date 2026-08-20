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

  it('sends the selected line and column with an occurrence mutation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      documentElement: { lang: 'en' },
    });
    const review = useReviewConsole(copy);

    await review.mutate({
      method: 'POST',
      message: { source: '保存' },
      locale: 'en-US',
      file: 'src/page.ts',
      location: { line: 8, column: 20 },
      value: 'Save here',
    });

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      message: { source: '保存' },
      locale: 'en-US',
      file: 'src/page.ts',
      location: { line: 8, column: 20 },
      value: 'Save here',
    });
  });
});
