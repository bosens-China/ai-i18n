import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';
import { defineConfig } from 'vite';

const mode = process.env.AI_I18N_BENCHMARK ?? '';

export default defineConfig({
  plugins: [
    mode !== 'benchmark-off' &&
      aiI18n({
        diagnostics: { performance: mode !== 'benchmark-on' },
        sourceLang: 'zh-CN',
        locales: [
          { value: 'zh-CN', label: '中文' },
          { value: 'en-US', label: 'English' },
        ],
        html: true,
      }),
    // 保留终端中的 Review 地址，但不向业务页面注入右下角入口。
    !mode.startsWith('benchmark-') &&
      aiI18nReview({ launcher: false, printUrl: true }),
  ],
});
