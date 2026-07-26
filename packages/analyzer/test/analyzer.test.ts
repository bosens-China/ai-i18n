import { describe, expect, it } from 'vitest';
import {
  analyzeModule,
  extractMessages,
  findDefineI18nMessagesCalls,
  findInvalidDefineI18nMessagesReferences,
  findUnboundCalls,
  validateRecommendedUsage,
} from '../src/index';

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

  it('extracts static translation options', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
const options = { id: ' checkout.submit ', comment: '结算按钮' }
t('提交', options)
t('保存', { comment: '工具栏按钮' })`,
      'View.tsx',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [
        {
          id: 'checkout.submit',
          source: '提交',
          comment: '结算按钮',
        },
        { id: '保存', source: '保存', comment: '工具栏按钮' },
      ],
      warnings: [],
      pending: false,
    });
  });

  it('rejects legacy string comments', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
t('保存', '工具栏按钮')`,
      'View.tsx',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [],
      warnings: [{ code: 'dynamic-argument', line: 2 }],
      pending: false,
    });
  });

  it('reports invalid and conflicting explicit IDs', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
t('无效', { id: ' ' })
t('提交', { id: 'action', comment: '结算' })
t('保存', { id: 'action', comment: '工具栏' })`,
      'View.tsx',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [{ id: 'action', source: '提交', comment: '结算' }],
      warnings: [
        { code: 'invalid-message-id', line: 2 },
        { code: 'conflicting-message-id', line: 4 },
      ],
    });
  });

  it('keeps unresolved option fields pending', () => {
    const module = analyzeModule(
      `import { id } from './options'
import { t } from 'virtual:ai-i18n'
t('提交', { id })`,
      'View.tsx',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [],
      warnings: [{ code: 'unresolved-argument', line: 3 }],
      pending: true,
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

  it('extracts tagged templates with numbered interpolation placeholders', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
const name = getName()
t\`你好 \${name}，你有 \${items.length} 条消息\``,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [{ source: '你好 {{0}}，你有 {{1}} 条消息' }],
      warnings: [],
      pending: false,
    });

    const autoImported = analyzeModule('t`你好 ${name}`', 'auto.ts');
    expect(findUnboundCalls(autoImported, new Set(['t']))).toEqual(['t']);
  });

  it('escapes placeholder-shaped text in calls and template literals', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
t('字面 {{0}} 与 {{=1}}')
t\`字面 {{0}}，当前值 \${value}\``,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [
        { source: '字面 {{=0}} 与 {{==1}}' },
        { source: '字面 {{=0}}，当前值 {{0}}' },
      ],
      warnings: [],
    });
  });

  it('extracts static collection members and finite dynamic indexes', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
const shared = { cancel: '取消' }
const messages = defineI18nMessages({
  ...shared,
  save: '保' + '存',
  states: ['等待中', '处理中', '已完成'],
})
t(messages.save)
t(messages.states[index])
t(ok && messages.cancel)`,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [
        { source: '保存' },
        { source: '等待中' },
        { source: '处理中' },
        { source: '已完成' },
        { source: '取消' },
      ],
      warnings: [],
    });
    expect(findDefineI18nMessagesCalls(module)).toEqual([
      expect.objectContaining({
        argument: expect.objectContaining({
          start: expect.any(Number),
          end: expect.any(Number),
        }),
      }),
    ]);
  });

  it('keeps extraction tolerant while reporting non-recommended syntax', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
let label = '可提取但应使用 const'
const plain = { save: '普通对象' }
const messages = defineI18nMessages({ save: '保' + '存' })
t(label)
t(plain.save)
t(messages.save)
t(ok && '逻辑表达式')`,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [
        { source: '可提取但应使用 const' },
        { source: '普通对象' },
        { source: '保存' },
        { source: '逻辑表达式' },
      ],
      warnings: [],
    });
    expect(validateRecommendedUsage(module)).toMatchObject([
      { code: 'mutable-binding' },
      { code: 'unmarked-member' },
      { code: 'non-recommended-argument' },
      { code: 'non-recommended-argument' },
    ]);
  });

  it('rejects treating the compiler macro as a runtime value', () => {
    const module = analyzeModule('const macro = defineI18nMessages', 'main.ts');

    expect(findInvalidDefineI18nMessagesReferences(module)).toHaveLength(1);
    expect(validateRecommendedUsage(module)).toMatchObject([
      { code: 'invalid-macro' },
    ]);
  });
});
