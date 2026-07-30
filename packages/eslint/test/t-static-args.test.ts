import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe } from 'vitest';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { tStaticArgs } from '../src/index';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-eslint-'));
const sourceRoot = path.join(fixtureRoot, 'src');
fs.mkdirSync(sourceRoot, { recursive: true });
const tsconfigPath = path.join(fixtureRoot, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
    include: ['src/**/*.ts', 'src/**/*.vue'],
  }),
);
fs.writeFileSync(
  path.join(sourceRoot, 'texts.ts'),
  [
    "export const SAVE = '保存'",
    "export const MESSAGES = { save: '保存', states: ['等待', '完成'] }",
    "export const MARKED = defineI18nMessages({ save: '保存', states: ['等待', '完成'] })",
    'export const DYNAMIC = getText()',
  ].join('\n'),
);
fs.writeFileSync(
  path.join(sourceRoot, 'bridge.ts'),
  "export { t } from 'virtual:ai-i18n'",
);
fs.writeFileSync(
  path.join(sourceRoot, 'vue-types.ts'),
  [
    'export interface ImportedProps { label: string }',
    'export interface ImportedEmits { save: [value: string] }',
  ].join('\n'),
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

const dynamicArgumentMessage = diagnosticMessage(
  't() 的参数无法静态提取。source 请使用静态字符串，options 请使用只包含 comment 的静态对象。',
  'The t() arguments cannot be statically extracted. Use a static string for source and a static object containing only comment for options.',
);
describe('ai-i18n/t-static-args', () => {
  tester.run('t-static-args', tStaticArgs, {
    valid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', { comment: '按钮' })",
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
        code: 't(props.label)',
        filename: path.join(sourceRoot, 'unrelated-global.ts'),
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
        code: "import { MARKED } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(MARKED.save); t(MARKED.states[index])",
        filename: path.join(sourceRoot, 'auto-cross-file-macro.ts'),
      },
      {
        code: "import { t as translate } from './bridge'; translate('重导出')",
        filename: path.join(sourceRoot, 're-export.ts'),
      },
      {
        code: "import { useI18n } from 'virtual:ai-i18n'; const { t } = useI18n(); t('Vue 静态文案')",
        filename: path.join(sourceRoot, 'vue-hook.ts'),
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; const label = tRef('Vue Ref 静态文案')",
        filename: path.join(sourceRoot, 'vue-ref.ts'),
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; const labels = tRef({ save: '保存', states: ['等待', '完成'], count: 2 })",
        filename: path.join(sourceRoot, 'vue-ref-tree.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const messages = { save: '保存', states: ['等待', '完成'] }; t(messages)",
        filename: path.join(sourceRoot, 'local-tree.ts'),
      },
      {
        code: "import { MESSAGES } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(MESSAGES)",
        filename: path.join(sourceRoot, 'cross-file-tree.ts'),
        options: [{ tsconfigPath }],
      },
      {
        code: "const { t } = useI18n(); export const View = () => <p>{t('Vue JSX')}</p>",
        filename: path.join(sourceRoot, 'View.tsx'),
        options: [{ autoImport: true }],
      },
      {
        code: "import { useI18n as useTranslation } from 'virtual:ai-i18n'; const { t: tr } = useTranslation(); tr('React 静态文案')",
        filename: path.join(sourceRoot, 'react-hook.tsx'),
      },
      {
        code: "const i18n = useI18n(); i18n.t('成员调用'); i18n['t']('计算成员')",
        filename: path.join(sourceRoot, 'react-object-hook.tsx'),
        options: [{ autoImport: true }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', undefined)",
        filename: path.join(sourceRoot, 'undefined-comment.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t`你好 ${name}`",
        filename: path.join(sourceRoot, 'tagged-template.ts'),
      },
      {
        code: 't`你好 ${name}`',
        filename: path.join(sourceRoot, 'auto-tagged-template.ts'),
        options: [{ autoImport: true }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const base = { cancel: '取消' }; const messages = defineI18nMessages({ ...base, save: '保存', states: ['等待', '完成'] }); t(messages.save); t(messages.states[index])",
        filename: path.join(sourceRoot, 'macro-members.ts'),
      },
      {
        code: "import * as i18n from 'virtual:ai-i18n'; i18n.setLang('en-US')",
        filename: path.join(sourceRoot, 'namespace-runtime.ts'),
      },
      {
        code: "const i18n = useI18n(); const { setLang } = i18n; useI18n().setLang('en-US')",
        filename: path.join(sourceRoot, 'hook-runtime-members.ts'),
        options: [{ autoImport: true }],
      },
    ],
    invalid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; t(props.label)",
        filename: path.join(sourceRoot, 'dynamic.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; tRef(props.label)",
        filename: path.join(sourceRoot, 'vue-ref-dynamic.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t({ save: props.label })",
        filename: path.join(sourceRoot, 'dynamic-tree.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t({ save: '保存' }, { comment: '不支持' })",
        filename: path.join(sourceRoot, 'tree-options.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', { comment: props.comment })",
        filename: path.join(sourceRoot, 'comment.ts'),
        errors: [{ message: dynamicArgumentMessage }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', '按钮')",
        filename: path.join(sourceRoot, 'legacy-string-comment.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保存', { comment: '按钮' }, 'extra')",
        filename: path.join(sourceRoot, 'arity.ts'),
        errors: [{ messageId: 'dynamicArg' }],
      },
      {
        code: "import { DYNAMIC } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(DYNAMIC)",
        filename: path.join(sourceRoot, 'cross-file-dynamic.ts'),
        options: [{ tsconfigPath }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t as translate } from './bridge'; translate(`共 ${count} 条`)",
        filename: path.join(sourceRoot, 're-export-dynamic.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: 'const { t } = useI18n(); t(props.label)',
        filename: path.join(sourceRoot, 'vue-hook-dynamic.ts'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: 'const { t } = useI18n(); export const View = () => <p>{t(props.label)}</p>',
        filename: path.join(sourceRoot, 'View.vue-dynamic.tsx'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { useI18n as useTranslation } from 'virtual:ai-i18n'; const { t: tr } = useTranslation(); tr(props.label)",
        filename: path.join(sourceRoot, 'react-hook-dynamic.tsx'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: 'const i18n = useI18n(); i18n.t(props.label)',
        filename: path.join(sourceRoot, 'react-object-hook-dynamic.tsx'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t('保' + '存')",
        filename: path.join(sourceRoot, 'concat.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; t(ok && '保存')",
        filename: path.join(sourceRoot, 'logical.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; let label = '保存'; t(label)",
        filename: path.join(sourceRoot, 'mutable.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const messages = { save: '保存' }; t(messages.save)",
        filename: path.join(sourceRoot, 'unmarked-member.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const messages = defineI18nMessages({ save: '保' + '存' }); t(messages.save)",
        filename: path.join(sourceRoot, 'macro-concat.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "let messages = defineI18nMessages({ save: '保存' })",
        filename: path.join(sourceRoot, 'invalid-macro.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const tr = t; tr('保存')",
        filename: path.join(sourceRoot, 'local-t-alias.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "import * as i18n from 'virtual:ai-i18n'; i18n.t('保存')",
        filename: path.join(sourceRoot, 'namespace.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "const i18n = useI18n(); const { t } = i18n; t('保存')",
        filename: path.join(sourceRoot, 'second-destructure.ts'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "useI18n().t('保存')",
        filename: path.join(sourceRoot, 'inline-hook.ts'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: "const { t } = require('virtual:ai-i18n')",
        filename: path.join(sourceRoot, 'require.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: 'const macro = defineI18nMessages',
        filename: path.join(sourceRoot, 'macro-reference.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
    ],
  });

  vueTester.run('t-static-args in Vue SFC', tStaticArgs, {
    valid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t } = useI18n()',
          '</script>',
          "<template><button :title=\"t('保存')\">{{ t('提交') }}</button></template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'Static.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import type { ImportedEmits, ImportedProps } from './vue-types'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'defineProps<ImportedProps>()',
          'defineEmits<ImportedEmits>()',
          'const { t } = useI18n()',
          '</script>',
          "<template>{{ t('已保存') }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'ImportedTypes.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { MARKED, MESSAGES } from '@/texts'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t } = useI18n()',
          '</script>',
          '<template>',
          '  <p>{{ t(MARKED.save) }}</p>',
          '  <p>{{ t(MARKED.states[index]) }}</p>',
          '  <p>{{ t(MESSAGES) }}</p>',
          '</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'ImportedMessages.vue'),
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
          "import { useI18n } from 'virtual:ai-i18n'",
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
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t } = useI18n()',
          't(props.label)',
          '</script>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'ScriptDynamic.vue'),
        errors: [{ messageId: 'invalidUsage', line: 4, column: 3 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t: tr } = useI18n()',
          '</script>',
          '<template>',
          '  <button :title="tr(props.label)">{{ tr(\'提交\') }}</button>',
          '</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'TemplateDynamic.vue'),
        errors: [{ messageId: 'invalidUsage', line: 6, column: 22 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const i18n = useI18n()',
          '</script>',
          '<template>{{ i18n.t(props.label) }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'TemplateMemberDynamic.vue'),
        errors: [{ messageId: 'invalidUsage', line: 5, column: 21 }],
      },
    ],
  });
});
