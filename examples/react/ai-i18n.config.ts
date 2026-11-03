import { defineConfig } from '@ai-i18n/vite/config';
const mode = process.env.AI_I18N_BENCHMARK ?? '';
export default defineConfig({
  diagnostics: { performance: mode !== 'benchmark-on' },
  sourceLang: 'zh-CN',
  failOnMissingTranslations: true,
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  autoImport: true,
});
