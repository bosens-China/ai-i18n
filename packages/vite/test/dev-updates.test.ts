import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevUpdateSender } from '../src/dev-updates';
import { ProjectState } from '../src/project-state';

const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Dev untranslated summary', () => {
  it('reports deduplicated missing counts for modules discovered so far', async () => {
    vi.useFakeTimers();
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    const state = new ProjectState('/workspace', options);
    state.update(
      "import { t } from 'virtual:ai-i18n'; t('首页')",
      '/workspace/src/main.ts',
    );
    state.update(
      "import { t } from 'virtual:ai-i18n'; t('首页'); t('设置')",
      '/workspace/src/settings.ts',
    );
    const report = vi.fn();
    const updates = createDevUpdateSender({
      options,
      state: () => state,
      hot: () => undefined,
      coordinator: () => undefined,
      reportMissingTranslations: report,
      translationEvent: 'translation',
      localeEvent: 'locale',
    });

    updates.requestMissingTranslations(['src/main.ts', 'src/settings.ts']);
    await vi.advanceTimersByTimeAsync(100);

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('en-US 2 条、ja-JP 2 条'),
    );

    updates.requestMissingTranslations(['src/main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenCalledOnce();
    updates.dispose();
  });
});
