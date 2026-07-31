import type { Rule } from 'eslint';

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

export interface ParentNode {
  type: string;
  parent: ParentNode | null;
  expression?: unknown;
}

export function isFunctionNode(node: { type: string }): boolean {
  return FUNCTION_TYPES.has(node.type);
}

export function nearestFunction(node: Rule.Node): ParentNode | null {
  let current = node as unknown as ParentNode;
  while (current.parent) {
    current = current.parent;
    if (isFunctionNode(current)) return current;
  }
  return null;
}

export function isImmediateConsoleEffect(node: Rule.Node): boolean {
  const call = (node as unknown as ParentNode).parent as CallNode | null;
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
      ? (property.name ?? null)
      : call.callee.computed &&
          property.type === 'Literal' &&
          typeof property.value === 'string'
        ? property.value
        : null;
  return method !== null && IMMEDIATE_CONSOLE_METHODS.has(method);
}

export function isVueTemplateEventHandler(node: Rule.Node): boolean {
  let current = node as unknown as ParentNode;
  while (current.parent) {
    current = current.parent;
    if (current.type === 'VOnExpression') return true;
  }
  return false;
}

interface CallNode extends ParentNode {
  arguments: readonly unknown[];
  callee: {
    type: string;
    computed: boolean;
    object: { type: string; name?: string };
    property: { type: string; name?: string; value?: unknown };
  };
}
