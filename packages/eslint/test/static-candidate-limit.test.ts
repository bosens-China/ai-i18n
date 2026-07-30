import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { staticCandidateLimit } from '../src/index';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('ai-i18n/static-candidate-limit', () => {
  it('classifies candidate limits as suggestions', () => {
    expect(staticCandidateLimit.meta?.type).toBe('suggestion');
  });

  tester.run('static-candidate-limit', staticCandidateLimit, {
    valid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; const messages = defineI18nMessages(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']); t(messages[index])",
        filename: path.resolve('configured-limit-valid.ts'),
        options: [{ maxStaticCandidates: 10 }],
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; tRef({ first: 'a', second: 'b' })",
        filename: path.resolve('custom-limit-valid.ts'),
        options: [{ maxStaticCandidates: 2 }],
      },
    ],
    invalid: [
      {
        code: "import { t } from 'virtual:ai-i18n'; const messages = defineI18nMessages(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']); t(messages[index])",
        filename: path.resolve('configured-limit-invalid.ts'),
        options: [{ maxStaticCandidates: 10 }],
        errors: [{ messageId: 'candidateLimit' }],
      },
      {
        code: "import { tRef } from 'virtual:ai-i18n'; tRef({ first: 'a', second: ['b', 'c'] })",
        filename: path.resolve('custom-limit-invalid.ts'),
        options: [{ maxStaticCandidates: 2 }],
        errors: [{ messageId: 'candidateLimit' }],
      },
    ],
  });
});
