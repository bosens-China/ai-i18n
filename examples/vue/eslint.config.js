import aiI18n from '@boses/eslint-plugin';
import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import rootConfig from '../../eslint.config.js';

export default defineConfig([
  rootConfig,
  aiI18n.configs.vue,
  pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
]);
