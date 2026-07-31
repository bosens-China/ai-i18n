import path from 'node:path';
import { ESLint, RuleTester, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it, vi } from 'vitest';
import plugin, { noUnsubscribedT } from '../src/index';

const fixtureRoot = path.resolve(
  'packages/eslint/test/vue-instance-translation-fixtures',
);
const vueOptions = [{ framework: 'vue' }] as const;
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

describe('Vue instance translation syntax', () => {
  it('is reported by both Vue presets', async () => {
    for (const preset of ['vue', 'vue-auto-import'] as const) {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.ts'],
            languageOptions: { parser: tseslint.parser },
          },
          ...(plugin.configs![preset] as Linter.Config[]),
        ],
      });
      const [result] = await eslint.lintText(
        "export default { methods: { save() { return this.t('保存') } } }",
        { filePath: `src/${preset}.ts` },
      );

      expect(result?.messages).toMatchObject([
        {
          ruleId: 'ai-i18n/no-unsubscribed-t',
          messageId: 'unsupportedInstanceTranslation',
          severity: 1,
        },
      ]);
    }
  });

  it('provides Chinese and English instance-member diagnostics', async () => {
    try {
      vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
      vi.resetModules();
      const chinese = await import('../src/rules/no-unsubscribed-t.js');
      expect(
        chinese.noUnsubscribedT.meta?.messages?.unsupportedInstanceTranslation,
      ).toContain('不支持');

      vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');
      vi.resetModules();
      const english = await import('../src/rules/no-unsubscribed-t.js');
      expect(
        english.noUnsubscribedT.meta?.messages?.unsupportedInstanceTranslation,
      ).toContain('does not support');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  tester.run(
    'no-unsubscribed-t rejects instance translation members in Options API',
    noUnsubscribedT,
    {
      valid: [
        {
          code: "export default { methods: { save() { return t('保存') } } }",
          filename: path.join(fixtureRoot, 'lexical-auto.ts'),
          options: autoVueOptions,
        },
        {
          code: "class LocalTranslator { t(value: string) { return value } save() { return this.t('保存') } }",
          filename: path.join(fixtureRoot, 'ordinary-class.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'export default defineComponent({',
            '  methods: {',
            '    t(value: string) { return value },',
            '    $t(value: string) { return value },',
            "    save() { return this.t('本地方法') },",
            "    cancel() { return this.$t('本地方法') },",
            '  },',
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'local-methods.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'const shared = {}',
            'export default defineComponent({',
            '  methods: {',
            '    save() { return this.t("来源未知") },',
            '  },',
            '  ...shared,',
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'root-spread.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'const sharedMethods = {}',
            'export default defineComponent({',
            '  methods: {',
            '    ...sharedMethods,',
            '    save() { return this.t("来源未知") },',
            '  },',
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'methods-spread.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'const base = {}',
            'const mixin = {}',
            'export default defineComponent({',
            '  extends: base,',
            '  mixins: [mixin],',
            '  methods: { save() { return this.$t("来源未知") } },',
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'options-inheritance.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'export default defineComponent({',
            '  data() { return { t: (value: string) => value } },',
            "  methods: { save() { return this.t('data 本地成员') } },",
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'local-data-member.ts'),
          options: autoVueOptions,
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'export default defineComponent({',
            '  data() {',
            '    if (Math.random()) return { t: (value: string) => value }',
            '    return { count: 0 }',
            '  },',
            "  methods: { save() { return this.t('data 来源未知') } },",
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'dynamic-data-member.ts'),
          options: autoVueOptions,
        },
        {
          code: "export default { methods: { save() { return this.t('其他用途') } } }",
          filename: path.join(fixtureRoot, 'non-vue-mode.ts'),
        },
      ],
      invalid: [
        {
          code: "export default { methods: { save() { return this.t('保存') } } }",
          filename: path.join(fixtureRoot, 'instance-t.ts'),
          options: autoVueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            "import { t as translate } from 'virtual:ai-i18n'",
            'export default defineComponent({',
            '  methods: {',
            '    t: translate,',
            "    save() { return this.t('显式 bridge') },",
            '  },',
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'explicit-bridge.ts'),
          options: vueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'export default defineComponent({',
            '  data() { return { count: 0 } },',
            "  methods: { save() { return this.t('不存在的实例成员') } },",
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'static-data-without-t.ts'),
          options: autoVueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: [
            "import { defineComponent } from 'vue'",
            'export default defineComponent({',
            '  setup() { const count = 0; return { count } },',
            "  methods: { save() { return this.$t('不存在的实例成员') } },",
            '})',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'static-setup-without-dollar-t.ts'),
          options: autoVueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: "import { defineComponent } from 'vue'; export default defineComponent({ methods: { save() { return this.$t('保存') } } })",
          filename: path.join(fixtureRoot, 'instance-dollar-t.ts'),
          options: vueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: "export default { computed: { label() { return this['t']('保存') } } }",
          filename: path.join(fixtureRoot, 'computed-instance-t.ts'),
          options: autoVueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
        {
          code: 'export default { methods: { label() { return this.t`你好 ${name}` } } }',
          filename: path.join(fixtureRoot, 'tagged-instance-t.ts'),
          options: autoVueOptions,
          errors: [{ messageId: 'unsupportedInstanceTranslation' }],
        },
      ],
    },
  );

  vueTester.run(
    'no-unsubscribed-t rejects instance translation members in SFC scripts and templates',
    noUnsubscribedT,
    {
      valid: [
        {
          code: [
            '<script lang="ts">',
            'export default {',
            "  methods: { save() { return t('脚本') } },",
            '}',
            '</script>',
            "<template>{{ t('模板') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Lexical.vue'),
          options: autoVueOptions,
        },
        {
          code: [
            '<script lang="ts">',
            'export default {',
            '  methods: {',
            '    t(value: string) { return value },',
            "    save() { return this.t('本地脚本方法') },",
            '  },',
            '}',
            '</script>',
            "<template>{{ this.t('本地模板方法') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'LocalMethods.vue'),
          options: autoVueOptions,
        },
        {
          code: [
            '<script lang="ts">',
            'const shared = {}',
            'export default {',
            '  mixins: [shared],',
            '  methods: { save() { return this.$t("来源未知") } },',
            '}',
            '</script>',
            "<template>{{ this.$t('来源未知') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'UnknownTemplateSource.vue'),
          options: autoVueOptions,
        },
      ],
      invalid: [
        {
          code: [
            '<script lang="ts">',
            'export default {',
            "  methods: { save() { return this.t('脚本') } },",
            '}',
            '</script>',
            "<template>{{ t('模板') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'Instance.vue'),
          options: autoVueOptions,
          errors: [
            {
              messageId: 'unsupportedInstanceTranslation',
              line: 3,
              column: 30,
            },
          ],
        },
        {
          code: [
            '<script lang="ts">',
            "import { t } from 'virtual:ai-i18n'",
            'export default {',
            '  methods: { t },',
            '}',
            '</script>',
            "<template>{{ this.t('显式 bridge') }}</template>",
          ].join('\n'),
          filename: path.join(fixtureRoot, 'ExplicitBridgeTemplate.vue'),
          options: vueOptions,
          errors: [
            {
              messageId: 'unsupportedInstanceTranslation',
              line: 7,
              column: 14,
            },
          ],
        },
        {
          code: "<template>{{ this.$t('模板') }}</template>",
          filename: path.join(fixtureRoot, 'TemplateInstance.vue'),
          options: autoVueOptions,
          errors: [
            {
              messageId: 'unsupportedInstanceTranslation',
              line: 1,
              column: 14,
            },
          ],
        },
      ],
    },
  );
});
