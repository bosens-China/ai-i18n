import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../../../index';

const source =
  "import { t } from 'virtual:ai-i18n'; export const label = t('保存')";

describe('ESLint analysis failures', () => {
  it('reports one error through t-static-args in official presets', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: plugin.configs!.vue as Linter.Config[],
    });

    const [result] = await eslint.lintText(source, {
      filePath: 'src/MissingVueParser.vue',
    });

    expect(result?.messages).toMatchObject([
      {
        ruleId: 'ai-i18n/t-static-args',
        severity: 2,
        message: expect.stringContaining('vue-eslint-parser'),
      },
    ]);
  });

  for (const rule of [
    'no-eager-translation',
    'no-unsubscribed-t',
    'static-candidate-limit',
  ]) {
    it(`reports analysis failures when ${rule} is enabled alone`, async () => {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.vue'],
            plugins: { 'ai-i18n': plugin },
            rules: { [`ai-i18n/${rule}`]: 'error' },
          },
        ],
      });

      const [result] = await eslint.lintText(source, {
        filePath: `src/${rule}.vue`,
      });

      expect(result?.messages).toMatchObject([
        {
          ruleId: `ai-i18n/${rule}`,
          severity: 2,
          message: expect.stringContaining('vue-eslint-parser'),
        },
      ]);
    });
  }
});
