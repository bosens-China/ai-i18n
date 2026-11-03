import { defineConfig } from '@ai-i18n/vite/config';
const mode = process.env.AI_I18N_BENCHMARK ?? '';
export default defineConfig({
  diagnostics: { performance: mode !== 'benchmark-on' },
  sourceLang: 'zh-CN',
  failOnMissingTranslations: true,
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
  autoImport: false,
  loading: true,
});
