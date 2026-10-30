import { fileURLToPath } from 'node:url';
import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';
import { defineConfig } from 'vite';
import UnoCSS from 'unocss/vite';

const mode = process.env.AI_I18N_BENCHMARK ?? '';

export default defineConfig({
  plugins: [
    UnoCSS({
      configFile: fileURLToPath(new URL('./uno.config.ts', import.meta.url)),
    }),
    mode !== 'benchmark-off' &&
      aiI18n({
        diagnostics: { performance: mode !== 'benchmark-on' },
        sourceLang: 'zh-CN',
        failOnMissingTranslations: true,
        locales: [
          { value: 'zh-CN', label: '中文' },
          { value: 'en-US', label: 'English' },
        ],
      }),
    // 保留终端中的 Review 地址，但不向业务页面注入右下角入口。
    !mode.startsWith('benchmark-') &&
      aiI18nReview({ launcher: false, printUrl: true }),
  ],
});
