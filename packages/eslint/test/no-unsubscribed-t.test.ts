import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import { noUnsubscribedT } from '../src/index';

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ai-i18n-eslint-unsubscribed-'),
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

describe('ai-i18n/no-unsubscribed-t', () => {
  it('uses a framework-neutral diagnostic', () => {
    expect(noUnsubscribedT.meta?.messages?.unsubscribedT).not.toContain(
      'React',
    );
  });

  tester.run('no-unsubscribed-t', noUnsubscribedT, {
    valid: [
      {
        code: "import { useI18n } from 'virtual:ai-i18n'; export function App() { 'use memo'; const { t } = useI18n(); const label = t('保存'); return <button>{label}</button> }",
        filename: path.join(fixtureRoot, 'hook.tsx'),
      },
      {
        code: "import { useI18n } from 'virtual:ai-i18n'; export function App() { const i18n = useI18n(); return <button>{i18n.t('保存')}</button> }",
        filename: path.join(fixtureRoot, 'hook-member.tsx'),
      },
      {
        code: "import { useI18n as useTranslation } from 'virtual:ai-i18n'; export function App() { const { t: translate } = useTranslation(); return <button>{translate('保存')}</button> }",
        filename: path.join(fixtureRoot, 'hook-alias.tsx'),
      },
      {
        code: "export function App() { const { t: translate } = useI18n(); return <button>{translate('保存')}</button> }",
        filename: path.join(fixtureRoot, 'auto-import-hook.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { return <button onClick={() => toast(t('保存成功'))}>保存</button> }",
        filename: path.join(fixtureRoot, 'event.tsx'),
      },
      {
        code: "import { t as translate } from 'virtual:ai-i18n'; export function App() { return <button onClick={() => toast(translate('保存成功'))}>保存</button> }",
        filename: path.join(fixtureRoot, 'aliased-event.tsx'),
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { console.log(t('调试')); return <button>保存</button> }",
        filename: path.join(fixtureRoot, 'render-side-effect.tsx'),
      },
      {
        code: "export function App() { function handleClick() { toast(t('保存成功')) }; return <button onClick={handleClick}>保存</button> }",
        filename: path.join(fixtureRoot, 'auto-import-named-event.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function getLabel() { return t('工具函数') }",
        filename: path.join(fixtureRoot, 'utility.tsx'),
      },
      {
        code: "import { t } from 'another-i18n'; export function App() { return <button>{t('其他库')}</button> }",
        filename: path.join(fixtureRoot, 'other-library.tsx'),
      },
      {
        code: "export function App(t) { return <button>{t('局部')}</button> }",
        filename: path.join(fixtureRoot, 'shadowed.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App(t: (value: string) => string) { return <button>{t('局部')}</button> }",
        filename: path.join(fixtureRoot, 'import-shadowed.tsx'),
      },
      {
        code: "const t = (value: string) => value; export function App() { return <button>{t('局部')}</button> }",
        filename: path.join(fixtureRoot, 'auto-import-local-shadow.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
    ],
    invalid: [
      {
        code: "import { tRef } from 'virtual:ai-i18n'; export function Panel() { return <p>{tRef('渲染')}</p> }",
        filename: path.join(fixtureRoot, 'render-ref.tsx'),
        errors: [{ messageId: 'renderTRef' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function VueButton() { return <button>{t('保存')}</button> }",
        filename: path.join(fixtureRoot, 'vue-render.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { 'use memo'; return <button>{t('保存')}</button> }",
        filename: path.join(fixtureRoot, 'compiler.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t as tr } from 'virtual:ai-i18n'; export function App() { 'use no memo'; const label = tr('保存'); return <button>{label}</button> }",
        filename: path.join(fixtureRoot, 'compiler-opt-out.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "export const App = () => <button>{t('自动导入')}</button>",
        filename: path.join(fixtureRoot, 'auto-import.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { const { currentLang } = useI18n(); return <p>{currentLang}: {t`语言 ${currentLang}`}</p> }",
        filename: path.join(fixtureRoot, 'unrelated-hook.tsx'),
        options: [{ autoImport: ['t', 'useI18n'] }],
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function List() { return <ul>{items.map((item) => <li>{t(item.label)}</li>)}</ul> }",
        filename: path.join(fixtureRoot, 'map.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { persist(t('持久化')); return <button>保存</button> }",
        filename: path.join(fixtureRoot, 'unknown-side-effect.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
      {
        code: "import { t } from 'virtual:ai-i18n'; export function App() { cache.set('label', t('缓存')); return <button>保存</button> }",
        filename: path.join(fixtureRoot, 'cache-side-effect.tsx'),
        errors: [{ messageId: 'unsubscribedT' }],
      },
    ],
  });

  vueTester.run('no-unsubscribed-t in Vue templates', noUnsubscribedT, {
    valid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { tRef } from 'virtual:ai-i18n'",
          "const label = tRef('Setup')",
          '</script>',
          '<template>{{ label }}</template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'translated-ref.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const { t } = useI18n()',
          '</script>',
          "<template>{{ t('Hook') }}</template>",
        ].join('\n'),
        filename: path.join(fixtureRoot, 'hook.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { useI18n } from 'virtual:ai-i18n'",
          'const i18n = useI18n()',
          '</script>',
          "<template>{{ i18n.t('Hook member') }}</template>",
        ].join('\n'),
        filename: path.join(fixtureRoot, 'hook-member.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { t } from 'virtual:ai-i18n'",
          '</script>',
          '<template><button @click="t(\'事件\')">保存</button></template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'event.vue'),
      },
      {
        code: [
          '<script setup lang="ts">',
          'defineProps<{ translators: Array<(value: string) => string> }>()',
          '</script>',
          '<template><span v-for="t in translators">{{ t(\'局部\') }}</span></template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'v-for-local.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import Provider from './Provider.vue'",
          '</script>',
          '<template><Provider v-slot="{ t }">{{ t(\'插槽\') }}</Provider></template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'slot-local.vue'),
        options: [{ autoImport: ['t', 'useI18n'] }],
      },
    ],
    invalid: [
      {
        code: [
          '<script setup lang="ts">',
          "import { tRef } from 'virtual:ai-i18n'",
          '</script>',
          "<template>{{ tRef('Render') }}</template>",
        ].join('\n'),
        filename: path.join(fixtureRoot, 'render-ref.vue'),
        errors: [{ messageId: 'renderTRef', line: 4, column: 14 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { t } from 'virtual:ai-i18n'",
          '</script>',
          "<template>{{ t('Runtime') }}</template>",
        ].join('\n'),
        filename: path.join(fixtureRoot, 'runtime.vue'),
        errors: [{ messageId: 'unsubscribedT', line: 4, column: 14 }],
      },
      {
        code: [
          '<script setup lang="ts">',
          "import { t as translate } from 'virtual:ai-i18n'",
          'const name = "Ada"',
          '</script>',
          '<template>{{ translate`你好 ${name}` }}</template>',
        ].join('\n'),
        filename: path.join(fixtureRoot, 'runtime-tagged.vue'),
        errors: [{ messageId: 'unsubscribedT', line: 5, column: 14 }],
      },
    ],
  });
});
