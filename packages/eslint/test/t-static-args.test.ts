import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
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
  ["export const SAVE = '保存'", 'export const DYNAMIC = getText()'].join('\n'),
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

const vueTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

describe('ai-i18n/t-static-args', () => {
  it('exposes an opt-in flat recommended config', () => {
    expect(plugin.rules).toHaveProperty('t-static-args', tStaticArgs);
    expect(plugin.configs?.recommended).toEqual([
      expect.objectContaining({
        ignores: ['**/*.vue'],
        rules: { 'ai-i18n/t-static-args': 'error' },
      }),
    ]);
    expect(plugin.configs?.vue).toEqual([
      expect.objectContaining({
        files: ['**/*.vue'],
        rules: { 'ai-i18n/t-static-args': 'error' },
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
      "import { useI18n } from '@ai-i18n/vue'",
      'const { t } = useI18n()',
      '</script>',
      '<template>{{ t(props.label) }}</template>',
    ].join('\n');
    const withoutVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [vueLanguage, ...plugin.configs!.recommended!],
    });
    const withVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        vueLanguage,
        ...plugin.configs!.recommended!,
        ...plugin.configs!.vue!,
      ],
    });

    const [defaultResult] = await withoutVue.lintText(code, {
      filePath: 'src/App.vue',
    });
    const [vueResult] = await withVue.lintText(code, {
      filePath: 'src/App.vue',
    });

    expect(defaultResult?.messages).toEqual([]);
    expect(vueResult?.messages).toMatchObject([
      { ruleId: 'ai-i18n/t-static-args', messageId: 'dynamicArg' },
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
        code: "import { useI18n } from '@ai-i18n/vue'; const { t } = useI18n(); export const View = () => <p>{t('Vue JSX')}</p>",
        filename: path.join(sourceRoot, 'View.tsx'),
      },
      {
        code: "import { useI18n as useTranslation } from '@ai-i18n/react'; const { t: tr } = useTranslation(); tr('React 静态文案')",
        filename: path.join(sourceRoot, 'react-hook.tsx'),
      },
      {
        code: "import { useI18n } from '@ai-i18n/react'; const i18n = useI18n(); i18n.t('成员调用'); i18n['t']('计算成员')",
        filename: path.join(sourceRoot, 'react-object-hook.tsx'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', undefined)",
        filename: path.join(sourceRoot, 'undefined-comment.ts'),
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
        code: "import { useI18n } from '@ai-i18n/vue'; const { t } = useI18n(); export const View = () => <p>{t(props.label)}</p>",
        filename: path.join(sourceRoot, 'View.vue-dynamic.tsx'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { useI18n as useTranslation } from '@ai-i18n/react'; const { t: tr } = useTranslation(); tr(props.label)",
        filename: path.join(sourceRoot, 'react-hook-dynamic.tsx'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { useI18n } from '@ai-i18n/react'; const i18n = useI18n(); i18n.t(props.label)",
        filename: path.join(sourceRoot, 'react-object-hook-dynamic.tsx'),
        errors: [{ messageId: 'dynamicArg' }],
      },
    ],
  });

  vueTester.run('t-static-args in Vue SFC', tStaticArgs, {
    valid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from '@ai-i18n/vue'",
          'const { t } = useI18n()',
          '</script>',
          "<template><button :title=\"t('保存')\">{{ t('提交') }}</button></template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'Static.vue'),
      },
      {
        code: "<template>{{ t('无需脚本') }}</template>",
        filename: path.join(sourceRoot, 'TemplateOnlyStatic.vue'),
      },
      {
        code: '<template>{{ t(props.label) }}</template>',
        filename: path.join(sourceRoot, 'TemplateOnlyDynamic.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from '@ai-i18n/vue'",
          'const { t: translate } = useI18n()',
          'const items = [() => props.label]',
          '</script>',
          '<template>',
          '  <p v-for="translate in items">{{ translate(props.label) }}</p>',
          '  <Panel v-slot="{ translate }">{{ translate(props.label) }}</Panel>',
          '</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'TemplateShadowing.vue'),
      },
    ],
    invalid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from '@ai-i18n/vue'",
          'const { t } = useI18n()',
          't(props.label)',
          '</script>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'ScriptDynamic.vue'),
        errors: [{ messageId: 'dynamicArg', line: 4, column: 1 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from '@ai-i18n/vue'",
          'const { t: tr } = useI18n()',
          '</script>',
          '<template>',
          '  <button :title="tr(props.label)">{{ tr(\'提交\') }}</button>',
          '</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'TemplateDynamic.vue'),
        errors: [{ messageId: 'dynamicArg', line: 6, column: 19 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from '@ai-i18n/vue'",
          'const i18n = useI18n()',
          '</script>',
          '<template>{{ i18n.t(props.label) }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'TemplateMemberDynamic.vue'),
        errors: [{ messageId: 'dynamicArg', line: 5, column: 14 }],
      },
    ],
  });
});
