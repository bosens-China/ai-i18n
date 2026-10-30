import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';
import { createRemote } from './remote.js';

const origin = process.env.AI_I18N_DEMO_ORIGIN ?? 'http://127.0.0.1:51885';
const mode =
  process.env.AI_I18N_DEMO_MODE === 'overlay' ? 'overlay' : 'replace';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 51884,
    strictPort: true,
    proxy: { '/api': origin },
  },
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      directory: mode === 'overlay' ? 'i18n-overlay' : 'i18n',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      remote: createRemote(origin, mode),
      failOnMissingTranslations: true,
    }),
  ],
});
