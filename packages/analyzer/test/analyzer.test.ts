import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages, findUnboundCalls } from '../src/index';

const hooks = [
  {
    module: 'virtual:ai-i18n',
    hook: 'useI18n',
    property: 't',
    autoImport: true,
  },
] as const;

describe('@ai-i18n/analyzer', () => {
  it('shares Hook member and undefined-comment semantics', () => {
    const module = analyzeModule(
      `import { useI18n } from 'virtual:ai-i18n'
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
      `const { t } = useI18n()
t(props.label)`,
      'View.tsx',
    );

    expect(extractMessages(module, undefined, hooks)).toMatchObject({
      messages: [],
      warnings: [{ code: 'dynamic-argument', line: 2, column: 0 }],
    });
  });

  it('finds only unbound auto-import calls', () => {
    const module = analyzeModule(
      `t('自动导入')
function local(t) { t('局部') }
useI18n()`,
      'main.ts',
    );

    expect(findUnboundCalls(module, new Set(['t', 'useI18n']))).toEqual([
      't',
      'useI18n',
    ]);
    expect(extractMessages(module, undefined, [], true)).toMatchObject({
      messages: [{ source: '自动导入' }],
    });
  });
});
