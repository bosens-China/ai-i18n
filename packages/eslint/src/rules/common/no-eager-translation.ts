import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import { reportAnalysisFailureOnce } from '../../rule-analysis.js';
import {
  matchTranslationCalls,
  type TranslationCandidate,
  type TranslationRuleOptions,
} from './translation-call.js';
import { isFunctionNode } from './ast-context.js';
import {
  isDirectOptionsFunction,
  isVueComponentSetup,
} from '../vue/options.js';

interface RuleOptions extends TranslationRuleOptions {
  framework?: 'vue';
}

export const noEagerTranslation: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '警告不会随语言切换更新的提前求值翻译结果',
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
                items: { enum: ['t', 'tRef', 'tComputed', 'useI18n'] },
                uniqueItems: true,
              },
            ],
          },
          framework: { enum: ['vue'] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      eagerTranslation: diagnosticMessage(
        '初始化期间保存的 t() 结果不会随语言切换更新。请改为函数或 Getter，在使用时调用 t()；Vue setup 中使用 tRef()，纯 Options API 的 computed 使用 tComputed()。',
        'A t() result stored during initialization will not update when the language changes. Evaluate it lazily in a function or getter; use tRef() in Vue setup and tComputed() in pure Options API computed.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const isVueSfc = context.filename.toLowerCase().endsWith('.vue');
    const candidates: TranslationCandidate[] = [];
    return {
      CallExpression(node) {
        candidates.push({ kind: 'call', node });
      },
      TaggedTemplateExpression(node) {
        candidates.push({ kind: 'tagged-template', node });
      },
      'Program:exit'(program) {
        let matches;
        try {
          matches = matchTranslationCalls(context, options, candidates);
        } catch (error) {
          reportAnalysisFailureOnce(context, program as Rule.Node, error);
          return;
        }
        for (const { call, node } of matches) {
          if (call.origin === 'vue-ref' || call.origin === 'vue-computed') {
            continue;
          }
          if (
            !storesOutsideFunction(
              node,
              context,
              isVueSfc,
              options.framework === 'vue',
            )
          ) {
            continue;
          }
          context.report({ node, messageId: 'eagerTranslation' });
        }
      },
    };
  },
};

function storesOutsideFunction(
  node: Rule.Node,
  context: Rule.RuleContext,
  isVueSfc: boolean,
  isVueFramework: boolean,
): boolean {
  let current = node as ParentNode;
  let storesResult = false;
  while (current.parent) {
    const parent = current.parent;
    if (isFunctionNode(parent)) {
      // 普通 setup() 与 <script setup> 一样只执行一次；其他函数仍视为延迟求值。
      const returnsExpression =
        parent.type === 'ArrowFunctionExpression' && parent.body === current;
      return (
        (isVueComponentSetup(parent, context, isVueSfc) ||
          isDirectOptionsFunction(
            parent,
            context,
            'data',
            isVueSfc || isVueFramework,
          )) &&
        (storesResult || returnsExpression)
      );
    }
    if (storesTranslationResult(parent, current)) storesResult = true;
    if (parent.type === 'Program') return storesResult;
    current = parent;
  }
  return storesResult;
}

function storesTranslationResult(
  parent: ParentNode,
  child: ParentNode,
): boolean {
  if (
    (parent as { type: string }).type === 'AccessorProperty' &&
    parent.value === child
  ) {
    return true;
  }
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === child;
    case 'AssignmentExpression':
    case 'AssignmentPattern':
      return parent.right === child;
    case 'PropertyDefinition':
      return parent.value === child;
    case 'ReturnStatement':
      return parent.argument === child;
    case 'ExportDefaultDeclaration':
      return parent.declaration === child;
    default:
      return false;
  }
}

type ParentNode = Rule.Node & {
  arguments?: unknown[];
  argument?: unknown;
  body?: unknown;
  callee?: unknown;
  computed?: boolean;
  parent: ParentNode | null;
  declaration?: unknown;
  init?: unknown;
  key?: unknown;
  right?: unknown;
  value?: unknown;
};
