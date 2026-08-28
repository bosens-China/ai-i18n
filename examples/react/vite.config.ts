import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      autoImport: true,
      html: true,
    }),
    // 两种入口提示都关闭；独立 Review 页面仍可通过固定 URL 访问。
    aiI18nReview({ launcher: false, printUrl: false }),
    react(),
  ],
});
