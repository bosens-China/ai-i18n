import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      AI_I18N_DIAGNOSTIC_LOCALE: 'en-US',
    },
  },
});
