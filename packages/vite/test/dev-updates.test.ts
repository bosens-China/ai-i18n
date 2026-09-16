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
    const report = vi.fn();
    const updates = createDevUpdateSender({
      options,
      state: () => state,
      hot: () => undefined,
      moduleGraph: () => undefined,
      coordinator: () => undefined,
      providerCache: 'reuse',
      reportMissingTranslations: report,
      translationEvent: 'translation',
      localeEvent: 'locale',
    });

    updates.requestMissingTranslations(['src/main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenLastCalledWith(
      expect.stringContaining('en-US 1 条、ja-JP 1 条'),
    );

    state.update(
      "import { t } from 'virtual:ai-i18n'; t('首页'); t('设置')",
      '/workspace/src/settings.ts',
    );
    updates.requestMissingTranslations(['src/settings.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenLastCalledWith(
      expect.stringContaining('en-US 2 条、ja-JP 2 条'),
    );

    state.update(
      "import { t } from 'virtual:ai-i18n'; t('其他')",
      '/workspace/src/other.ts',
    );
    updates.requestMissingTranslations(['src/other.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenLastCalledWith(
      expect.stringContaining('en-US 3 条、ja-JP 3 条'),
    );
    updates.requestMissingTranslations(['src/main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenCalledTimes(3);

    state.applyTranslations([
      { messageId: '首页', locale: 'en-US', value: 'Home' },
    ]);
    updates.requestMissingTranslations(['src/main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(report).toHaveBeenLastCalledWith(
      expect.stringContaining('en-US 2 条、ja-JP 3 条'),
    );
    updates.dispose();
  });

  it('queries missing occurrences without consuming Provider attempts', () => {
    const state = new ProjectState('/workspace', options);
    state.updateExtracted('', '/workspace/src/main.ts', [
      {
        id: '保存',
        source: '保存',
        locations: [
          { line: 1, column: 0 },
          { line: 2, column: 0 },
        ],
      },
    ]);
    const expected = [
      { messageId: '保存', source: '保存', locales: ['en-US', 'ja-JP'] },
    ];
    expect(state.missingTranslations('src/main.ts')).toEqual(expected);
    expect(state.missingTranslations('src/main.ts')).toEqual(expected);
    expect(state.requestTranslations('src/main.ts')).toEqual(expected);
    expect(state.requestTranslations('src/main.ts')).toEqual([]);
    expect(state.missingTranslations('src/main.ts')).toEqual(expected);

    const rule = {
      source: '保存',
      translations: { 'en-US': '' },
      occurrences: [{ file: 'src/main.ts', line: 1, column: 0 }],
    };
    state.hydrateOverrides({ version: 2, rules: [rule] });
    expect(state.missingTranslations('src/main.ts')).toEqual(expected);
    state.hydrateOverrides({
      version: 2,
      rules: [
        {
          ...rule,
          occurrences: [
            ...rule.occurrences,
            { file: 'src/main.ts', line: 2, column: 0 },
          ],
        },
      ],
    });
    expect(state.missingTranslations('src/main.ts')).toEqual([
      { messageId: '保存', source: '保存', locales: ['ja-JP'] },
    ]);
    state.hydrateOverrides({
      version: 2,
      rules: [
        {
          source: '保存',
          files: ['src/main.ts'],
          translations: { 'en-US': 'Save' },
        },
        { source: '保存', translations: { 'ja-JP': '保存する' } },
      ],
    });
    expect(state.missingTranslations('src/main.ts')).toEqual([]);
  });
});
