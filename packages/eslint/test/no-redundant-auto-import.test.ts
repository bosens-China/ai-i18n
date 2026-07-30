import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noRedundantAutoImport } from '../src/index';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
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
      options: [{ autoImport: ['t', 'tRef', 'useI18n'] }],
    },
    {
      code: "import { t as translate } from 'virtual:ai-i18n'",
      options: [{ autoImport: ['t'] }],
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
