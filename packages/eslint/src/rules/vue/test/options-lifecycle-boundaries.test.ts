import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe } from 'vitest';
import { noUnsubscribedT } from '../../../index';

const fixtureRoot = path.resolve(
  'packages/eslint/src/rules/vue/test/fixtures/options-lifecycle',
);
const explicitVueOptions = [{ framework: 'vue' }] as const;
const autoVueOptions = [
  {
    autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
    framework: 'vue',
  },
] as const;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('Vue Options API translation lifecycle boundaries', () => {
  tester.run(
    'tComputed requires a Vue component root computed property',
    noUnsubscribedT,
    {
      valid: [
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export default { computed: { label: tComputed('直接导出') } }",
          filename: path.join(fixtureRoot, 'export-default.ts'),
          options: explicitVueOptions,
        },
        {
          code: "import { defineComponent } from 'vue'; import { tComputed } from 'virtual:ai-i18n'; export default defineComponent({ computed: { label: tComputed('组件') } })",
          filename: path.join(fixtureRoot, 'define-component.ts'),
          options: explicitVueOptions,
        },
        {
          code: "import { defineComponent as component } from 'vue'; import { tComputed } from 'virtual:ai-i18n'; export default component({ computed: { label: tComputed('别名') } })",
          filename: path.join(fixtureRoot, 'define-component-alias.ts'),
          options: explicitVueOptions,
        },
        {
          code: "import * as Vue from 'vue'; import { tComputed } from 'virtual:ai-i18n'; export default Vue.defineComponent({ computed: { label: tComputed('命名空间') } })",
          filename: path.join(fixtureRoot, 'define-component-namespace.ts'),
          options: explicitVueOptions,
        },
        {
          code: "export default { computed: { label: tComputed('自动导入') } }",
          filename: path.join(fixtureRoot, 'auto-import.ts'),
          options: autoVueOptions,
        },
        {
          code: 'const tComputed = (value: unknown) => value; const ordinary = { computed: { label: tComputed(source) } }; void ordinary',
          filename: path.join(fixtureRoot, 'auto-import-shadowed.ts'),
          options: autoVueOptions,
        },
      ],
      invalid: [
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; const ordinary = { computed: { label: tComputed('普通对象') } }; void ordinary",
          filename: path.join(fixtureRoot, 'ordinary-object.ts'),
          options: explicitVueOptions,
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export default { data() { return { computed: { label: tComputed('嵌套') } } } }",
          filename: path.join(fixtureRoot, 'data-nested-computed.ts'),
          options: explicitVueOptions,
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export default { nested: { computed: { label: tComputed('嵌套') } } }",
          filename: path.join(fixtureRoot, 'nested-computed.ts'),
          options: explicitVueOptions,
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; const defineComponent = <T>(value: T) => value; export default defineComponent({ computed: { label: tComputed('本地函数') } })",
          filename: path.join(fixtureRoot, 'local-define-component.ts'),
          options: explicitVueOptions,
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { defineComponent } from 'another-vue'; import { tComputed } from 'virtual:ai-i18n'; export default defineComponent({ computed: { label: tComputed('其他库') } })",
          filename: path.join(fixtureRoot, 'other-define-component.ts'),
          options: explicitVueOptions,
          errors: [{ messageId: 'misplacedTComputed' }],
        },
      ],
    },
  );

  tester.run('tRef stays in setup and composables', noUnsubscribedT, {
    valid: [
      {
        code: "import { defineComponent } from 'vue'; import { tRef } from 'virtual:ai-i18n'; export default defineComponent({ setup() { const label = tRef('Setup'); return { label } } })",
        filename: path.join(fixtureRoot, 'setup.ts'),
        options: explicitVueOptions,
      },
      {
        code: "import { defineComponent } from 'vue'; import { tRef as translatedRef } from 'virtual:ai-i18n'; export default defineComponent({ setup() { return { label: translatedRef('Setup alias') } } })",
        filename: path.join(fixtureRoot, 'setup-alias.ts'),
        options: explicitVueOptions,
      },
      {
        code: "import { defineComponent } from 'vue'; export default defineComponent({ setup() { return { label: tRef('Auto setup') } } })",
        filename: path.join(fixtureRoot, 'setup-auto.ts'),
        options: autoVueOptions,
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export function useLabel() { return tRef('Composable') }",
        filename: path.join(fixtureRoot, 'composable.ts'),
        options: explicitVueOptions,
      },
      {
        code: 'const tRef = (value: unknown) => value; export default { data() { return { label: tRef(source) } } }',
        filename: path.join(fixtureRoot, 't-ref-shadowed.ts'),
        options: autoVueOptions,
      },
    ],
    invalid: [
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export default { computed: { label: tRef('Computed') } }",
        filename: path.join(fixtureRoot, 'computed-ref.ts'),
        options: explicitVueOptions,
        errors: [{ messageId: 'optionsTRef' }],
      },
      {
        code: "import { tRef as translatedRef } from 'virtual:ai-i18n'; export default { computed: { label() { return translatedRef('Getter') } } }",
        filename: path.join(fixtureRoot, 'computed-getter-ref.ts'),
        options: explicitVueOptions,
        errors: [{ messageId: 'optionsTRef' }],
      },
      {
        code: "export default { data() { return { label: tRef('Auto data') } } }",
        filename: path.join(fixtureRoot, 'data-ref-auto.ts'),
        options: autoVueOptions,
        errors: [{ messageId: 'optionsTRef' }],
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export default { methods: { label() { return tRef('Method') } } }",
        filename: path.join(fixtureRoot, 'method-ref.ts'),
        options: explicitVueOptions,
        errors: [{ messageId: 'optionsTRef' }],
      },
      {
        code: "export default { methods: { label() { return tRef('Auto method') } } }",
        filename: path.join(fixtureRoot, 'method-ref-auto.ts'),
        options: autoVueOptions,
        errors: [{ messageId: 'optionsTRef' }],
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export default { render() { return tRef('Render') } }",
        filename: path.join(fixtureRoot, 'render-ref.ts'),
        options: explicitVueOptions,
        errors: [{ messageId: 'renderTRef' }],
      },
    ],
  });
});
