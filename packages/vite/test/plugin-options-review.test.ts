import { describe, expect, it, vi } from 'vitest';
import { aiI18n, type AiI18nOptions, type Translator } from '../src/index';
import { aiI18nReview } from '../src/review';
import { REVIEW_CLIENT_MODULE_PATH } from '../src/review-page';
import { callHook, options, setupPlugin } from './plugin-test-utils';

describe('@ai-i18n/vite plugin options and Review registration', () => {
  it('validates locale and persistence options', () => {
    const base = { sourceLang: 'zh-CN', locales: options.locales };

    expect(() => aiI18n({ ...base, locales: [] })).toThrow(
      'locales must not be empty',
    );
    expect(() =>
      aiI18n({ ...base, locales: [options.locales[0]!, options.locales[0]!] }),
    ).toThrow('locale values must be unique');
    expect(() => aiI18n({ ...base, sourceLang: 'ja-JP' })).toThrow(
      'sourceLang must match a value in locales',
    );
    expect(() => aiI18n({ ...base, defaultLang: 'ja-JP' })).toThrow(
      'defaultLang must match a value in locales',
    );
    expect(() => aiI18n({ ...base, persist: { key: ' ' } })).toThrow(
      'persist.key must not be empty',
    );
    expect(() =>
      aiI18n({
        ...base,
        translationMemory: { cache: 'remote' as never },
      }),
    ).toThrow(
      'translationMemory.cache must be a valid candidate cache adapter',
    );
    expect(() =>
      aiI18n({
        ...base,
        provider: {
          translator: vi.fn<Translator>(),
          cache: 'always' as 'reuse',
        },
      }),
    ).toThrow('provider.cache must be "reuse" or "fresh"');
  });

  it('rejects a provider without a translator during config resolution', () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');

    expect(() =>
      setupPlugin([], undefined, {
        ...options,
        provider: {} as NonNullable<AiI18nOptions['provider']>,
      }),
    ).toThrow('[ai-i18n] provider.translator must be a function.');
  });

  it('watches protocol files without registering the review plugin', () => {
    const { directory, plugin } = setupPlugin();
    const add = vi.fn();

    callHook(plugin.configureServer, { watcher: { add } });

    expect(add).toHaveBeenCalledWith(directory);
  });

  it('does not inject the review client from the core plugin', async () => {
    const core = setupPlugin();
    const context = { filename: '/workspace/index.html' };

    const result = await callHook<Promise<unknown>>(
      core.plugin.transformIndexHtml,
      '<!doctype html><main></main>',
      context,
    );

    expect(result).toBeUndefined();
  });

  it('injects and loads the framework-neutral client from aiI18nReview()', async () => {
    const { plugin: core } = setupPlugin();
    const plugin = aiI18nReview();
    callHook(plugin.configResolved, {
      command: 'serve',
      plugins: [core, plugin],
    });
    const tags = callHook<Array<{ attrs?: Record<string, string> }>>(
      plugin.transformIndexHtml,
      '<!doctype html><main></main>',
      { filename: '/workspace/index.html' },
    );
    const id = callHook<string>(
      plugin.resolveId,
      'virtual:ai-i18n/review-client',
      '/workspace/index.html',
      {},
    );

    expect(tags).toEqual([
      expect.objectContaining({
        tag: 'script',
        attrs: expect.objectContaining({
          'data-ai-i18n-review': '',
          src: REVIEW_CLIENT_MODULE_PATH,
        }),
      }),
    ]);
    expect(id).toBe('\0virtual:ai-i18n/review-client');
    expect(callHook<string>(plugin.load, id)).toContain(
      'mountReviewOverlay({ workbenchModule:',
    );
  });

  it('can disable the page launcher without disabling Review modules', () => {
    const { plugin: core } = setupPlugin();
    const plugin = aiI18nReview({ launcher: false });
    callHook(plugin.configResolved, {
      command: 'serve',
      plugins: [core, plugin],
    });

    expect(
      callHook(plugin.transformIndexHtml, '<!doctype html><main></main>', {
        filename: '/workspace/index.html',
      }),
    ).toEqual([]);
    expect(
      callHook<string>(plugin.resolveId, 'virtual:ai-i18n/review-client'),
    ).toBe('\0virtual:ai-i18n/review-client');
  });

  it('rejects the removed review option with migration guidance', () => {
    expect(() =>
      aiI18n({ ...options, review: false } as AiI18nOptions),
    ).toThrow('register aiI18nReview() separately');
  });
});
