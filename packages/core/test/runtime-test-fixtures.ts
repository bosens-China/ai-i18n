export const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
] as const;

export const lazyLocales = [
  ...locales,
  { value: 'ja-JP', label: '日本語' },
] as const;
