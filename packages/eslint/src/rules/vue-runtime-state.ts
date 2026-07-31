import type { Rule } from 'eslint';
import { nearestFunction, type ParentNode } from './ast-context.js';
import {
  isDirectOptionsFunction,
  isVueComponentSetup,
  isVueScriptSetupNode,
  vueOptionsSection,
} from './vue-options.js';

export type VueInitializationKind = 'data' | 'setup';
type RuntimeStateApi = 'getLang' | 'getLangLoadState';

export function misplacedI18nComputed(
  node: Rule.Node,
  context: Rule.RuleContext,
  inTemplate: boolean,
  isVueSfc: boolean,
): boolean {
  if (inTemplate || isVueScriptSetupNode(node, context)) return true;
  if (vueOptionsSection(node, context) !== null) return true;
  const owner = nearestFunction(node);
  return Boolean(owner && isVueComponentSetup(owner, context, isVueSfc));
}

export function vueInitializationSnapshotKind(
  node: Rule.Node,
  owner: ParentNode,
  context: Rule.RuleContext,
  isVueSfc: boolean,
): VueInitializationKind | null {
  const kind = isVueComponentSetup(owner, context, isVueSfc)
    ? 'setup'
    : isDirectOptionsFunction(owner, context, 'data')
      ? 'data'
      : null;
  if (!kind || !storesResultBeforeOwner(node, owner)) return null;
  return kind;
}

export function reportVueInitializationSnapshot(
  context: Rule.RuleContext,
  node: Rule.Node,
  api: RuntimeStateApi,
  kind: VueInitializationKind,
): void {
  context.report({
    node,
    messageId: kind === 'data' ? 'optionsDataSnapshot' : 'vueSetupSnapshot',
    data: {
      api,
      replacement: api === 'getLang' ? 'currentLang' : 'langLoadState',
    },
  });
}

function storesResultBeforeOwner(node: Rule.Node, owner: ParentNode): boolean {
  let current = node as unknown as StoredValueNode;
  let storesResult = false;
  while (current.parent && current.parent !== owner) {
    const parent = current.parent as StoredValueNode;
    if (
      (parent.type === 'VariableDeclarator' && parent.init === current) ||
      ((parent.type === 'AssignmentExpression' ||
        parent.type === 'AssignmentPattern') &&
        parent.right === current) ||
      (parent.type === 'PropertyDefinition' && parent.value === current) ||
      (parent.type === 'ReturnStatement' && parent.argument === current)
    ) {
      storesResult = true;
    }
    current = parent;
  }
  // 箭头函数直接返回对象时没有 ReturnStatement，需要单独判断函数体。
  return (
    storesResult ||
    (owner.type === 'ArrowFunctionExpression' &&
      (owner as StoredValueNode).body === current)
  );
}

interface StoredValueNode extends ParentNode {
  argument?: unknown;
  body?: unknown;
  init?: unknown;
  right?: unknown;
  value?: unknown;
}
