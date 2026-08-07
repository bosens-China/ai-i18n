import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe } from 'vitest';
import { tStaticArgs } from '../../../index';

const fixtureRoot = path.resolve(
  'packages/eslint/src/rules/vue/test/fixtures/template-method-bridge',
);
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
const autoImport = [{ autoImport: ['t', 'tRef', 'tComputed', 'useI18n'] }];

describe('Vue Options template translation bindings', () => {
  tester.run(
    't-static-args supports explicit bridges and auto-imported bare t',
    tStaticArgs,
    {
      valid: [
        {
          code: [
            '<script lang="ts">',
            "import { t } from 'virtual:ai-i18n'",
            'export default {',
            '  methods: { t },',
            '}',
            '</script>',
            "<template>{{ t('显式 bridge') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Explicit.vue'),
        },
        {
          code: [
            '<script lang="ts">',
            "import { t as translate } from 'virtual:ai-i18n'",
            'export default {',
            '  methods: { t: translate },',
            '}',
            '</script>',
            '<template>{{ t`别名 ${count}` }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Alias.vue'),
        },
        {
          code: [
            '<script lang="ts">',
            'export default {',
            "  methods: { notify() { return t('脚本自动导入') } },",
            '}',
            '</script>',
            "<template>{{ t('Options template 自动导入') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'AutoBare.vue'),
          options: autoImport,
        },
        {
          code: [
            '<script lang="ts">',
            'export default {',
            '  methods: { t(value: string) { return value } },',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'LocalMethod.vue'),
          options: autoImport,
        },
        {
          code: [
            '<script lang="ts">',
            'const t = (value: string) => value',
            'export default {',
            '  methods: { t },',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'LocalShorthand.vue'),
          options: autoImport,
        },
        {
          code: [
            '<script lang="ts">',
            "import { t } from 'another-i18n'",
            'export default {',
            '  methods: { t },',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'OtherLibrary.vue'),
          options: autoImport,
        },
        {
          code: [
            '<script lang="ts">',
            'const extra = {}',
            'export default {',
            '  ...extra,',
            '  methods: { t },',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'SpreadBeforeMethods.vue'),
          options: autoImport,
        },
        {
          code: [
            '<script lang="ts">',
            'const extra = {}',
            'export default {',
            '  methods: { t },',
            '  ...extra,',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'SpreadAfterMethods.vue'),
          options: autoImport,
        },
      ],
      invalid: [
        {
          code: [
            '<script lang="ts">',
            "import { defineComponent } from 'vue'",
            "import { t } from 'virtual:ai-i18n'",
            'export default defineComponent({',
            '  methods: { t },',
            '})',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'ExplicitDynamic.vue'),
          errors: [{ messageId: 'invalidUsage', line: 8, column: 16 }],
        },
        {
          code: [
            '<script lang="ts">',
            "import { t as translate } from 'virtual:ai-i18n'",
            'export default {',
            '  methods: { t: translate },',
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'AliasDynamic.vue'),
          errors: [{ messageId: 'invalidUsage', line: 7, column: 16 }],
        },
        {
          code: [
            '<script lang="ts">',
            'export default {',
            "  methods: { notify() { return t('脚本自动导入') } },",
            '}',
            '</script>',
            '<template>{{ t(props.label) }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'AutoBareDynamic.vue'),
          options: autoImport,
          errors: [{ messageId: 'invalidUsage', line: 6, column: 16 }],
        },
      ],
    },
  );
});
