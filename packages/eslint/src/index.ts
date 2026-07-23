import { createRequire } from 'node:module';
import type { ESLint } from 'eslint';
import { tStaticArgs } from './rules/t-static-args.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const plugin: ESLint.Plugin = {
  meta: {
    name: '@boses/eslint-plugin',
    version,
    namespace: 'ai-i18n',
  },
  rules: {
    't-static-args': tStaticArgs,
  },
  configs: {},
};

// 规则集必须由使用者显式引入，不会修改宿主项目的 ESLint 配置。
plugin.configs!.recommended = [
  {
    ignores: ['**/*.vue'],
    plugins: { 'ai-i18n': plugin },
    rules: { 'ai-i18n/t-static-args': 'error' },
  },
];

plugin.configs!.vue = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: { globals: { useI18n: 'readonly' } },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: true }],
    },
  },
];

plugin.configs!.react = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: { globals: { useI18n: 'readonly' } },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: true }],
    },
  },
];

plugin.configs!.vanilla = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        t: 'readonly',
        setLang: 'readonly',
        getLang: 'readonly',
        getLangs: 'readonly',
        subscribe: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: true }],
    },
  },
];

export { tStaticArgs };
export default plugin;
