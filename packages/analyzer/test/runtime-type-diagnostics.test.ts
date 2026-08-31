import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '../src/index';

describe('Runtime t type diagnostics', () => {
  it.each([
    [
      'renamed type import',
      `import type { I18nRuntime as Runtime } from '@ai-i18n/vite'
function display(translate: Runtime['t']) { return translate('保存') }`,
      'translate',
    ],
    [
      'core type import',
      `import type { I18nRuntime } from '@ai-i18n/core'
function display(t: I18nRuntime['t']) { return t('保存') }`,
      't',
    ],
    [
      'import type expression',
      `function display(t: import('@ai-i18n/vite').I18nRuntime['t']) {
  return t\`已保存 \${name}\`
}`,
      't',
    ],
  ])('warns for a local %s', (_name, source, binding) => {
    const result = extractMessages(analyzeModule(source, 'helper.ts'));

    expect(result.messages).toEqual([]);
    expect(result.warnings).toMatchObject([
      {
        code: 'unrecognized-runtime-t-binding',
        line: expect.any(Number),
        message: expect.stringContaining(binding),
      },
    ]);
  });

  it('does not warn for an unrelated typed function or a Runtime import', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
function display(t: (value: string) => string) { return t('局部') }
t('保存')`,
      'helper.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [{ source: '保存' }],
      warnings: [],
    });
  });
});
