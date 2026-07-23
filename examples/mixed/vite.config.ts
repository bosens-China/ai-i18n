import { react as aiI18nReact } from '@ai-i18n/react/vite';
import { aiI18n } from '@ai-i18n/vite';
import { vue as aiI18nVue } from '@ai-i18n/vue/vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nVue(), aiI18nReact()],
    }),
    vue(),
    // Vue JSX 只声明自己的目录；其余 JSX 由 React 默认处理，无需特殊文件后缀。
    vueJsx({ include: '**/src/vue/**/*.{jsx,tsx}' }),
    react(),
  ],
});
