import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { noRedundantAutoImport } from '../src/index';

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

tester.run('no-redundant-auto-import', noRedundantAutoImport, {
  valid: [
    {
      code: "import { t } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['useI18n'] }],
    },
    {
      code: "import { setLang } from 'virtual:ai-i18n'",
      options: [
        {
          autoImport: ['t', 'tRef', 'tComputed', 'i18nComputed', 'useI18n'],
        },
      ],
    },
    {
      code: "import { t as translate } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
    },
    {
      code: "import { tComputed as createLabel } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['tComputed'] }],
    },
    {
      code: "import * as i18n from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t', 'useI18n'] }],
    },
    {
      code: "import type { Translate } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
    },
    {
      code: "import { t } from 'another-i18n'",
      options: [{ autoImport: ['t'] }],
    },
  ],
  invalid: [
    {
      code: "import { t } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: '',
    },
    {
      code: "import { useI18n, t, tRef } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t', 'tRef', 'useI18n'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: '',
    },
    {
      code: "import { i18nComputed, tComputed } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['i18nComputed', 'tComputed'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: '',
    },
    {
      code: "import { getLang, getLangLoadState, getLangs, setLang, subscribe } from 'virtual:ai-i18n'",
      options: [
        {
          autoImport: [
            'setLang',
            'getLang',
            'getLangs',
            'getLangLoadState',
            'subscribe',
          ],
        },
      ],
      errors: [{ messageId: 'redundantImport' }],
      output: '',
    },
    {
      code: "import { t, setLang } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: "import { setLang } from 'virtual:ai-i18n'",
    },
    {
      code: "import runtime, { t } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: "import runtime from 'virtual:ai-i18n'",
    },
    {
      code: "import { type Translate, t } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport' }],
      output: "import { type Translate } from 'virtual:ai-i18n'",
    },
    {
      code: "import { /* keep migration note */ t } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport' }],
    },
  ],
});

vueTester.run('no-redundant-auto-import in Vue SFCs', noRedundantAutoImport, {
  valid: [
    {
      code: [
        '<script setup lang="ts">',
        "import { t } from 'virtual:ai-i18n'",
        '</script>',
        "<template>{{ t('显式导入模式') }}</template>",
      ].join('\n'),
      filename: path.resolve('ExplicitSetup.vue'),
      options: [{ autoImport: ['useI18n'] }],
    },
    {
      code: [
        '<script lang="ts">',
        "import { t as translate } from 'virtual:ai-i18n'",
        'export default { methods: { t: translate } }',
        '</script>',
        "<template>{{ t('显式 bridge') }}</template>",
      ].join('\n'),
      filename: path.resolve('AliasedOptions.vue'),
      options: [{ autoImport: ['t'] }],
    },
  ],
  invalid: [
    {
      code: [
        '<script setup lang="ts">',
        "import { t } from 'virtual:ai-i18n'",
        '</script>',
        "<template>{{ t('自动导入') }}</template>",
      ].join('\n'),
      filename: path.resolve('AutoSetup.vue'),
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport', line: 2 }],
      output: [
        '<script setup lang="ts">',
        '',
        '</script>',
        "<template>{{ t('自动导入') }}</template>",
      ].join('\n'),
    },
    {
      code: [
        '<script lang="ts">',
        "import { t } from 'virtual:ai-i18n'",
        'export default {}',
        '</script>',
        "<template>{{ t('Options 自动导入') }}</template>",
      ].join('\n'),
      filename: path.resolve('AutoOptions.vue'),
      options: [{ autoImport: ['t'] }],
      errors: [{ messageId: 'redundantImport', line: 2 }],
      output: [
        '<script lang="ts">',
        '',
        'export default {}',
        '</script>',
        "<template>{{ t('Options 自动导入') }}</template>",
      ].join('\n'),
    },
  ],
});
