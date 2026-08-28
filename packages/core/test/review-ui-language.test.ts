import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseReviewUiLanguagePreference,
  readReviewUiLanguagePreference,
  resolveReviewUiLanguage,
  saveReviewUiLanguagePreference,
} from '../src/review-ui-language.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('review UI language', () => {
  it('parses persisted language preferences safely', () => {
    expect(parseReviewUiLanguagePreference(null)).toBe('system');
    expect(parseReviewUiLanguagePreference('en-US')).toBe('en-US');
    expect(parseReviewUiLanguagePreference('zh-CN')).toBe('zh-CN');
    expect(parseReviewUiLanguagePreference('system')).toBe('system');
    expect(parseReviewUiLanguagePreference('invalid')).toBe('system');
  });

  it('resolves system language from the browser language', () => {
    expect(resolveReviewUiLanguage('en-US', 'zh-CN')).toBe('en-US');
    expect(resolveReviewUiLanguage('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveReviewUiLanguage('system', 'zh-TW')).toBe('zh-CN');
    expect(resolveReviewUiLanguage('system', 'en-GB')).toBe('en-US');
  });

  it('persists the explicit preference without assuming storage is available', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    saveReviewUiLanguagePreference('zh-CN');

    expect(readReviewUiLanguagePreference()).toBe('zh-CN');
  });
});
