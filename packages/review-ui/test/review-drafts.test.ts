import { describe, expect, it } from 'vitest';
import type { ReviewMessage } from '@ai-i18n/core';
import { useReviewDrafts } from '../src/composables/useReviewDrafts';

const message: ReviewMessage = {
  message: { source: 'Save', comment: 'button' },
  translations: { 'zh-CN': '保存', 'ja-JP': '保存する' },
  overrides: [],
  occurrences: [
    { sourceFile: 'src/dialog.ts', locations: [{ line: 1, column: 1 }] },
  ],
};

describe('review drafts', () => {
  it('keeps independent drafts for locale and scope changes', () => {
    const drafts = useReviewDrafts();

    drafts.updateDraft(message, 'zh-CN', '', '保存更改');
    drafts.updateDraft(message, 'zh-CN', 'src/dialog.ts', '确认');
    drafts.updateDraft(message, 'ja-JP', '', 'セーブ');

    expect(drafts.draftFor(message, 'zh-CN', '')).toBe('保存更改');
    expect(drafts.draftFor(message, 'zh-CN', 'src/dialog.ts')).toBe('确认');
    expect(drafts.draftFor(message, 'ja-JP', '')).toBe('セーブ');
  });

  it('starts without copying the automatic translation into a human draft', () => {
    const drafts = useReviewDrafts();

    expect(drafts.draftFor(message, 'zh-CN', '')).toBe('');
    drafts.updateDraft(message, 'zh-CN', '', '保存');
    expect(drafts.draftFor(message, 'zh-CN', '')).toBe('保存');
  });

  it('drops a draft after completing its mutation', () => {
    const drafts = useReviewDrafts();

    drafts.updateDraft(message, 'zh-CN', '', '保存更改');
    drafts.clearDraft({
      message: message.message,
      locale: 'zh-CN',
      method: 'POST',
      value: '保存更改',
    });
    expect(drafts.draftFor(message, 'zh-CN', '')).toBe('');
  });
});
