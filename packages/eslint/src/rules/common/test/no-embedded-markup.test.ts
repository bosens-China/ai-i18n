import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { noEmbeddedMarkup } from '../../../index';
import {
  sourceRoot,
  tester,
  tsconfigPath,
  vueTester,
} from './translation-rule-fixture';

describe('ai-i18n/no-embedded-markup', () => {
  it('classifies embedded markup as a suggestion', () => {
    expect(noEmbeddedMarkup.meta?.type).toBe('suggestion');
  });

  tester.run(
    'works across JavaScript, TypeScript and React',
    noEmbeddedMarkup,
    {
      valid: [
        {
          code: [
            "import { t } from 'virtual:ai-i18n'",
            't(`这是一段很长但语义完整的说明。\\n第二行继续补充必要的语境。\\n第三行仍然是需要整体翻译的自然语言。`)',
            't`${year}年${month}月${day}日，${user}在${location}执行了${action}`',
            "t(ok ? '保存成功' : '保存失败')",
            "t({ save: '保存', description: '一段完整的说明' })",
          ].join('\n'),
          filename: path.join(sourceRoot, 'valid-units.ts'),
        },
        {
          code: [
            "import { t } from 'virtual:ai-i18n'",
            "const valueHtml = '<span>高温</span>'",
            't`温度：${valueHtml}`',
            "t('1 < 2 > 0')",
            "t('&lt;div&gt;')",
            "t('**保存**')",
          ].join('\n'),
          filename: path.join(sourceRoot, 'valid-structures.js'),
        },
        {
          code: "import { t } from 'another-i18n'; t('<strong>不属于 ai-i18n</strong>')",
          filename: path.join(sourceRoot, 'other-library.ts'),
        },
        {
          code: "function t(value) { return value } t('<strong>局部函数</strong>')",
          filename: path.join(sourceRoot, 'shadowed-auto-import.js'),
          options: [{ autoImport: ['t'] }],
        },
      ],
      invalid: [
        {
          code: "import { t } from 'virtual:ai-i18n'; t('<div>保存</div>')",
          filename: path.join(sourceRoot, 'direct.js'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: 'import { t } from \'virtual:ai-i18n\'; t`<div>温度：<span style="color:${color}">${temp}℃</span></div>`',
          filename: path.join(sourceRoot, 'tagged.ts'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "import { t } from 'virtual:ai-i18n'; const message = '<strong>保存</strong>'; t(message)",
          filename: path.join(sourceRoot, 'local-const.ts'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "import { MARKUP } from '@/texts'; import { t } from 'virtual:ai-i18n'; t(MARKUP)",
          filename: path.join(sourceRoot, 'imported-const.ts'),
          options: [{ tsconfigPath }],
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "import { t } from 'virtual:ai-i18n'; t(ok ? '保存' : '<b>失败</b>')",
          filename: path.join(sourceRoot, 'conditional.ts'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "import { t } from 'virtual:ai-i18n'; t({ save: '<b>保存</b>', cancel: '<i>取消</i>' })",
          filename: path.join(sourceRoot, 'tree.ts'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "import { t } from 'virtual:ai-i18n'; t('<!-- note -->保存'); t('<svg><text>状态</text></svg>')",
          filename: path.join(sourceRoot, 'comment-svg.ts'),
          errors: [
            { messageId: 'embeddedMarkup' },
            { messageId: 'embeddedMarkup' },
          ],
        },
        {
          code: "import { tRef, tComputed } from 'virtual:ai-i18n'; tRef('<strong>Ref</strong>'); tComputed('<em>Computed</em>')",
          filename: path.join(sourceRoot, 'vue-apis.ts'),
          errors: [
            { messageId: 'embeddedMarkup' },
            { messageId: 'embeddedMarkup' },
          ],
        },
        {
          code: "import { useI18n } from 'virtual:ai-i18n'; export function View() { const { t } = useI18n(); return <div>{t('<strong>保存</strong>')}</div> }",
          filename: path.join(sourceRoot, 'View.tsx'),
          errors: [{ messageId: 'embeddedMarkup' }],
        },
        {
          code: "export function View() { const { t } = useI18n(); return <div>{t('<strong>保存</strong>')}</div> }",
          filename: path.join(sourceRoot, 'AutoView.jsx'),
          options: [{ autoImport: ['useI18n'] }],
          errors: [{ messageId: 'embeddedMarkup' }],
        },
      ],
    },
  );

  vueTester.run('works in Vue SFC scripts and templates', noEmbeddedMarkup, {
    valid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { t } from 'virtual:ai-i18n'",
          "const html = '<strong>保存</strong>'",
          'const label = t`操作：${html}`',
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'Valid.vue'),
      },
    ],
    invalid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { t } from 'virtual:ai-i18n'",
          "const label = t('<strong>保存</strong>')",
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(sourceRoot, 'Script.vue'),
        errors: [{ messageId: 'embeddedMarkup', line: 3 }],
      },
      {
        code: "<template>{{ t('<strong>保存</strong>') }}</template>",
        filename: path.join(sourceRoot, 'Template.vue'),
        options: [{ autoImport: ['t'] }],
        errors: [{ messageId: 'embeddedMarkup', line: 1 }],
      },
    ],
  });
});
