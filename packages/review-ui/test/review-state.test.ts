import { describe, expect, it } from 'vitest';
import type { ReviewMessage } from '@ai-i18n/core';
import {
  activeOverride,
  reviewAction,
  reviewBaseline,
} from '../src/review-state';

const message: ReviewMessage = {
  message: { source: 'Save', comment: 'button' },
  translations: { 'zh-CN': '保存' },
  overrides: [{ locale: 'zh-CN', value: '确认', file: 'src/dialog.ts' }],
  occurrences: [
    { sourceFile: 'src/dialog.ts', locations: [{ line: 1, column: 1 }] },
  ],
};

describe('review state', () => {
  it('resolves the baseline for the selected locale and scope', () => {
    expect(reviewBaseline(message, 'zh-CN', '')).toBe('保存');
    expect(reviewBaseline(message, 'zh-CN', 'src/dialog.ts')).toBe('确认');
    expect(reviewBaseline(message, 'ja-JP', '')).toBe('Save');
    expect(activeOverride(message, 'zh-CN', 'src/dialog.ts')?.value).toBe(
      '确认',
    );
  });

  it('distinguishes confirmation, modification, and saved states', () => {
    expect(reviewAction(false, '保存', '保存')).toBe('confirm');
    expect(reviewAction(false, '储存', '保存')).toBe('save');
    expect(reviewAction(true, '确认', '确认')).toBe('saved');
    expect(reviewAction(true, '确定', '确认')).toBe('save');
  });
});
