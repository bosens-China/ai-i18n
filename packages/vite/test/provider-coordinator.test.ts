import type { Translator } from '@ai-i18n/core';
import { describe, expect, it, vi } from 'vitest';
import {
  ProviderCoordinator,
  type ProviderRequest,
} from '../src/provider-coordinator';

describe('ProviderCoordinator', () => {
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
      {
        batchId: expect.any(String),
        logging: false,
        locales: ['ja-JP'],
        messages: [{ source: '旧文案' }],
      },
      {
        batchId: expect.any(String),
        logging: false,
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

  it('reports scheduling and failure with the translator batch ID', async () => {
    const reportBatchEvent = vi.fn();
    const translator: Translator = vi.fn<Translator>(async () => {
      throw new Error('provider unavailable');
    });
    translator.reportBatchEvent = reportBatchEvent;
    const logging = '/tmp/ai-i18n-test-logs';
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      logging,
      onWarning: () => {},
    });

    await coordinator.request(translationRequest('保存', ['en-US']));
    await coordinator.flush();

    const batchId = vi.mocked(translator).mock.calls[0]![0].batchId;
    expect(batchId).toEqual(expect.any(String));
    expect(reportBatchEvent.mock.calls.map(([event]) => event)).toEqual([
      {
        batchId,
        stage: 'scheduled',
        logging,
        locales: ['en-US'],
        messageCount: 1,
      },
      {
        batchId,
        stage: 'failed',
        logging,
        locales: ['en-US'],
        messageCount: 1,
        reason: 'provider unavailable',
      },
    ]);
  });

  it('keeps translating when the batch trace receiver fails', async () => {
    const warning = vi.fn();
    const translator = echoTranslator();
    translator.reportBatchEvent = vi.fn(async () => {
      throw new Error('trace unavailable');
    });
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
      logging: '/tmp/ai-i18n-test-logs',
      onWarning: warning,
    });

    await expect(
      coordinator.request(translationRequest('保存', ['en-US'])),
    ).resolves.toEqual([
      { messageId: '保存', locale: 'en-US', value: 'en-US:保存' },
    ]);
    await expect(coordinator.flush()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Translation batch tracing failed; translation will continue.',
      ),
    );
  });

  it('disables logging by default without reporting lifecycle events', async () => {
    const translator = echoTranslator();
    translator.reportBatchEvent = vi.fn();
    const coordinator = new ProviderCoordinator(translator, {
      batchLength: 1,
    });

    await coordinator.request(translationRequest('保存', ['en-US']));
    await coordinator.flush();

    expect(translator).toHaveBeenCalledWith({
      batchId: expect.any(String),
      logging: false,
      locales: ['en-US'],
      messages: [{ source: '保存' }],
    });
    expect(translator.reportBatchEvent).not.toHaveBeenCalled();
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
