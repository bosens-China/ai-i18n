import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';
import AutoImport from 'unplugin-auto-import/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
        { value: 'ja-JP', label: '日本語' },
      ],
      loading: { strategy: 'locale' },
      html: true,
    }),
    AutoImport({ imports: ['vue'], dts: false }),
    vue(),
  ],
});
