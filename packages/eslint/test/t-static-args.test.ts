import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import plugin, { tStaticArgs } from '../src/index';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-eslint-'));
const sourceRoot = path.join(fixtureRoot, 'src');
fs.mkdirSync(sourceRoot, { recursive: true });
const tsconfigPath = path.join(fixtureRoot, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
  }),
);
fs.writeFileSync(
  path.join(sourceRoot, 'texts.ts'),
  [
    "export const SAVE = '保存'",
    "export const DYNAMIC = getText()",
  ].join('\n'),
);
fs.writeFileSync(
  path.join(sourceRoot, 'bridge.ts'),
  "export { t } from 'virtual:ai-i18n'",
);

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('ai-i18n/t-static-args', () => {
  it('exposes an opt-in flat recommended config', () => {
    expect(plugin.rules).toHaveProperty('t-static-args', tStaticArgs);
    expect(plugin.configs?.recommended).toEqual([
      expect.objectContaining({
        rules: { 'ai-i18n/t-static-args': 'error' },
      }),
    ]);
  });

  tester.run('t-static-args', tStaticArgs, {
    valid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', '按钮')",
        filename: path.join(sourceRoot, 'literal.ts'),
      },
      {
        code: "import { t as tr } from 'virtual:ai-i18n'; const label = ok ? '是' : '否'; tr(label)",
        filename: path.join(sourceRoot, 'alias.ts'),
      },
      {
        code: "import { t } from 'another-i18n'; t(props.label)",
        filename: path.join(sourceRoot, 'other.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; function run(t: (value: string) => string) { t(value) }; t('外层')",
        filename: path.join(sourceRoot, 'shadow.ts'),
      },
      {
        code: "import { SAVE } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(SAVE)",
        filename: path.join(sourceRoot, 'cross-file.ts'),
        options: [{ tsconfigPath }],
      },
      {
        code: "import { t as translate } from './bridge'; translate('重导出')",
        filename: path.join(sourceRoot, 're-export.ts'),
      },
      {
        code: "import { useI18n } from '@ai-i18n/vue'; const { t } = useI18n(); t('Vue 静态文案')",
        filename: path.join(sourceRoot, 'vue-hook.ts'),
      },
      {
        code: "import { useI18n as useTranslation } from '@ai-i18n/react'; const { t: tr } = useTranslation(); tr('React 静态文案')",
        filename: path.join(sourceRoot, 'react-hook.tsx'),
      },
    ],
    invalid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; t(props.label)",
        filename: path.join(sourceRoot, 'dynamic.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', props.comment)",
        filename: path.join(sourceRoot, 'comment.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', '按钮', 'extra')",
        filename: path.join(sourceRoot, 'arity.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { DYNAMIC } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(DYNAMIC)",
        filename: path.join(sourceRoot, 'cross-file-dynamic.ts'),
        options: [{ tsconfigPath }],
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { t as translate } from './bridge'; translate(`共 ${count} 条`)",
        filename: path.join(sourceRoot, 're-export-dynamic.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { useI18n } from '@ai-i18n/vue'; const { t } = useI18n(); t(props.label)",
        filename: path.join(sourceRoot, 'vue-hook-dynamic.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { useI18n as useTranslation } from '@ai-i18n/react'; const { t: tr } = useTranslation(); tr(props.label)",
        filename: path.join(sourceRoot, 'react-hook-dynamic.tsx'),
        errors: [{ messageId: 'dynamicArg' }],
      },
    ],
  });
});
