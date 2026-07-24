import type { TranslationRequest, Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderCoordinator } from '../src/provider-coordinator';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProviderCoordinator', () => {
  it('uses the default debounce and reuses the same pending request', async () => {
    vi.useFakeTimers();
    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: 'Save',
      })),
    );
    const coordinator = new ProviderCoordinator(translator);
    const request = translationRequest('保存', 'en-US');

    const first = coordinator.request(request);
    const duplicate = coordinator.request(request);
    expect(first).toBe(duplicate);

    await vi.advanceTimersByTimeAsync(99);
    expect(translator).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toBe('Save');
    expect(translator).toHaveBeenCalledTimes(1);
  });

  it('flushes a full batch immediately and keeps locales separate', async () => {
    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: `${request.locale}:${request.source}`,
      })),
    );
    const firstRequest = translationRequest('一', 'en-US');
    const secondRequest = translationRequest('二', 'en-US');
    const coordinator = new ProviderCoordinator(translator, {
      debounceMs: 60_000,
      batchLength: JSON.stringify({
        requests: [firstRequest, secondRequest],
      }).length,
    });

    const first = coordinator.request(firstRequest);
    expect(translator).not.toHaveBeenCalled();
    const second = coordinator.request(secondRequest);
    expect(translator).toHaveBeenCalledTimes(1);
    const third = coordinator.request(translationRequest('三', 'ja-JP'));
    await coordinator.flush();

    await expect(first).resolves.toBe('en-US:一');
    await expect(second).resolves.toBe('en-US:二');
    await expect(third).resolves.toBe('ja-JP:三');
    expect(translator).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(translator)
        .mock.calls.map(([requests]) => [
          requests.length,
          ...new Set(requests.map((request) => request.locale)),
        ]),
    ).toEqual([
      [2, 'en-US'],
      [1, 'ja-JP'],
    ]);
  });

  it('limits concurrent translation batches', async () => {
    let active = 0;
    let peak = 0;
    const translator: Translator = vi.fn<Translator>(async (requests) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: request.source,
      }));
    });
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      maxConcurrency: 2,
    });
    const pending = ['一', '二', '三', '四', '五'].map((source) =>
      coordinator.request(translationRequest(source, 'en-US')),
    );

    await coordinator.flush();
    await Promise.all(pending);

    expect(translator).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });

  it('keeps null and warns when provider results are invalid', async () => {
    const warning = vi.fn();
    const translator: Translator = async () => [
      { messageId: 'unexpected', locale: 'en-US', value: 'Wrong' },
    ];
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      onWarning: warning,
    });

    await expect(
      coordinator.request(translationRequest('保存', 'en-US')),
    ).resolves.toBeNull();
    await coordinator.flush();
    expect(warning).toHaveBeenCalledWith(
      'Translator batch failed; translations remain null.',
    );
  });

  it('reports accumulated provider failures during a strict flush', async () => {
    const coordinator = new ProviderCoordinator(
      async () => {
        throw new Error('sensitive provider response');
      },
      { batchLength: 1, strict: true, onWarning: () => {} },
    );

    await expect(
      coordinator.request(translationRequest('保存', 'en-US')),
    ).resolves.toBeNull();
    await expect(coordinator.flush()).rejects.toThrow(
      '[ai-i18n] translation failed',
    );
  });

  it('raises remaining null translations during a strict flush', async () => {
    const coordinator = new ProviderCoordinator(
      async (requests) =>
        requests.map((request) => ({
          messageId: request.messageId,
          locale: request.locale,
          value: null,
        })),
      { batchLength: 1, strict: true, onWarning: () => {} },
    );

    await expect(
      coordinator.request(translationRequest('保存', 'en-US')),
    ).resolves.toBeNull();
    await expect(coordinator.flush()).rejects.toThrow(
      '[ai-i18n] translation failed',
    );
  });

  it('waits for result persistence before completing flush', async () => {
    let release!: () => void;
    const persisted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onResults = vi.fn(() => persisted);
    const coordinator = new ProviderCoordinator(
      async (requests) =>
        requests.map((request) => ({
          messageId: request.messageId,
          locale: request.locale,
          value: '',
        })),
      { batchLength: 1, onResults },
    );

    const result = coordinator.request(translationRequest('空白', 'en-US'));
    let flushed = false;
    const flush = coordinator.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    release();
    await flush;
    await expect(result).resolves.toBe('');
  });
});

function translationRequest(
  source: string,
  locale: string,
): TranslationRequest {
  return { messageId: source, source, locale };
}
