import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe } from 'vitest';
import { tStaticArgs } from '../src/index';

const tester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const autoImport = [{ autoImport: ['t', 'useI18n'] }];

describe('ai-i18n/t-static-args template auto import', () => {
  tester.run('supports direct t in Vue templates', tStaticArgs, {
    valid: [
      {
        code: [
          '<script setup>',
          'const { t } = useI18n()',
          '</script>',
          "<template>{{ t('已订阅') }}</template>",
        ].join('\n'),
        filename: path.resolve('Subscribed.vue'),
        options: autoImport,
      },
      {
        code: [
          '<template>',
          '  <p v-for="t in translators">{{ t(\'列表局部变量\') }}</p>',
          '  <Panel v-slot="{ t }">{{ t`插槽局部变量` }}</Panel>',
          '</template>',
        ].join('\n'),
        filename: path.resolve('TemplateLocals.vue'),
        options: autoImport,
      },
      {
        code: [
          '<script>',
          'export default { methods: { t(value) { return value } } }',
          '</script>',
          "<template>{{ t('Options API 方法') }}</template>",
        ].join('\n'),
        filename: path.resolve('OptionsOnly.vue'),
        options: autoImport,
      },
      {
        code: "<template>{{ t('不会订阅') }}</template>",
        filename: path.resolve('TemplateOnly.vue'),
        options: autoImport,
      },
      {
        code: '<template>{{ t`不会订阅` }}</template>',
        filename: path.resolve('TemplateOnlyTagged.vue'),
        options: autoImport,
      },
      {
        code: [
          '<script setup>',
          'function createLocalT() {',
          '  const t = (value) => value',
          '  return t',
          '}',
          '</script>',
          "<template>{{ t('嵌套绑定不属于模板') }}</template>",
        ].join('\n'),
        filename: path.resolve('NestedBinding.vue'),
        options: autoImport,
      },
      {
        code: [
          '<script setup lang="ts">',
          "import type { t } from './types'",
          '</script>',
          "<template>{{ t('类型导入不是运行时绑定') }}</template>",
        ].join('\n'),
        filename: path.resolve('TypeOnlyBinding.vue'),
        options: autoImport,
      },
    ],
    invalid: [],
  });
});
