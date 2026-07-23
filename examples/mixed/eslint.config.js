import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import rootConfig from '../../eslint.config.js';

export default defineConfig([
  rootConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/vue/**'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
]);
