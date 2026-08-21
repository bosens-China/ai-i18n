import { describe, expect, it } from 'vitest';
import {
  parseReviewUiThemePreference,
  resolveReviewUiTheme,
} from '../src/review-ui-theme.js';

describe('review UI theme', () => {
  it('parses persisted theme preferences safely', () => {
    expect(parseReviewUiThemePreference(null)).toBe('system');
    expect(parseReviewUiThemePreference('dark')).toBe('dark');
    expect(parseReviewUiThemePreference('light')).toBe('light');
    expect(parseReviewUiThemePreference('system')).toBe('system');
    expect(parseReviewUiThemePreference('invalid')).toBe('system');
  });

  it('resolves system preference to a concrete theme', () => {
    expect(resolveReviewUiTheme('dark', false)).toBe('dark');
    expect(resolveReviewUiTheme('light', true)).toBe('light');
    expect(resolveReviewUiTheme('system', true)).toBe('dark');
    expect(resolveReviewUiTheme('system', false)).toBe('light');
  });
});
