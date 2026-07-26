import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import plugin, { staticCandidateLimit, tStaticArgs } from '../src/index';

describe('@ai-i18n/eslint config', () => {
  it('exposes an opt-in flat recommended config', () => {
    expect(plugin.rules).toHaveProperty('t-static-args', tStaticArgs);
    expect(plugin.rules).toHaveProperty(
      'static-candidate-limit',
      staticCandidateLimit,
    );
    expect(plugin.configs?.recommended).toEqual([
      expect.objectContaining({
        ignores: ['**/*.vue'],
        rules: {
          'ai-i18n/static-candidate-limit': 'warn',
          'ai-i18n/t-static-args': 'error',
        },
      }),
    ]);
    expect(plugin.configs?.vue).toEqual([
      expect.objectContaining({
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
        languageOptions: {
          globals: {
            useI18n: 'readonly',
            defineI18nMessages: 'readonly',
          },
        },
        rules: {
          'ai-i18n/static-candidate-limit': ['warn', { autoImport: true }],
          'ai-i18n/t-static-args': ['error', { autoImport: true }],
        },
      }),
    ]);
    expect(plugin.configs?.react).toEqual([
      expect.objectContaining({
        languageOptions: {
          globals: {
            useI18n: 'readonly',
            defineI18nMessages: 'readonly',
          },
        },
        rules: {
          'ai-i18n/static-candidate-limit': ['warn', { autoImport: true }],
          'ai-i18n/t-static-args': ['error', { autoImport: true }],
        },
      }),
    ]);
    expect(plugin.configs?.vanilla).toEqual([
      expect.objectContaining({
        languageOptions: {
          globals: expect.objectContaining({ t: 'readonly' }),
        },
        rules: {
          'ai-i18n/static-candidate-limit': ['warn', { autoImport: true }],
          'ai-i18n/t-static-args': ['error', { autoImport: true }],
        },
      }),
    ]);
  });

  it('keeps Vue SFC checks opt-in', async () => {
    const vueLanguage = {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: { parser: tseslint.parser },
      },
    };
    const code = [
      '<script setup>',
      "import { useI18n } from 'virtual:ai-i18n'",
      'const { t } = useI18n()',
      '</script>',
      '<template>{{ t(props.label) }}</template>',
    ].join('\n');
    const recommended = plugin.configs!.recommended! as Linter.Config[];
    const vue = plugin.configs!.vue! as Linter.Config[];
    const withoutVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [vueLanguage, ...recommended],
    });
    const withVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [vueLanguage, ...recommended, ...vue],
    });

    const [defaultResult] = await withoutVue.lintText(code, {
      filePath: 'src/App.vue',
    });
    const [vueResult] = await withVue.lintText(code, {
      filePath: 'src/App.vue',
    });

    expect(defaultResult?.messages).toEqual([]);
    expect(vueResult?.messages).toMatchObject([
      { ruleId: 'ai-i18n/t-static-args', messageId: 'invalidUsage' },
    ]);
  });
});
