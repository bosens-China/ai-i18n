import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/__ai-i18n/',
  plugins: [vue()],
  build: {
    target: 'baseline-widely-available',
    sourcemap: true,
  },
});
