import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderCoordinator,
  type ProviderRequest,
} from '../src/provider-coordinator';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProviderCoordinator', () => {
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

  it('groups messages by their exact missing locale set', async () => {
    const translator = echoTranslator();
    const coordinator = new ProviderCoordinator(translator, {
      debounceMs: 60_000,
    });

    const japaneseOnly = coordinator.request(
      translationRequest('旧文案', ['ja-JP']),
    );
    const bilingual = coordinator.request(
      translationRequest('新增文案', ['en-US', 'ja-JP']),
    );
    await coordinator.flush();

    await Promise.all([japaneseOnly, bilingual]);
    expect(translator).toHaveBeenCalledTimes(2);
    expect(vi.mocked(translator).mock.calls.map(([batch]) => batch)).toEqual([
      { locales: ['ja-JP'], messages: [{ source: '旧文案' }] },
      {
        locales: ['en-US', 'ja-JP'],
        messages: [{ source: '新增文案' }],
      },
    ]);
  });

  it('keeps successful locale groups when another group fails', async () => {
    const onResults = vi.fn();
    const translator: Translator = vi.fn<Translator>(
      async ({ locales, messages }) => {
        if (locales.length === 1) throw new Error('ja unavailable');
        return messages.map(({ source }) =>
          Object.fromEntries(
            locales.map((locale) => [locale, `${locale}:${source}`]),
          ),
        );
      },
    );
    const coordinator = new ProviderCoordinator(translator, {
      debounceMs: 60_000,
      onResults,
      onWarning: () => {},
    });

    const failed = coordinator.request(translationRequest('旧文案', ['ja-JP']));
    const succeeded = coordinator.request(
      translationRequest('新增文案', ['en-US', 'ja-JP']),
    );
    await coordinator.flush();

    await expect(failed).resolves.toEqual([
      { messageId: '旧文案', locale: 'ja-JP', value: null },
    ]);
    await expect(succeeded).resolves.toEqual([
      { messageId: '新增文案', locale: 'en-US', value: 'en-US:新增文案' },
      { messageId: '新增文案', locale: 'ja-JP', value: 'ja-JP:新增文案' },
    ]);
    expect(onResults).toHaveBeenCalledOnce();
  });

  it('limits concurrent translation batches', async () => {
    let active = 0;
    let peak = 0;
    const translator: Translator = vi.fn<Translator>(
      async ({ locales, messages }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return messages.map(({ source }) => ({ [locales[0]!]: source }));
      },
    );
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      maxConcurrency: 2,
    });
    const pending = ['一', '二', '三', '四', '五'].map((source) =>
      coordinator.request(translationRequest(source, ['en-US'])),
    );

    await coordinator.flush();
    await Promise.all(pending);

    expect(translator).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });

  it('keeps null and warns when provider results are invalid', async () => {
    const warning = vi.fn();
    const coordinator = new ProviderCoordinator(
      async () => [{ unexpected: 'Wrong' }],
      { batchLength: 1, onWarning: warning },
    );

    await expect(
      coordinator.request(translationRequest('保存', ['en-US'])),
    ).resolves.toEqual([{ messageId: '保存', locale: 'en-US', value: null }]);
    await coordinator.flush();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Translator batch failed; this batch remains null.',
      ),
    );
  });

  it('rejects provider results that change template tokens', async () => {
    const warning = vi.fn();
    const coordinator = new ProviderCoordinator(
      async () => [{ 'en-US': 'Syntax {{0}}; current {{0}}' }],
      { batchLength: 1, onWarning: warning },
    );

    await coordinator.request(
      translationRequest('语法 {{=0}}，当前 {{0}}', ['en-US']),
    );
    await coordinator.flush();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Translator batch failed; this batch remains null.',
      ),
    );
  });

  it('reports failures and remaining null values only in strict mode', async () => {
    const failed = new ProviderCoordinator(
      async () => {
        throw new Error('sensitive provider response');
      },
      { batchLength: 1, strict: true, onWarning: () => {} },
    );
    await failed.request(translationRequest('保存', ['en-US']));
    await expect(failed.flush()).rejects.toThrow(
      '[ai-i18n] Translation failed.',
    );

    const missing = new ProviderCoordinator(async () => [{ 'en-US': null }], {
      batchLength: 1,
      strict: true,
      onWarning: () => {},
    });
    await missing.request(translationRequest('保存', ['en-US']));
    await expect(missing.flush()).rejects.toThrow(
      '[ai-i18n] Translation failed.',
    );
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

  it('waits for result persistence before completing flush', async () => {
    let release!: () => void;
    const persisted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onResults = vi.fn(() => persisted);
    const coordinator = new ProviderCoordinator(async () => [{ 'en-US': '' }], {
      batchLength: 1,
      onResults,
    });

    const result = coordinator.request(translationRequest('空白', ['en-US']));
    let flushed = false;
    const flush = coordinator.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    release();
    await flush;
    await expect(result).resolves.toEqual([
      { messageId: '空白', locale: 'en-US', value: '' },
    ]);
  });
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
