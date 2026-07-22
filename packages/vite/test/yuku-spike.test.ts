import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Expression, Node } from '@babel/types';
import { describe, expect, it } from 'vitest';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  analyzeModule,
  extractMessages,
} from '../src/index';

describe('Yuku admission spike', () => {
  it.each([
    ["t('保存', '按钮')", [{ source: '保存', comment: '按钮' }]],
    ["const LABEL = '取消'; t(LABEL)", [{ source: '取消' }]],
    [
      "t(ok ? '成功' : '失败', '结果')",
      [
        { source: '成功', comment: '结果' },
        { source: '失败', comment: '结果' },
      ],
    ],
    ['t(`静态模板`)', [{ source: '静态模板' }]],
  ])('matches the Babel baseline for %s', (body, expected) => {
    const baseline = extractWithBabel(body);
    const module = analyzeModule(
      `import { t } from '${AI_I18N_VIRTUAL_MODULE_ID}';\n${body}`,
      'fixture.ts',
    );
    const actual = extractMessages(module).messages.map(
      ({ source, comment }) => ({
        source,
        ...(comment ? { comment } : {}),
      }),
    );

    expect(baseline).toEqual(expected);
    expect(actual).toEqual(baseline);
  });

  it.each([
    ['fixture.js', "import { t } from 'virtual:ai-i18n'; t('js')"],
    [
      'fixture.ts',
      "import { t } from 'virtual:ai-i18n'; const value: string = t('ts')",
    ],
    [
      'fixture.jsx',
      "import { t } from 'virtual:ai-i18n'; const view = <p>{t('jsx')}</p>",
    ],
    [
      'fixture.tsx',
      "import { t } from 'virtual:ai-i18n'; const view: JSX.Element = <p>{t('tsx')}</p>",
    ],
    [
      'fixture.ts',
      "import { t } from 'virtual:ai-i18n'; @sealed class View {}; t('decorator')",
    ],
    [
      'fixture.ts',
      "import { t } from 'virtual:ai-i18n'; import('./lazy'); t('dynamic import')",
    ],
  ])('parses supported syntax in %s', (id, code) => {
    const module = analyzeModule(code, id);
    expect(module.diagnostics).toEqual([]);
    expect(extractMessages(module).messages).toHaveLength(1);
  });

  it('requires t to resolve to the configured virtual module and supports aliases', () => {
    const module = analyzeModule(
      `
        import { t as translate } from 'virtual:ai-i18n';
        import { t } from 'another-i18n';
        translate('提取');
        t('忽略');
      `,
      'bindings.ts',
    );
    expect(extractMessages(module).messages.map((message) => message.source)).toEqual([
      '提取',
    ]);
  });

  it('follows re-exports and cross-file const definitions', () => {
    const analyzer = new Analyzer({
      resolve(specifier) {
        if (specifier === 'virtual:ai-i18n') return AI_I18N_VIRTUAL_MODULE_ID;
        if (specifier === './bridge') return 'bridge.ts';
        if (specifier === './texts') return 'texts.ts';
        return specifier.startsWith('.') ? null : specifier;
      },
    });
    analyzeModule(
      'export function t(source) { return source }',
      AI_I18N_VIRTUAL_MODULE_ID,
      analyzer,
    );
    analyzeModule(
      "export { t } from 'virtual:ai-i18n'",
      'bridge.ts',
      analyzer,
    );
    analyzeModule("export const LABEL = '跨文件'", 'texts.ts', analyzer);
    const module = analyzeModule(
      "import { t as tr } from './bridge'; import { LABEL } from './texts'; tr(LABEL)",
      'main.ts',
      analyzer,
    );
    analyzer.link();

    expect(extractMessages(module).messages).toMatchObject([
      { source: '跨文件', id: '跨文件' },
    ]);
  });

  it('replaces and removes files incrementally', () => {
    const analyzer = new Analyzer();
    analyzeModule('export const value = 1', 'state.ts', analyzer);
    expect(analyzer.module('state.ts')?.source).toContain('1');
    analyzeModule('export const value = 2', 'state.ts', analyzer);
    expect(analyzer.modules.size).toBe(1);
    expect(analyzer.module('state.ts')?.source).toContain('2');
    expect(analyzer.removeFile('state.ts')).toBe(true);
    expect(analyzer.module('state.ts')).toBeUndefined();
  });

  it('warns instead of guessing dynamic arguments', () => {
    const module = analyzeModule(
      "import { t } from 'virtual:ai-i18n';\nt(props.label)",
      'dynamic.ts',
    );
    expect(extractMessages(module)).toMatchObject({
      messages: [],
      warnings: [{ file: 'dynamic.ts', line: 2, column: 0 }],
    });
  });
});

function extractWithBabel(code: string) {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
  });
  const constants = new Map<string, Expression>();
  const messages: Array<{ source: string; comment?: string }> = [];
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        path.parentPath.isVariableDeclaration({ kind: 'const' }) &&
        path.node.id.type === 'Identifier' &&
        path.node.init?.type !== 'JSXElement' &&
        path.node.init?.type !== 'JSXFragment'
      ) {
        constants.set(path.node.id.name, path.node.init as Expression);
      }
    },
    CallExpression(path) {
      if (path.node.callee.type !== 'Identifier' || path.node.callee.name !== 't') {
        return;
      }
      const sources = babelStrings(path.node.arguments[0], constants);
      const comments = path.node.arguments[1]
        ? babelStrings(path.node.arguments[1], constants)
        : [''];
      for (const source of sources) {
        for (const comment of comments) {
          messages.push({ source, ...(comment ? { comment } : {}) });
        }
      }
    },
  });
  return messages;
}

function babelStrings(
  node: Node | null | undefined,
  constants: ReadonlyMap<string, Expression>,
  seen = new Set<string>(),
): string[] {
  if (!node) return [];
  switch (node.type) {
    case 'StringLiteral':
      return [node.value];
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? [node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('')]
        : [];
    case 'Identifier': {
      if (seen.has(node.name)) return [];
      const value = constants.get(node.name);
      return value
        ? babelStrings(value, constants, new Set(seen).add(node.name))
        : [];
    }
    case 'ConditionalExpression':
      return [
        ...babelStrings(node.consequent, constants, new Set(seen)),
        ...babelStrings(node.alternate, constants, new Set(seen)),
      ];
    default:
      return [];
  }
}
