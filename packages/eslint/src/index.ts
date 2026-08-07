import { createRequire } from 'node:module';
import type { ESLint } from 'eslint';
import {
  REACT_AUTO_IMPORTS,
  RUNTIME_AUTO_IMPORTS,
  VUE_AUTO_IMPORTS,
} from './auto-imports.js';
import { noEagerTranslation } from './rules/common/no-eager-translation.js';
import { noEmbeddedMarkup } from './rules/common/no-embedded-markup.js';
import { noRedundantAutoImport } from './rules/common/no-redundant-auto-import.js';
import { noUnsubscribedRuntimeState } from './rules/common/no-unsubscribed-runtime-state.js';
import { noUnsubscribedT } from './rules/common/no-unsubscribed-t.js';
import { staticCandidateLimit } from './rules/common/static-candidate-limit.js';
import { tStaticArgs } from './rules/common/t-static-args.js';

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
    'no-embedded-markup': noEmbeddedMarkup,
    'no-eager-translation': noEagerTranslation,
    'no-redundant-auto-import': noRedundantAutoImport,
    'no-unsubscribed-runtime-state': noUnsubscribedRuntimeState,
    'no-unsubscribed-t': noUnsubscribedT,
    'static-candidate-limit': staticCandidateLimit,
    't-static-args': tStaticArgs,
  },
  configs: {},
};

// 规则集必须由使用者显式引入，不会修改宿主项目的 ESLint 配置。
plugin.configs!.recommended = [
  {
    ignores: ['**/*.{vue,cjs,cts}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: { defineI18nMessages: 'readonly' },
    },
    rules: {
      'ai-i18n/t-static-args': 'error',
      'ai-i18n/no-embedded-markup': 'warn',
      'ai-i18n/no-eager-translation': 'warn',
      'ai-i18n/no-unsubscribed-runtime-state': 'warn',
      'ai-i18n/no-unsubscribed-t': 'warn',
      'ai-i18n/static-candidate-limit': 'warn',
    },
  },
];

plugin.configs!.vue = [
  {
    files: ['**/*.{js,mjs,ts,mts,jsx,tsx,vue}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: { defineI18nMessages: 'readonly' },
    },
    rules: {
      'ai-i18n/t-static-args': 'error',
      'ai-i18n/no-embedded-markup': 'warn',
      'ai-i18n/no-eager-translation': ['warn', { framework: 'vue' }],
      'ai-i18n/no-unsubscribed-runtime-state': ['warn', { framework: 'vue' }],
      'ai-i18n/no-unsubscribed-t': ['warn', { framework: 'vue' }],
      'ai-i18n/static-candidate-limit': 'warn',
    },
  },
];

// 自动导入 preset 必须与 Vite 各模式实际注入的 API 一一对应。
plugin.configs!['vanilla-auto-import'] = [
  {
    files: ['**/*.{js,mjs,ts,mts}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        ...Object.fromEntries(
          RUNTIME_AUTO_IMPORTS.map((name) => [name, 'readonly']),
        ),
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: ['t'] }],
      'ai-i18n/no-embedded-markup': ['warn', { autoImport: ['t'] }],
      'ai-i18n/no-eager-translation': ['warn', { autoImport: ['t'] }],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        { autoImport: ['getLang', 'getLangLoadState'] },
      ],
      'ai-i18n/static-candidate-limit': ['warn', { autoImport: ['t'] }],
    },
  },
];

plugin.configs!['vue-auto-import'] = [
  {
    files: ['**/*.{js,mjs,ts,mts,jsx,tsx,vue}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        ...Object.fromEntries(
          VUE_AUTO_IMPORTS.map((name) => [name, 'readonly']),
        ),
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': [
        'error',
        { autoImport: ['t', 'tRef', 'tComputed', 'useI18n'] },
      ],
      'ai-i18n/no-embedded-markup': [
        'warn',
        { autoImport: ['t', 'tRef', 'tComputed', 'useI18n'] },
      ],
      'ai-i18n/no-eager-translation': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
        },
      ],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        {
          autoImport: ['getLang', 'getLangLoadState', 'i18nComputed'],
          framework: 'vue',
        },
      ],
      'ai-i18n/no-unsubscribed-t': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
        },
      ],
      'ai-i18n/static-candidate-limit': [
        'warn',
        { autoImport: ['t', 'tRef', 'tComputed', 'useI18n'] },
      ],
    },
  },
];

plugin.configs!['react-auto-import'] = [
  {
    files: ['**/*.{js,mjs,ts,mts,jsx,tsx}'],
    plugins: { 'ai-i18n': plugin },
    languageOptions: {
      globals: {
        ...Object.fromEntries(
          REACT_AUTO_IMPORTS.map((name) => [name, 'readonly']),
        ),
        defineI18nMessages: 'readonly',
      },
    },
    rules: {
      'ai-i18n/t-static-args': ['error', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/no-embedded-markup': ['warn', { autoImport: ['t', 'useI18n'] }],
      'ai-i18n/no-eager-translation': [
        'warn',
        { autoImport: ['t', 'useI18n'] },
      ],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        { autoImport: ['getLang', 'getLangLoadState'] },
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
  noEmbeddedMarkup,
  noEagerTranslation,
  noRedundantAutoImport,
  noUnsubscribedRuntimeState,
  noUnsubscribedT,
  staticCandidateLimit,
  tStaticArgs,
};
export default plugin;
