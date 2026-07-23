import { defineConfig } from 'vite';
import { react as aiI18nReact } from '@ai-i18n/react/vite';
import { aiI18n, html } from '@ai-i18n/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // workspace 链接的 @ai-i18n/react 必须与示例共用同一份 React Hook 运行时。
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nReact(), html()],
    }),
    react(),
  ],
});
