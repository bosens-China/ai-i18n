import type { ReviewLocale } from '@ai-i18n/core';

/** 只有存在选择意义时才显示目标语言控件。 */
export function hasMultipleReviewLocales(
  locales: readonly ReviewLocale[] | undefined,
): boolean {
  return (locales?.length ?? 0) > 1;
}
