import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, expect, test, vi } from 'vitest';
import { useReviewCandidates } from '../src/composables/useReviewCandidates';

afterEach(() => vi.unstubAllGlobals());
const page = (value: string) => ({
  candidates: [{ value, sources: [], sourcesHasMore: false }],
  hasMore: false,
});
const tick = async () => {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
};

test('discards old message responses and never applies a suggestion itself', async () => {
  let resolveOld!: (value: unknown) => void;
  const fetch = vi
    .fn()
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    )
    .mockResolvedValue({ ok: true, json: async () => page('Cancel') });
  vi.stubGlobal('fetch', fetch);
  const message = shallowRef({ source: '保存' });
  const scope = effectScope();
  const state = scope.run(() =>
    useReviewCandidates(
      () => message.value,
      () => 'en-US',
    ),
  )!;
  message.value = { source: '取消' };
  await tick();
  resolveOld({ ok: true, json: async () => page('Save') });
  await tick();
  expect(state.page.value.candidates[0]?.value).toBe('Cancel');
  expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
  scope.stop();
});

test('recovers failed requests and appends candidate pages', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...page('Save'), hasMore: true }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => page('Store') });
  vi.stubGlobal('fetch', fetch);
  const scope = effectScope();
  const state = scope.run(() =>
    useReviewCandidates(
      () => ({ source: '保存' }),
      () => 'en-US',
    ),
  )!;
  await tick();
  expect(state.failed.value).toBe(true);
  await state.load();
  expect(state.failed.value).toBe(false);
  await state.load('more');
  expect(state.page.value.candidates.map((item) => item.value)).toEqual([
    'Save',
    'Store',
  ]);
  expect(String(fetch.mock.calls[2]![0])).toContain('offset=10');
  scope.stop();
});
