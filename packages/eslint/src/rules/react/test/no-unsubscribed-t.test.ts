import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe } from 'vitest';
import { noUnsubscribedT } from '../../../index';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('React no-unsubscribed-t policy', () => {
  tester.run(
    'requires the subscribed hook translator in JSX',
    noUnsubscribedT,
    {
      valid: [
        {
          code: "import { useI18n } from 'virtual:ai-i18n'; export function App() { const { t } = useI18n(); return <button>{t('保存')}</button> }",
          filename: path.resolve('Subscribed.tsx'),
          options: [{ framework: 'react' }],
        },
      ],
      invalid: [
        {
          code: "import { t } from 'virtual:ai-i18n'; export function App() { return <button>{t('保存')}</button> }",
          filename: path.resolve('Unsubscribed.tsx'),
          options: [{ framework: 'react' }],
          errors: [{ messageId: 'unsubscribedT' }],
        },
      ],
    },
  );
});
