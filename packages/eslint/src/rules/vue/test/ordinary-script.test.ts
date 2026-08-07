import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe } from 'vitest';
import { noUnsubscribedT, tStaticArgs } from '../../../index';

const sourceRoot = path.resolve(
  'packages/eslint/src/rules/vue/test/fixtures/ordinary-script',
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
const hookComponent = [
  '<script lang="ts">',
  'export default {',
  '  setup() {',
  '    const { t } = useI18n()',
  '    return { t }',
  '  },',
  '}',
  '</script>',
];
const optionsMethodComponent = [
  '<script lang="ts">',
  'export default {',
  '  methods: {',
  '    t(value: string) { return value },',
  '    local(value: string) { return this.t(value) },',
  '  },',
  '}',
  '</script>',
];
const localSetupComponent = [
  '<script lang="ts">',
  'export default {',
  '  setup() {',
  '    const t = (value: string) => value',
  '    return { t }',
  '  },',
  '}',
  '</script>',
];

describe('Vue ordinary script rules', () => {
  tester.run('t-static-args', tStaticArgs, {
    valid: [
      {
        code: [
          hookComponent[0],
          "import { useI18n } from 'virtual:ai-i18n'",
          ...hookComponent.slice(1),
          "<template>{{ t('普通 script setup') }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'static.vue'),
      },
      {
        code: [
          ...optionsMethodComponent,
          '<template>{{ t(props.label) }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'options-method.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: [
          ...localSetupComponent,
          '<template>{{ t(props.label) }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'local-setup.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
    ],
    invalid: [
      {
        code: [
          ...hookComponent,
          '<template>{{ t(props.label) }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'dynamic.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
        errors: [{ messageId: 'invalidUsage', line: 9, column: 16 }],
      },
    ],
  });

  tester.run('no-unsubscribed-t', noUnsubscribedT, {
    valid: [
      {
        code: [
          ...hookComponent,
          "<template>{{ t('普通 script setup') }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'hook-subscription.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: [
          '<script lang="ts">',
          "import { t } from 'virtual:ai-i18n'",
          'export default {',
          "  computed: { label() { return t('计算属性') } },",
          "  methods: { notify() { return t('方法') } },",
          '}',
          '</script>',
          "<template>{{ t('模板') }} {{ label }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'options-runtime.vue'),
      },
      {
        code: [
          ...optionsMethodComponent,
          "<template>{{ t('Options method') }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'local-method.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: [
          ...localSetupComponent,
          "<template>{{ t('Setup local') }}</template>",
        ].join('\n'),
        filename: path.join(sourceRoot, 'local-t.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
    ],
    invalid: [],
  });
});
