import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import { noUnsubscribedRuntimeState } from '../../../index';

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ai-i18n-eslint-runtime-state-'),
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

describe('ai-i18n/no-unsubscribed-runtime-state', () => {
  it('uses framework-neutral diagnostics', () => {
    expect(
      noUnsubscribedRuntimeState.meta?.messages?.renderSnapshot,
    ).not.toContain('React');
  });

  tester.run('no-unsubscribed-runtime-state', noUnsubscribedRuntimeState, {
    valid: [
      {
        code: "import { getLang } from 'virtual:ai-i18n'; export function currentLanguage() { return getLang() }",
        filename: path.join(fixtureRoot, 'utility.ts'),
      },
      {
        code: "import { getLang } from 'virtual:ai-i18n'; export function App() { console.log(getLang()); return <span>Language</span> }",
        filename: path.join(fixtureRoot, 'console.tsx'),
      },
      {
        code: "import { getLang } from 'virtual:ai-i18n'; export function App() { return <button onClick={() => log(getLang())}>Read</button> }",
        filename: path.join(fixtureRoot, 'event.tsx'),
      },
      {
        code: "import { useI18n } from 'virtual:ai-i18n'; export function App() { const { currentLang, langLoadState } = useI18n(); return <span>{currentLang}:{langLoadState.status}</span> }",
        filename: path.join(fixtureRoot, 'hook.tsx'),
      },
      {
        code: "const getLang = () => 'local'; export function App() { return <span>{getLang()}</span> }",
        filename: path.join(fixtureRoot, 'local.tsx'),
        options: [{ autoImport: ['getLang', 'getLangLoadState'] }],
      },
      {
        code: 'export function getLanguage(getLang: () => string) { return getLang() }',
        filename: path.join(fixtureRoot, 'shadowed.ts'),
        options: [{ autoImport: true }],
      },
      {
        code: "import { getLang } from 'virtual:ai-i18n'; export default { methods: { read() { return getLang() } } }",
        filename: path.join(fixtureRoot, 'options-method.ts'),
        options: [{ framework: 'vue' }],
      },
      {
        code: "import { getLangLoadState } from 'virtual:ai-i18n'; export default { data() { return { readState: () => getLangLoadState() } } }",
        filename: path.join(fixtureRoot, 'options-data-lazy.ts'),
        options: [{ framework: 'vue' }],
      },
    ],
    invalid: [
      {
        code: "import { getLang } from 'virtual:ai-i18n'; export const initialLang = getLang()",
        filename: path.join(fixtureRoot, 'module.ts'),
        errors: [{ messageId: 'moduleSnapshot' }],
      },
      {
        code: "import { getLang as readLang } from 'virtual:ai-i18n'; export function App() { return <span>{readLang()}</span> }",
        filename: path.join(fixtureRoot, 'alias.tsx'),
        errors: [{ messageId: 'renderSnapshot' }],
      },
      {
        code: "import { getLangLoadState } from 'virtual:ai-i18n'; export function App() { const state = getLangLoadState(); return <span>{state.status}</span> }",
        filename: path.join(fixtureRoot, 'load-state.tsx'),
        errors: [{ messageId: 'renderSnapshot' }],
      },
      {
        code: 'export const App = () => <span>{getLang()}</span>',
        filename: path.join(fixtureRoot, 'auto-import.tsx'),
        options: [{ autoImport: ['getLang'] }],
        errors: [{ messageId: 'renderSnapshot' }],
      },
      {
        code: 'const initialState = getLangLoadState()',
        filename: path.join(fixtureRoot, 'auto-import-module.ts'),
        options: [{ autoImport: true }],
        errors: [{ messageId: 'moduleSnapshot' }],
      },
      {
        code: "import { getLang } from 'virtual:ai-i18n'; import { defineComponent } from 'vue'; export default defineComponent({ setup() { const lang = getLang(); return { lang } } })",
        filename: path.join(fixtureRoot, 'vue-setup.ts'),
        options: [{ framework: 'vue' }],
        errors: [{ messageId: 'vueSetupSnapshot' }],
      },
      {
        code: "import { getLangLoadState } from 'virtual:ai-i18n'; export default { data() { return { state: getLangLoadState() } } }",
        filename: path.join(fixtureRoot, 'vue-options-data.ts'),
        options: [{ framework: 'vue' }],
        errors: [{ messageId: 'optionsDataSnapshot' }],
      },
      {
        code: "import { defineComponent } from 'vue'; export default defineComponent({ setup: () => ({ lang: getLang() }) })",
        filename: path.join(fixtureRoot, 'vue-setup-auto.ts'),
        options: [{ autoImport: ['getLang'], framework: 'vue' }],
        errors: [{ messageId: 'vueSetupSnapshot' }],
      },
    ],
  });

  vueTester.run(
    'no-unsubscribed-runtime-state in Vue templates',
    noUnsubscribedRuntimeState,
    {
      valid: [
        {
          code: [
            '<script setup lang="ts">',
            "import { useI18n } from 'virtual:ai-i18n'",
            'const { currentLang } = useI18n()',
            '</script>',
            '<template>{{ currentLang }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'hook.vue'),
        },
        {
          code: [
            '<script setup lang="ts">',
            "import { getLang } from 'virtual:ai-i18n'",
            '</script>',
            '<template><button @click="log(getLang())">Read</button></template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'event.vue'),
        },
        {
          code: [
            '<script setup lang="ts">',
            'defineProps<{ readers: Array<() => string> }>()',
            '</script>',
            '<template><span v-for="getLang in readers">{{ getLang() }}</span></template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'shadowed.vue'),
          options: [{ autoImport: ['getLang'] }],
        },
        {
          code: [
            '<script setup lang="ts">',
            "const getLang = () => 'local'",
            '</script>',
            '<template>{{ getLang() }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'script-local.vue'),
          options: [{ autoImport: ['getLang'] }],
        },
      ],
      invalid: [
        {
          code: [
            '<script setup lang="ts">',
            "import { getLang } from 'virtual:ai-i18n'",
            '</script>',
            '<template>{{ getLang() }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'runtime.vue'),
          errors: [{ messageId: 'vueRenderSnapshot', line: 4, column: 14 }],
        },
        {
          code: [
            '<script setup lang="ts">',
            '</script>',
            '<template>{{ getLangLoadState().status }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'auto-import.vue'),
          options: [{ autoImport: ['getLangLoadState'] }],
          errors: [{ messageId: 'vueRenderSnapshot', line: 3, column: 14 }],
        },
        {
          code: [
            '<script lang="ts">',
            "import { getLang } from 'virtual:ai-i18n'",
            'export default {',
            '  data() { return { lang: getLang() } },',
            '}',
            '</script>',
            '<template>{{ lang }}</template>',
          ].join('\n'),
          filename: path.join(fixtureRoot, 'options-data.vue'),
          options: [{ framework: 'vue' }],
          errors: [{ messageId: 'optionsDataSnapshot', line: 4, column: 27 }],
        },
      ],
    },
  );
});
