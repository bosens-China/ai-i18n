import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const rootConfig = defineConfig([
  globalIgnores(['**/coverage/**', '**/dist/**', '**/node_modules/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: [
      '**/test/**/*.{js,ts,tsx}',
      '**/*.test.{js,ts,tsx}',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: globals.vitest,
    },
  },
]);

// 子包需要特殊规则时，可 import 此配置并在数组末尾追加覆盖项。
export default rootConfig;
