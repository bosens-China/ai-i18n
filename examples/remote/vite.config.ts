import { fileURLToPath } from 'node:url';
import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';
import UnoCSS from 'unocss/vite';

const origin = process.env.AI_I18N_DEMO_ORIGIN ?? 'http://127.0.0.1:51885';
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 51884,
    strictPort: true,
    proxy: { '/api': origin },
  },
  plugins: [
    UnoCSS({
      configFile: fileURLToPath(new URL('./uno.config.ts', import.meta.url)),
    }),
    aiI18n(),
  ],
});
