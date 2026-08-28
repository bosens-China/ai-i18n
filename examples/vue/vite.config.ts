import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';
import { defineConfig } from 'vite';
import UnoCSS from 'unocss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
        { value: 'ja-JP', label: '日本語' },
      ],
      autoImport: false,
      loading: {},
      html: true,
    }),
    // 注入业务页面右下角入口，但不在终端打印 Review 地址。
    aiI18nReview({ launcher: true, printUrl: false }),
    vue(),
    UnoCSS({ inspector: true }),
  ],
});
