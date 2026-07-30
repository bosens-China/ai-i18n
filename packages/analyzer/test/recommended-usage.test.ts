import { describe, expect, it } from 'vitest';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  analyzeModule,
  extractMessages,
  findInvalidDefineI18nMessagesReferences,
  validateRecommendedUsage,
} from '../src/index';

describe('recommended translation usage', () => {
  it('accepts whole static message trees without requiring the macro', () => {
    const module = analyzeModule(
      `import { t, tRef } from 'virtual:ai-i18n'
const messages = { save: '保存', states: ['等待中', '已完成'] }
t(messages)
tRef({ cancel: '取消', metadata: { count: 2, enabled: true } })`,
      'main.ts',
    );

    expect(extractMessages(module)).toMatchObject({
      messages: [
        { source: '保存' },
        { source: '等待中' },
        { source: '已完成' },
        { source: '取消' },
      ],
      warnings: [],
    });
    expect(validateRecommendedUsage(module)).toEqual([]);
  });

  it('accepts Vue compiler unref wrappers around imported messages', () => {
    const analyzer = new Analyzer({
      resolve(specifier) {
        if (specifier === AI_I18N_VIRTUAL_MODULE_ID) return specifier;
        return specifier === './messages' ? '/messages.ts' : null;
      },
    });
    analyzer.addFile(
      AI_I18N_VIRTUAL_MODULE_ID,
      'export function t(source) { return source }',
    );
    analyzer.addFile(
      '/messages.ts',
      `export const marked = defineI18nMessages({
  save: '保存',
  states: ['等待中', '已完成'],
})
export const tree = { cancel: '取消' }`,
    );
    const module = analyzer.addFile(
      '/App.vue',
      `import { unref as _unref } from 'vue'
import { t } from 'virtual:ai-i18n'
import { marked, tree } from './messages'
t(_unref(marked).save)
t(_unref(marked).states[index])
t(_unref(tree))`,
      { lang: 'ts' },
    );
    analyzer.link();

    expect(extractMessages(module)).toMatchObject({
      messages: [
        { source: '保存' },
        { source: '等待中' },
        { source: '已完成' },
        { source: '取消' },
      ],
      warnings: [],
    });
    expect(validateRecommendedUsage(module)).toEqual([]);
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

  it('suggests the collection macro only for statically resolved collection roots', () => {
    const local = analyzeModule(
      `import { t } from 'virtual:ai-i18n'
const messages = { save: '保存' }
t(messages.save)
t(props.label)
const dynamicMessages = { save: props.label }
t(dynamicMessages.save)`,
      'main.ts',
    );
    const localWarnings = validateRecommendedUsage(local);

    expect(localWarnings).toMatchObject([
      { code: 'unmarked-member' },
      { code: 'non-recommended-argument' },
      { code: 'non-recommended-argument' },
    ]);
    expect(localWarnings[0]?.message).toContain('defineI18nMessages');
    expect(localWarnings[0]?.message).toMatch(
      /无需 import|does not need to be imported/,
    );
    expect(localWarnings[1]?.message).not.toContain('defineI18nMessages');
    expect(localWarnings[2]?.message).not.toContain('defineI18nMessages');

    const analyzer = new Analyzer({
      resolve(specifier) {
        if (specifier === AI_I18N_VIRTUAL_MODULE_ID) return specifier;
        return specifier === './messages' ? '/messages.ts' : null;
      },
    });
    analyzer.addFile(
      AI_I18N_VIRTUAL_MODULE_ID,
      'export function t(source) { return source }',
    );
    analyzer.addFile(
      '/messages.ts',
      `export const messages = { save: '保存' }
export const dynamicMessages = { save: props.label }
export const text = '保存'`,
    );
    const imported = analyzer.addFile(
      '/main.ts',
      `import { t } from 'virtual:ai-i18n'
import { messages, dynamicMessages, text } from './messages'
t(messages.save)
t(dynamicMessages.save)
t(text.length)`,
    );
    analyzer.link();

    const importedWarnings = validateRecommendedUsage(imported);
    expect(importedWarnings).toMatchObject([
      { code: 'unmarked-member' },
      { code: 'non-recommended-argument' },
      { code: 'non-recommended-argument' },
    ]);
    expect(importedWarnings[0]?.message).toContain('defineI18nMessages');
    expect(importedWarnings[0]?.message).toMatch(
      /无需 import|does not need to be imported/,
    );
    expect(importedWarnings[1]?.message).not.toContain('defineI18nMessages');
    expect(importedWarnings[2]?.message).not.toContain('defineI18nMessages');
  });

  it('rejects treating the compiler macro as a runtime value', () => {
    const module = analyzeModule('const macro = defineI18nMessages', 'main.ts');

    expect(findInvalidDefineI18nMessagesReferences(module)).toHaveLength(1);
    expect(validateRecommendedUsage(module)).toMatchObject([
      { code: 'invalid-macro' },
    ]);
  });
});
