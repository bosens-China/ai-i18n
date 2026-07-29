import { createRequire } from 'node:module';
import type { ESLint } from 'eslint';
import { noEagerTranslation } from './rules/no-eager-translation.js';
import { noUnsubscribedT } from './rules/no-unsubscribed-t.js';
import { staticCandidateLimit } from './rules/static-candidate-limit.js';
import { tStaticArgs } from './rules/t-static-args.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const plugin: ESLint.Plugin = {
  meta: {
    name: '@ai-i18n/eslint-plugin',
    version,
    namespace: 'ai-i18n',
  },
  rules: {
    'no-eager-translation': noEagerTranslation,
    'no-unsubscribed-t': noUnsubscribedT,
    'static-candidate-limit': staticCandidateLimit,
    't-static-args': tStaticArgs,
  },
  configs: {},
};

// 规则集必须由使用者显式引入，不会修改宿主项目的 ESLint 配置。
plugin.configs!.recommended = [
  {
    ignores: ['**/*.vue'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: { defineI18nMessages: 'readonly' },
    },
    rules: {
      'ai-i18n/t-static-args': 'error',
      'ai-i18n/no-eager-translation': 'warn',
      'ai-i18n/no-unsubscribed-t': 'warn',
      'ai-i18n/static-candidate-limit': 'warn',
    },
  },
];

plugin.configs!.vue = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: { defineI18nMessages: 'readonly' },
    },
    rules: {
      'ai-i18n/t-static-args': 'error',
      'ai-i18n/no-eager-translation': 'warn',
      'ai-i18n/no-unsubscribed-t': 'warn',
      'ai-i18n/static-candidate-limit': 'warn',
    },
  },
];

// 自动导入 preset 必须与 Vite 各模式实际注入的 API 一一对应。
plugin.configs!['vanilla-auto-import'] = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        t: 'readonly',
        setLang: 'readonly',
        getLang: 'readonly',
        getLangs: 'readonly',
        getLangLoadState: 'readonly',
        subscribe: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: ['t'] }],
      'ai-i18n/no-eager-translation': ['warn', { autoImport: ['t'] }],
      'ai-i18n/static-candidate-limit': ['warn', { autoImport: ['t'] }],
    },
  },
];

plugin.configs!['vue-auto-import'] = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        t: 'readonly',
        useI18n: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/no-eager-translation': [
        'warn',
        { autoImport: ['t', 'useI18n'] },
      ],
      'ai-i18n/no-unsubscribed-t': ['warn', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/static-candidate-limit': [
        'warn',
        { autoImport: ['t', 'useI18n'] },
      ],
    },
  },
];

plugin.configs!['react-auto-import'] = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        t: 'readonly',
        useI18n: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/no-eager-translation': [
        'warn',
        { autoImport: ['t', 'useI18n'] },
      ],
      'ai-i18n/no-unsubscribed-t': ['warn', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/static-candidate-limit': [
        'warn',
        { autoImport: ['t', 'useI18n'] },
      ],
    },
  },
];

export {
  noEagerTranslation,
  noUnsubscribedT,
  staticCandidateLimit,
  tStaticArgs,
};
export default plugin;
