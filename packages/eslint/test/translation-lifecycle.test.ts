import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe } from 'vitest';
import { noEagerTranslation } from '../src/index';

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ai-i18n-eslint-lifecycle-'),
);
fs.writeFileSync(
  path.join(fixtureRoot, 'bridge.ts'),
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

describe('ai-i18n/no-eager-translation', () => {
  tester.run('no-eager-translation', noEagerTranslation, {
    valid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; export function getLabel() { return t('保存') }",
        filename: path.join(fixtureRoot, 'function.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export const getLabel = () => t('保存')",
        filename: path.join(fixtureRoot, 'arrow.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export const labels = { get save() { return t('保存') } }",
        filename: path.join(fixtureRoot, 'getter.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; button.addEventListener('click', () => toast(t('保存成功')))",
        filename: path.join(fixtureRoot, 'event.ts'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; console.log(t('启动'))",
        filename: path.join(fixtureRoot, 'side-effect.ts'),
      },
      {
        code: "import { t } from 'another-i18n'; export const label = t('其他库')",
        filename: path.join(fixtureRoot, 'other-library.ts'),
      },
      {
        code: "function run(t) { return t('局部') }; export const label = t('未绑定')",
        filename: path.join(fixtureRoot, 'unbound.ts'),
      },
      {
        code: "const t = (value: string) => value; export const label = t('局部')",
        filename: path.join(fixtureRoot, 'auto-import-shadow.ts'),
        options: [{ autoImport: ['t'] }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; const defineComponent = (value: unknown) => value; export default defineComponent({ setup() { return { label: t('本地同名') } } })",
        filename: path.join(fixtureRoot, 'local-define-component.ts'),
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export const label = tRef('响应式')",
        filename: path.join(fixtureRoot, 'translated-ref.ts'),
      },
    ],
    invalid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; export const label = t('保存')",
        filename: path.join(fixtureRoot, 'export.ts'),
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: "import { t as tr } from 'virtual:ai-i18n'; const menu = { label: tr('菜单') }; const labels = [tr`共 ${count} 项`]",
        filename: path.join(fixtureRoot, 'collections.ts'),
        errors: [
          { messageId: 'eagerTranslation' },
          { messageId: 'eagerTranslation' },
        ],
      },
      {
        code: "import { t as tr } from './bridge'; export default tr('默认导出')",
        filename: path.join(fixtureRoot, 're-export.ts'),
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: "export const label = t('自动导入')",
        filename: path.join(fixtureRoot, 'auto-import.ts'),
        options: [{ autoImport: ['t'] }],
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; let label; label = t('赋值'); class View { label = t('字段') }",
        filename: path.join(fixtureRoot, 'assignments.ts'),
        errors: [
          { messageId: 'eagerTranslation' },
          { messageId: 'eagerTranslation' },
        ],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; function run(t: (value: string) => string) { return t('局部') }; export const label = t('外层')",
        filename: path.join(fixtureRoot, 'import-shadow.ts'),
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: 'export const label = t`自动导入 ${count}`',
        filename: path.join(fixtureRoot, 'auto-import-tagged-template.ts'),
        options: [{ autoImport: ['t'] }],
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: "import { defineComponent } from 'vue'; import { t } from 'virtual:ai-i18n'; export default defineComponent({ setup() { return { label: t('TS 直接返回') } } })",
        filename: path.join(fixtureRoot, 'vue-component.ts'),
        errors: [{ messageId: 'eagerTranslation' }],
      },
      {
        code: "import { defineComponent as component } from 'vue'; import * as Vue from 'vue'; import { t } from 'virtual:ai-i18n'; export const Aliased = component({ setup: function () { const label = t('别名'); return { label } } }); export const Namespaced = Vue.defineComponent({ setup: () => ({ label: t('命名空间') }) }); export const Functional = component(() => { const label = t('函数签名'); return () => <span>{label}</span> })",
        filename: path.join(fixtureRoot, 'vue-components.tsx'),
        errors: [
          { messageId: 'eagerTranslation' },
          { messageId: 'eagerTranslation' },
          { messageId: 'eagerTranslation' },
        ],
      },
    ],
  });

  vueTester.run('no-eager-translation in Vue SFC', noEagerTranslation, {
    valid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { tRef } from 'virtual:ai-i18n'",
          "const label = tRef('响应式')",
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'TranslatedRef.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { computed } from 'vue'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t: translate } = useI18n()',
          "const label = computed(() => translate('响应式'))",
          "const getLabel = () => translate('延迟')",
          '</script>',
          "<template>{{ label }} {{ translate('模板') }}</template>",
        ].join('\n'),
        filename: path.join(fixtureRoot, 'Lazy.vue'),
      },
      {
        code: [
          '<script lang="ts">',
          "import { defineComponent } from 'vue'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'export default defineComponent({',
          '  setup() {',
          '    const { t } = useI18n()',
          "    const getLabel = () => t('延迟')",
          "    function getNamedLabel() { return t('普通函数') }",
          "    const labels = { get save() { return t('Getter') } }",
          "    const onClick = () => toast(t('事件'))",
          '    return { getLabel, getNamedLabel, labels, onClick }',
          '  },',
          '})',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'LazyOptions.vue'),
      },
      {
        code: [
          '<script lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const helper = {',
          '  setup() {',
          '    const { t } = useI18n()',
          "    const label = t('普通对象方法')",
          '    return { label }',
          '  },',
          '}',
          'void helper',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'UnrelatedSetup.vue'),
      },
    ],
    invalid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t } = useI18n()',
          "const label = t('快照')",
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'Snapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 4,
            column: 15,
          },
        ],
      },
      {
        code: [
          '<script lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'export default {',
          '  setup() {',
          '    const { t } = useI18n()',
          "    const label = t('Options 快照')",
          '    return { label }',
          '  },',
          '}',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'OptionsSnapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 6,
            column: 19,
          },
        ],
      },
      {
        code: [
          '<script lang="ts">',
          "import { defineComponent } from 'vue'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'export default defineComponent({',
          '  setup: function () {',
          '    const { t } = useI18n()',
          "    const label = t('Function 快照')",
          '    return { label }',
          '  },',
          '})',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'FunctionSetupSnapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 7,
            column: 19,
          },
        ],
      },
      {
        code: [
          '<script lang="ts">',
          "import { defineComponent } from 'vue'",
          "import { useI18n } from 'virtual:ai-i18n'",
          'export default defineComponent({',
          '  setup: () => {',
          '    const { t } = useI18n()',
          "    const label = t('Arrow 快照')",
          '    return { label }',
          '  },',
          '})',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'ArrowSetupSnapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 7,
            column: 19,
          },
        ],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n as useTranslation } from 'virtual:ai-i18n'",
          'const { t: translate } = useTranslation()',
          "const label = translate('别名快照')",
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'AliasedSnapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 4,
            column: 15,
          },
        ],
      },
      {
        code: [
          '<script lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'export default {',
          '  setup() {',
          '    const { t } = useI18n()',
          "    return { label: t('直接返回快照') }",
          '  },',
          '}',
          '</script>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'ReturnedSnapshot.vue'),
        errors: [
          {
            messageId: 'eagerTranslation',
            line: 6,
            column: 21,
          },
        ],
      },
    ],
  });
});
