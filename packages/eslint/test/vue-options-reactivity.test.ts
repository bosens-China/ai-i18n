import path from 'node:path';
import { ESLint, RuleTester, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import plugin, {
  noEagerTranslation,
  noUnsubscribedRuntimeState,
  noUnsubscribedT,
  tStaticArgs,
} from '../src/index';

const fixtureRoot = path.resolve('packages/eslint/test/options-fixtures');
const autoImport = [{ autoImport: ['t', 'tRef', 'tComputed', 'useI18n'] }];
const autoRuntimeState = [
  {
    autoImport: ['getLang', 'getLangLoadState', 'i18nComputed'],
    framework: 'vue',
  },
];

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

describe('Vue Options API reactive translation rules', () => {
  it('declares the Options helpers in the Vue auto-import preset', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
        },
        ...(plugin.configs!['vue-auto-import'] as Linter.Config[]),
        {
          files: ['**/*.ts'],
          rules: { 'no-undef': 'error' },
        },
      ],
    });
    const [result] = await eslint.lintText(
      "export default { computed: { ...i18nComputed(), label: tComputed('保存') } }",
      { filePath: 'src/OptionsPanel.ts' },
    );

    expect(result?.messages).toEqual([]);
  });

  tester.run('t-static-args supports tComputed', tStaticArgs, {
    valid: [
      {
        code: "import { tComputed } from 'virtual:ai-i18n'; export default { computed: { label: tComputed('保存', { comment: '按钮' }) } }",
        filename: path.join(fixtureRoot, 'static.ts'),
      },
      {
        code: "import { tComputed as translated } from 'virtual:ai-i18n'; export default { computed: { label: translated`共 ${count} 项` } }",
        filename: path.join(fixtureRoot, 'alias.ts'),
      },
      {
        code: "export default { computed: { labels: tComputed({ save: '保存', cancel: '取消' }) } }",
        filename: path.join(fixtureRoot, 'auto.ts'),
        options: autoImport,
      },
      {
        code: 'const tComputed = (value: unknown) => value; export default { computed: { label: tComputed(props.label) } }',
        filename: path.join(fixtureRoot, 'shadowed.ts'),
        options: autoImport,
      },
      {
        code: "import { tComputed } from 'virtual:ai-i18n'; function local(tComputed: (value: unknown) => unknown) { return tComputed(props.label) } export default { computed: { label: tComputed('外层') } }; void local",
        filename: path.join(fixtureRoot, 'import-shadowed.ts'),
      },
    ],
    invalid: [
      {
        code: "import { tComputed } from 'virtual:ai-i18n'; export default { computed: { label: tComputed(props.label) } }",
        filename: path.join(fixtureRoot, 'dynamic.ts'),
        errors: [{ messageId: 'invalidUsage' }],
      },
      {
        code: 'export default { computed: { label: tComputed(props.label) } }',
        filename: path.join(fixtureRoot, 'auto-dynamic.ts'),
        options: autoImport,
        errors: [{ messageId: 'invalidUsage' }],
      },
    ],
  });

  tester.run(
    'no-eager-translation accepts lazy Options getters',
    noEagerTranslation,
    {
      valid: [
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export default { computed: { label: tComputed('保存') } }",
          filename: path.join(fixtureRoot, 'lazy.ts'),
        },
        {
          code: "export default { computed: { label: tComputed('保存') } }",
          filename: path.join(fixtureRoot, 'lazy-auto.ts'),
          options: autoImport,
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export const misplaced = tComputed('由生命周期规则提示')",
          filename: path.join(fixtureRoot, 'lifecycle-owned.ts'),
        },
      ],
      invalid: [],
    },
  );

  tester.run(
    'no-unsubscribed-t validates tComputed placement',
    noUnsubscribedT,
    {
      valid: [
        {
          code: "import { defineComponent } from 'vue'; import { tComputed } from 'virtual:ai-i18n'; export default defineComponent({ computed: { label: tComputed('保存'), labels: tComputed({ save: '保存' }) } })",
          filename: path.join(fixtureRoot, 'component.ts'),
          options: [{ framework: 'vue' }],
        },
        {
          code: "export default { computed: { label: tComputed('保存') } }",
          filename: path.join(fixtureRoot, 'component-auto.ts'),
          options: [
            {
              autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
              framework: 'vue',
            },
          ],
        },
        {
          code: 'const tComputed = (value: unknown) => value; export const label = tComputed(source)',
          filename: path.join(fixtureRoot, 'local-shadow.ts'),
          options: [
            {
              autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
              framework: 'vue',
            },
          ],
        },
      ],
      invalid: [
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export const label = tComputed('模块缓存')",
          filename: path.join(fixtureRoot, 'module.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export default { data() { return { label: tComputed('Data') } } }",
          filename: path.join(fixtureRoot, 'data.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed as translated } from 'virtual:ai-i18n'; export default { methods: { label() { return translated('Method') } } }",
          filename: path.join(fixtureRoot, 'method.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedTComputed' }],
        },
        {
          code: "import { tComputed } from 'virtual:ai-i18n'; export function View() { return <p>{tComputed('Render')}</p> }",
          filename: path.join(fixtureRoot, 'render.tsx'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedTComputed' }],
        },
      ],
    },
  );

  vueTester.run(
    'no-unsubscribed-t rejects tComputed in templates',
    noUnsubscribedT,
    {
      valid: [
        {
          code: [
            '<script lang="ts">',
            "import { tComputed } from 'virtual:ai-i18n'",
            'export default {',
            "  computed: { label: tComputed('保存') },",
            '}',
            '</script>',
            '<template>{{ label }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Options.vue'),
          options: [{ framework: 'vue' }],
        },
      ],
      invalid: [
        {
          code: [
            '<script setup lang="ts">',
            "import { tComputed } from 'virtual:ai-i18n'",
            '</script>',
            "<template>{{ tComputed('模板') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Template.vue'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedTComputed', line: 4, column: 14 }],
        },
      ],
    },
  );

  tester.run(
    'no-unsubscribed-runtime-state recommends i18nComputed',
    noUnsubscribedRuntimeState,
    {
      valid: [
        {
          code: "import { i18nComputed } from 'virtual:ai-i18n'; export default { computed: { ...i18nComputed() }, watch: { currentLang() {} } }",
          filename: path.join(fixtureRoot, 'state.ts'),
          options: [{ framework: 'vue' }],
        },
        {
          code: "const getLang = () => 'local'; export default { computed: { currentLang() { return getLang() } } }",
          filename: path.join(fixtureRoot, 'state-shadow.ts'),
          options: [{ autoImport: ['getLang'], framework: 'vue' }],
        },
      ],
      invalid: [
        {
          code: "import { getLang } from 'virtual:ai-i18n'; export default { computed: { currentLang() { return getLang() } } }",
          filename: path.join(fixtureRoot, 'snapshot.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'optionsComputedSnapshot' }],
        },
        {
          code: 'export default { computed: { loadState() { return getLangLoadState() } } }',
          filename: path.join(fixtureRoot, 'snapshot-auto.ts'),
          options: [
            {
              autoImport: ['getLangLoadState'],
              framework: 'vue',
            },
          ],
          errors: [{ messageId: 'optionsComputedSnapshot' }],
        },
      ],
    },
  );

  tester.run(
    'no-unsubscribed-runtime-state validates i18nComputed placement',
    noUnsubscribedRuntimeState,
    {
      valid: [
        {
          code: "import { i18nComputed } from 'virtual:ai-i18n'; export default { computed: { ...i18nComputed() } }",
          filename: path.join(fixtureRoot, 'computed-state.ts'),
          options: [{ framework: 'vue' }],
        },
        {
          code: 'export default { computed: { ...i18nComputed() } }',
          filename: path.join(fixtureRoot, 'computed-state-auto.ts'),
          options: autoRuntimeState,
        },
        {
          code: 'const i18nComputed = () => ({ currentLang: () => "local" }); export default { data() { return { state: i18nComputed() } } }',
          filename: path.join(fixtureRoot, 'computed-state-shadow.ts'),
          options: autoRuntimeState,
        },
      ],
      invalid: [
        {
          code: "import { i18nComputed } from 'virtual:ai-i18n'; export default { data() { return { state: i18nComputed() } } }",
          filename: path.join(fixtureRoot, 'computed-state-data.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedI18nComputed' }],
        },
        {
          code: "import { i18nComputed } from 'virtual:ai-i18n'; export default { setup() { return { state: i18nComputed() } } }",
          filename: path.join(fixtureRoot, 'computed-state-setup.ts'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedI18nComputed' }],
        },
        {
          code: 'export default { computed: { state: i18nComputed() } }',
          filename: path.join(fixtureRoot, 'computed-state-value.ts'),
          options: autoRuntimeState,
          errors: [{ messageId: 'misplacedI18nComputed' }],
        },
      ],
    },
  );

  vueTester.run(
    'no-unsubscribed-runtime-state rejects i18nComputed in Vue setup and templates',
    noUnsubscribedRuntimeState,
    {
      valid: [],
      invalid: [
        {
          code: [
            '<script setup lang="ts">',
            "import { i18nComputed } from 'virtual:ai-i18n'",
            'const state = i18nComputed()',
            '</script>',
            '<template>{{ state.currentLang }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'ComputedStateSetup.vue'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'misplacedI18nComputed', line: 3, column: 15 }],
        },
        {
          code: [
            '<script setup lang="ts"></script>',
            '<template>{{ i18nComputed().currentLang }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'ComputedStateTemplate.vue'),
          options: autoRuntimeState,
          errors: [{ messageId: 'misplacedI18nComputed', line: 2, column: 14 }],
        },
      ],
    },
  );
});
