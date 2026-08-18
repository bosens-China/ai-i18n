import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import plugin from '../index';

describe('@ai-i18n/eslint Vue config', () => {
  it('does not hide missing imports in the explicit Vue preset', async () => {
    const vueLanguage = {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: { parser: tseslint.parser },
      },
    };
    const requireBindings = {
      files: ['**/*.vue'],
      rules: { 'no-undef': 'error' as const },
    };
    const code = [
      '<script setup>',
      'const { t } = useI18n()',
      '</script>',
      "<template>{{ t('保存') }}</template>",
    ].join('\n');
    const explicit = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        vueLanguage,
        ...(plugin.configs!.vue as Linter.Config[]),
        requireBindings,
      ],
    });
    const autoImport = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        vueLanguage,
        ...(plugin.configs!['vue-auto-import'] as Linter.Config[]),
        requireBindings,
      ],
    });

    const [explicitResult] = await explicit.lintText(code, {
      filePath: 'src/Explicit.vue',
    });
    const [autoImportResult] = await autoImport.lintText(code, {
      filePath: 'src/Auto.vue',
    });

    expect(explicitResult?.messages).toMatchObject([
      { ruleId: 'no-undef', message: "'useI18n' is not defined." },
    ]);
    expect(autoImportResult?.messages).toEqual([]);
  });
});
