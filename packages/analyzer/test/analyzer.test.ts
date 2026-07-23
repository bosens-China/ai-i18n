import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '../src/index';

const hooks = [
  { module: '@ai-i18n/react', hook: 'useI18n', property: 't' },
  { module: '@ai-i18n/vue', hook: 'useI18n', property: 't' },
] as const;

describe('@ai-i18n/analyzer', () => {
  it('shares Hook member and undefined-comment semantics', () => {
    const module = analyzeModule(
      `import { useI18n } from '@ai-i18n/react'
const i18n = useI18n()
i18n.t('成员调用', undefined)
i18n['t']('计算成员')`,
      'View.tsx',
    );

    expect(extractMessages(module, undefined, hooks)).toMatchObject({
      messages: [{ source: '成员调用' }, { source: '计算成员' }],
      warnings: [],
      pending: false,
    });
  });

  it('returns a shared diagnostic kind for dynamic arguments', () => {
    const module = analyzeModule(
      `import { useI18n } from '@ai-i18n/vue'
const { t } = useI18n()
t(props.label)`,
      'View.tsx',
    );

    expect(extractMessages(module, undefined, hooks)).toMatchObject({
      messages: [],
      warnings: [{ code: 'dynamic-argument', line: 3, column: 0 }],
    });
  });
});
