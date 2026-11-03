import { defineConfig } from '@ai-i18n/vite/config';
import { createRemote } from './remote.js';
const origin = process.env.AI_I18N_DEMO_ORIGIN ?? 'http://127.0.0.1:51885';
const mode =
  process.env.AI_I18N_DEMO_MODE === 'overlay' ? 'overlay' : 'replace';
export default defineConfig({
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  directory: mode === 'overlay' ? 'i18n-overlay' : 'i18n',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  remote: createRemote(origin, mode),
  failOnMissingTranslations: true,
});
