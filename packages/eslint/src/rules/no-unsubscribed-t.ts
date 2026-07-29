import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import { reportAnalysisFailureOnce } from '../rule-analysis.js';
import {
  matchTranslationCalls,
  type TranslationCandidate,
  type TranslationRuleOptions,
} from './translation-call.js';

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]);
const IMMEDIATE_CONSOLE_METHODS = new Set([
  'debug',
  'error',
  'info',
  'log',
  'warn',
]);

export const noUnsubscribedT: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '检查组件渲染路径中的翻译 API 生命周期',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tsconfigPath: { type: 'string' },
          autoImport: {
            anyOf: [
              { type: 'boolean' },
              {
                type: 'array',
                items: { enum: ['t', 'tRef', 'useI18n'] },
                uniqueItems: true,
              },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unsubscribedT: diagnosticMessage(
        '组件渲染期间使用顶层 t 不会订阅语言状态，语言切换不会主动刷新，缓存的渲染结果也可能继续使用旧译文。请使用 useI18n() 返回的 t。',
        'Top-level t does not subscribe the component to language updates, so language changes do not trigger a render and cached render results may remain stale. Use the t returned by useI18n().',
      ),
      renderTRef: diagnosticMessage(
        '不要在组件渲染或 template 中调用 tRef()，否则每次渲染都会创建新的 computed。请在 setup 中创建一次并使用返回的 Ref；渲染函数中请直接使用 useI18n() 返回的 t。',
        'Do not call tRef() during component rendering or in a template because each render creates a new computed. Create it once in setup and use the returned Ref; in render functions, call the t returned by useI18n() directly.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as TranslationRuleOptions;
    const candidates: TranslationCandidate[] = [];
    const jsxOwners = new Set<ParentNode>();
    const templateNodes = new Set<Rule.Node>();
    const collectJsxOwner = (node: Rule.Node) => {
      const owner = nearestFunction(node);
      if (owner) jsxOwners.add(owner);
    };
    const scriptVisitor: Rule.RuleListener = {
      CallExpression(node) {
        candidates.push({ kind: 'call', node });
      },
      TaggedTemplateExpression(node) {
        candidates.push({ kind: 'tagged-template', node });
      },
      JSXElement: collectJsxOwner,
      JSXFragment: collectJsxOwner,
      'Program:exit'(program) {
        let matches;
        try {
          matches = matchTranslationCalls(context, options, candidates);
        } catch (error) {
          reportAnalysisFailureOnce(context, program as Rule.Node, error);
          return;
        }
        for (const { call, node } of matches) {
          if (call.origin === 'vue-ref') {
            if (templateNodes.has(node)) {
              if (!isVueTemplateEventHandler(node)) {
                context.report({ node, messageId: 'renderTRef' });
              }
              continue;
            }
            const owner = nearestFunction(node);
            if (owner && jsxOwners.has(owner)) {
              context.report({ node, messageId: 'renderTRef' });
            }
            continue;
          }
          if (call.origin !== 'runtime') continue;
          if (templateNodes.has(node)) {
            if (!isVueTemplateEventHandler(node)) {
              context.report({ node, messageId: 'unsubscribedT' });
            }
            continue;
          }
          // ponytail: 先检查直接拥有 JSX 的最近函数；出现真实漏报后再引入调用图与框架数据流。
          const owner = nearestFunction(node);
          if (
            !owner ||
            !jsxOwners.has(owner) ||
            isImmediateConsoleEffect(node)
          ) {
            continue;
          }
          context.report({ node, messageId: 'unsubscribedT' });
        }
      },
    };
    const parserServices = context.sourceCode
      .parserServices as VueParserServices;
    if (!parserServices.defineTemplateBodyVisitor) return scriptVisitor;
    return parserServices.defineTemplateBodyVisitor(
      {
        CallExpression(node) {
          candidates.push({ kind: 'call', node });
          templateNodes.add(node);
        },
        TaggedTemplateExpression(node) {
          candidates.push({ kind: 'tagged-template', node });
          templateNodes.add(node);
        },
      },
      scriptVisitor,
      // 模板默认在 Program:exit 才遍历；提前到 Program，确保汇总前已收集候选。
      { templateBodyTriggerSelector: 'Program' },
    );
  },
};

function nearestFunction(node: Rule.Node): ParentNode | null {
  let current = node as ParentNode;
  while (current.parent) {
    current = current.parent;
    if (FUNCTION_TYPES.has(current.type)) return current;
  }
  return null;
}

function isImmediateConsoleEffect(node: Rule.Node): boolean {
  const call = (node as ParentNode).parent;
  if (
    call?.type !== 'CallExpression' ||
    call.parent?.type !== 'ExpressionStatement' ||
    !call.arguments.some((argument) => argument === node) ||
    call.callee.type !== 'MemberExpression' ||
    call.callee.object.type !== 'Identifier' ||
    call.callee.object.name !== 'console'
  ) {
    return false;
  }
  const property = call.callee.property;
  const method =
    !call.callee.computed && property.type === 'Identifier'
      ? property.name
      : call.callee.computed &&
          property.type === 'Literal' &&
          typeof property.value === 'string'
        ? property.value
        : null;
  return method !== null && IMMEDIATE_CONSOLE_METHODS.has(method);
}

function isVueTemplateEventHandler(node: Rule.Node): boolean {
  let current = node as unknown as TemplateParentNode;
  while (current.parent) {
    current = current.parent;
    if (current.type === 'VOnExpression') return true;
  }
  return false;
}

type ParentNode = Rule.Node & {
  parent: ParentNode | null;
};

interface TemplateParentNode {
  type: string;
  parent: TemplateParentNode | null;
}

interface VueParserServices {
  defineTemplateBodyVisitor?(
    templateBodyVisitor: Record<string, (node: Rule.Node) => void>,
    scriptVisitor: Rule.RuleListener,
    options: { templateBodyTriggerSelector: 'Program' | 'Program:exit' },
  ): Rule.RuleListener;
}
