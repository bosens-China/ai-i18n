import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_UI_LANGUAGE_STORAGE_KEY } from '@ai-i18n/core';
import { useReviewI18n } from '../src/composables/useReviewI18n';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('review i18n', () => {
  it('reactively switches the complete local copy set', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('navigator', { language: 'en-US' });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('document', { dispatchEvent: vi.fn() });

    const i18n = useReviewI18n();

    expect(i18n.copy.value.settingsLabel).toBe('Workbench settings');
    expect(i18n.copy.value.remainingSummary(1)).toBe('1 remaining');

    i18n.setPreference('zh-CN');

    expect(i18n.copy.value.settingsLabel).toBe('工作台设置');
    expect(i18n.copy.value.remainingSummary(3)).toBe('3 条待确认');
    expect(values.get(REVIEW_UI_LANGUAGE_STORAGE_KEY)).toBe('zh-CN');
  });
});
