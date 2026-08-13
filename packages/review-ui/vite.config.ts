import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';

export default defineConfig({
  base: '/__ai-i18n/',
  plugins: [
    vue(),
    UnoCSS(fileURLToPath(new URL('./uno.config.ts', import.meta.url))),
  ],
  build: {
    target: 'baseline-widely-available',
    sourcemap: true,
  },
});
