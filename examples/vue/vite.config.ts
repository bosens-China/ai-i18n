import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';
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
      autoImport: true,
      loading: {},
      html: true,
    }),
    vue(),
  ],
});
