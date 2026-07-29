import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderCoordinator,
  type ProviderRequest,
} from '../src/provider-coordinator';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProviderCoordinator request races', () => {
  it('uses the default debounce and reuses the same pending request', async () => {
    vi.useFakeTimers();
    const translator = echoTranslator();
    const coordinator = new ProviderCoordinator(translator);
    const request = translationRequest('保存', ['en-US']);

    const first = coordinator.request(request);
    const duplicate = coordinator.request(request);
    expect(first).toBe(duplicate);

    await vi.advanceTimersByTimeAsync(99);
    expect(translator).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual([
      { messageId: '保存', locale: 'en-US', value: 'en-US:保存' },
    ]);
    expect(translator).toHaveBeenCalledOnce();
  });

  it('replaces a queued request when its source changes', async () => {
    const translator = echoTranslator();
    const coordinator = new ProviderCoordinator(translator, {
      debounceMs: 60_000,
    });
    const first = coordinator.request({
      ...translationRequest('旧文案', ['en-US']),
      messageId: 'stable',
    });
    const latest = coordinator.request({
      ...translationRequest('新文案', ['en-US']),
      messageId: 'stable',
    });

    expect(first).toBe(latest);
    await coordinator.flush();
    await expect(latest).resolves.toEqual([
      { messageId: 'stable', locale: 'en-US', value: 'en-US:新文案' },
    ]);
    expect(translator).toHaveBeenCalledWith({
      locales: ['en-US'],
      messages: [{ source: '新文案' }],
    });
  });

  it('does not persist a superseded in-flight result', async () => {
    const releases: Array<() => void> = [];
    const translator: Translator = vi.fn<Translator>(
      ({ locales, messages }) =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve(
              messages.map(({ source }) =>
                Object.fromEntries(
                  locales.map((locale) => [locale, `${locale}:${source}`]),
                ),
              ),
            ),
          );
        }),
    );
    const onResults = vi.fn();
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      onResults,
    });
    const first = coordinator.request({
      ...translationRequest('旧文案', ['en-US']),
      messageId: 'stable',
    });
    const latest = coordinator.request({
      ...translationRequest('新文案', ['en-US']),
      messageId: 'stable',
    });

    releases[0]!();
    await expect(first).resolves.toEqual([
      { messageId: 'stable', locale: 'en-US', value: 'en-US:旧文案' },
    ]);
    expect(onResults).not.toHaveBeenCalled();
    releases[1]!();
    await expect(latest).resolves.toEqual([
      { messageId: 'stable', locale: 'en-US', value: 'en-US:新文案' },
    ]);
    await coordinator.flush();
    expect(onResults).toHaveBeenCalledOnce();
  });

  it.each(['older result', 'latest failure'] as const)(
    'persists still-missing locales when the %s settles first',
    async (firstSettlement) => {
      const releases: Array<() => void> = [];
      const translator: Translator = vi.fn<Translator>(
        ({ locales, messages }) =>
          new Promise((resolve, reject) => {
            if (releases.length) {
              releases.push(() => reject(new Error('ja unavailable')));
              return;
            }
            releases.push(() =>
              resolve(
                messages.map(({ source }) =>
                  Object.fromEntries(
                    locales.map((locale) => [locale, `${locale}:${source}`]),
                  ),
                ),
              ),
            );
          }),
      );
      const onResults = vi.fn();
      const coordinator = new ProviderCoordinator(translator, {
        batchLength: 1,
        onResults,
        onWarning: () => {},
      });
      const first = coordinator.request({
        ...translationRequest('文案', ['en-US', 'ja-JP']),
        messageId: 'stable',
      });
      const latest = coordinator.request({
        ...translationRequest('文案', ['ja-JP']),
        messageId: 'stable',
      });

      if (firstSettlement === 'latest failure') {
        releases[1]!();
        await latest;
        expect(onResults).not.toHaveBeenCalled();
        releases[0]!();
        await first;
      } else {
        releases[0]!();
        await first;
        releases[1]!();
        await latest;
      }

      expect(onResults).toHaveBeenCalledWith([
        { messageId: 'stable', locale: 'ja-JP', value: 'ja-JP:文案' },
      ]);
      await coordinator.flush();
      expect(onResults).toHaveBeenCalledOnce();
    },
  );

  it('reuses a matching older request after the latest request settles', async () => {
    const releases: Array<() => void> = [];
    const translator: Translator = vi.fn<Translator>(
      ({ locales, messages }) =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve(
              messages.map(({ source }) =>
                Object.fromEntries(
                  locales.map((locale) => [locale, `${locale}:${source}`]),
                ),
              ),
            ),
          );
        }),
    );
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
    });
    const olderRequest = {
      ...translationRequest('文案', ['en-US', 'ja-JP']),
      messageId: 'stable',
    };
    const older = coordinator.request(olderRequest);
    const latest = coordinator.request({
      ...translationRequest('文案', ['ja-JP']),
      messageId: 'stable',
    });

    releases[1]!();
    await latest;
    expect(coordinator.request(olderRequest)).toBe(older);
    expect(translator).toHaveBeenCalledTimes(2);
    releases[0]!();
    await older;
    await coordinator.flush();
  });

  it.each(['older', 'latest'] as const)(
    'does not fail strict mode when a %s null is later recovered',
    async (nullResult) => {
      const releases: Array<() => void> = [];
      const onResults = vi.fn();
      const warning = vi.fn();
      const translator: Translator = ({ locales }) =>
        new Promise((resolve) => {
          const isOlder = locales.length === 2;
          const value =
            (isOlder && nullResult === 'older') ||
            (!isOlder && nullResult === 'latest')
              ? null
              : 'Recovered';
          releases.push(() =>
            resolve([
              isOlder ? { 'en-US': 'Old', 'ja-JP': value } : { 'ja-JP': value },
            ]),
          );
        });
      const coordinator = new ProviderCoordinator(translator, {
        batchLength: 1,
        strict: true,
        onResults,
        onWarning: warning,
      });
      const older = coordinator.request({
        ...translationRequest('文案', ['en-US', 'ja-JP']),
        messageId: 'stable',
      });
      const latest = coordinator.request({
        ...translationRequest('文案', ['ja-JP']),
        messageId: 'stable',
      });

      const nullIndex = nullResult === 'older' ? 0 : 1;
      releases[nullIndex]!();
      await (nullIndex === 0 ? older : latest);
      releases[1 - nullIndex]!();
      await (nullIndex === 0 ? latest : older);

      await expect(coordinator.flush()).resolves.toBeUndefined();
      expect(warning).not.toHaveBeenCalled();
      expect(onResults).toHaveBeenLastCalledWith([
        { messageId: 'stable', locale: 'ja-JP', value: 'Recovered' },
      ]);
    },
  );
});

function echoTranslator() {
  return vi.fn<Translator>(async ({ locales, messages }) =>
    messages.map(({ source }) =>
      Object.fromEntries(
        locales.map((locale) => [locale, `${locale}:${source}`]),
      ),
    ),
  );
}

function translationRequest(
  source: string,
  locales: readonly string[],
): ProviderRequest {
  return { messageId: source, source, locales };
}
