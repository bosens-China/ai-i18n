import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
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
    react(),
  ],
});
