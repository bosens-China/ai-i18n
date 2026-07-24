import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';
import react from '@vitejs/plugin-react';
import AutoImport from 'unplugin-auto-import/vite';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      html: true,
    }),
    AutoImport({ imports: ['react'], dts: false }),
    react(),
  ],
});
