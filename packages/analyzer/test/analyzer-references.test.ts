import { describe, expect, it } from 'vitest';
import {
  analyzeModule,
  extractMessages,
  findDefineI18nMessagesCalls,
  findUnboundCalls,
  findUnboundReferences,
} from '../src/index';

describe('@ai-i18n/analyzer references and collections', () => {
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

  it('finds unbound auto-import value references without matching non-values', () => {
    const module = analyzeModule(
      `const switchLanguage = setLang
const runtime = { getLang, loadState: getLangLoadState }
type Setter = typeof setLang
const named = { setLang: 'property' }
setLang = localSetter
function local(getLang) { return getLang }
void runtime
void named`,
      'references.ts',
    );

    expect(
      findUnboundReferences(
        module,
        new Set(['setLang', 'getLang', 'getLangLoadState']),
      ),
    ).toEqual(['setLang', 'getLang', 'getLangLoadState']);
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

  it('does not coerce non-canonical array property names into indexes', () => {
    const module = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
const messages = defineI18nMessages(['zero', 'one'])
t(messages['1'])
t(messages['01'])`,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [{ source: 'one' }],
      warnings: [{ code: 'dynamic-argument' }],
    });
  });
});
