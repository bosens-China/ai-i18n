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
                items: { enum: ['t', 'useI18n'] },
                uniqueItems: true,
              },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      eagerTranslation: diagnosticMessage(
        '初始化期间保存的 t() 结果不会随语言切换更新。请改为函数或 Getter，在使用时调用 t()；组件视图请使用 useI18n()。',
        'A t() result stored during initialization will not update when the language changes. Evaluate it lazily in a function or getter; use useI18n() in component views.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as TranslationRuleOptions;
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
        for (const { node } of matches) {
          if (!storesOutsideFunction(node, context, isVueSfc)) continue;
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
): boolean {
  let current = node as ParentNode;
  let storesResult = false;
  while (current.parent) {
    const parent = current.parent;
    if (FUNCTION_TYPES.has(parent.type)) {
      // 普通 setup() 与 <script setup> 一样只执行一次；其他函数仍视为延迟求值。
      const returnsExpression =
        parent.type === 'ArrowFunctionExpression' && parent.body === current;
      return (
        isVueComponentSetup(parent, context, isVueSfc) &&
        (storesResult || returnsExpression)
      );
    }
    if (storesTranslationResult(parent, current)) storesResult = true;
    if (parent.type === 'Program') return storesResult;
    current = parent;
  }
  return storesResult;
}

function isVueComponentSetup(
  node: ParentNode,
  context: Rule.RuleContext,
  isVueSfc: boolean,
): boolean {
  const directOwner = node.parent;
  if (
    directOwner?.type === 'CallExpression' &&
    directOwner.arguments?.[0] === node
  ) {
    return isImportedDefineComponent(directOwner.callee, context);
  }

  const property = node.parent;
  if (
    property?.type !== 'Property' ||
    property.value !== node ||
    property.computed ||
    propertyName(property.key) !== 'setup'
  ) {
    return false;
  }

  const options = property.parent;
  if (options?.type !== 'ObjectExpression') return false;
  const owner = options.parent;
  if (
    isVueSfc &&
    owner?.type === 'ExportDefaultDeclaration' &&
    owner.declaration === options
  ) {
    return true;
  }
  return (
    owner?.type === 'CallExpression' &&
    owner.arguments?.[0] === options &&
    isImportedDefineComponent(owner.callee, context)
  );
}

function propertyName(node: unknown): string | undefined {
  const key = node as { name?: string; type?: string; value?: unknown };
  if (key?.type === 'Identifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string'
    ? key.value
    : undefined;
}

function isImportedDefineComponent(
  node: unknown,
  context: Rule.RuleContext,
): boolean {
  const callee = node as {
    computed?: boolean;
    name?: string;
    object?: unknown;
    property?: unknown;
    type?: string;
  };
  if (callee?.type === 'Identifier') {
    return isVueImport(callee, context, 'ImportSpecifier');
  }
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    propertyName(callee.property) === 'defineComponent' &&
    isVueImport(callee.object, context, 'ImportNamespaceSpecifier')
  );
}

function isVueImport(
  node: unknown,
  context: Rule.RuleContext,
  specifierType: 'ImportNamespaceSpecifier' | 'ImportSpecifier',
): boolean {
  const identifier = node as Rule.Node & { name?: string };
  if (identifier?.type !== 'Identifier' || !identifier.name) return false;

  let scope = context.sourceCode.getScope(identifier);
  while (true) {
    const variable = scope.set.get(identifier.name);
    if (!variable) {
      if (!scope.upper) return false;
      scope = scope.upper;
      continue;
    }
    return variable.defs.some((definition) => {
      if (
        definition.type !== 'ImportBinding' ||
        definition.node.type !== specifierType ||
        definition.parent.source.value !== 'vue'
      ) {
        return false;
      }
      return (
        specifierType === 'ImportNamespaceSpecifier' ||
        propertyName((definition.node as { imported?: unknown }).imported) ===
          'defineComponent'
      );
    });
  }
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
