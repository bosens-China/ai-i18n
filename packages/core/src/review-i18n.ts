import type { ReviewUiLanguage } from './review-ui-language.js';
import { enUSReviewCopy } from './review-i18n/messages/en-US.js';
import { zhCNReviewCopy } from './review-i18n/messages/zh-CN.js';

export type {
  ReviewCopy,
  ReviewCopyTextKey,
  ReviewProgressSummary,
} from './review-i18n/types.js';

export function reviewUiCopy(language: ReviewUiLanguage) {
  return language === 'zh-CN' ? zhCNReviewCopy : enUSReviewCopy;
}
