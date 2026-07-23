import { aiI18n, html } from '@ai-i18n/vite';
import { vue as aiI18nVue } from '@ai-i18n/vue/vite';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nVue(), html()],
    }),
    vue(),
  ],
});
