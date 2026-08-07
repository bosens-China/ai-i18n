import type { Rule } from 'eslint';
import {
  isFunctionNode,
  nearestFunction,
  type ParentNode,
} from '../common/ast-context.js';

export function isOptionsComputedValue(
  node: Rule.Node,
  context: Rule.RuleContext,
): boolean {
  let value = node as unknown as ParentNode;
  while (
    value.parent &&
    isTransparentExpression(value.parent) &&
    expressionChild(value.parent) === value
  ) {
    value = value.parent;
  }
  const entry = value.parent as PropertyNode | null;
  if (entry?.type !== 'Property' || entry.value !== value) return false;
  const entries = entry.parent;
  if (entries?.type !== 'ObjectExpression') return false;
  const computed = entries.parent as PropertyNode | null;
  return (
    computed?.type === 'Property' &&
    computed.value === entries &&
    propertyName(computed.key) === 'computed' &&
    computed.parent?.type === 'ObjectExpression' &&
    isVueComponentOptionsObject(computed.parent, context)
  );
}

export function isOptionsComputedSpread(
  node: Rule.Node,
  context: Rule.RuleContext,
): boolean {
  const value = unwrapTransparentParent(node as unknown as ParentNode);
  const spread = value.parent as SpreadNode | null;
  if (spread?.type !== 'SpreadElement' || spread.argument !== value) {
    return false;
  }
  const entries = spread.parent;
  if (entries?.type !== 'ObjectExpression') return false;
  const computed = entries.parent as PropertyNode | null;
  return (
    computed?.type === 'Property' &&
    computed.value === entries &&
    propertyName(computed.key) === 'computed' &&
    computed.parent?.type === 'ObjectExpression' &&
    isVueComponentOptionsObject(computed.parent, context)
  );
}

export function isInsideOptionsComputedGetter(
  node: Rule.Node,
  context: Rule.RuleContext,
): boolean {
  const owner = nearestFunction(node);
  if (!owner) return false;
  let current: ParentNode | null = owner;
  while (current?.parent) {
    const parent = current.parent as PropertyNode;
    if (
      current.type === 'ObjectExpression' &&
      parent.type === 'Property' &&
      parent.value === current &&
      propertyName(parent.key) === 'computed' &&
      parent.parent?.type === 'ObjectExpression' &&
      isVueComponentOptionsObject(parent.parent, context)
    ) {
      return true;
    }
    current = current.parent;
    if (current && current !== owner && isFunctionNode(current)) {
      return false;
    }
  }
  return false;
}

export function vueOptionsSection(
  node: Rule.Node,
  context: Rule.RuleContext,
): string | null {
  let current = node as unknown as ParentNode;
  while (current.parent) {
    const property = current.parent as PropertyNode;
    if (
      property.type === 'Property' &&
      property.value === current &&
      property.parent?.type === 'ObjectExpression' &&
      isVueComponentOptionsObject(property.parent, context)
    ) {
      return propertyName(property.key) ?? null;
    }
    current = current.parent;
  }
  return null;
}

export function isDirectOptionsFunction(
  node: ParentNode,
  context: Rule.RuleContext,
  name: string,
  allowBareExportDefault = true,
): boolean {
  const value = unwrapTransparentParent(node);
  const property = value.parent as PropertyNode | null;
  if (
    property?.type !== 'Property' ||
    property.value !== value ||
    propertyName(property.key) !== name
  ) {
    return false;
  }
  const options = property.parent;
  return (
    options?.type === 'ObjectExpression' &&
    isVueComponentOptionsObject(options, context, allowBareExportDefault)
  );
}

export function isVueComponentSetup(
  node: ParentNode,
  context: Rule.RuleContext,
  isVueSfc: boolean,
): boolean {
  const value = unwrapTransparentParent(node);
  const directOwner = value.parent as OwnerNode | null;
  if (
    directOwner?.type === 'CallExpression' &&
    directOwner.arguments?.[0] === value
  ) {
    return isImportedVueDefineComponent(directOwner.callee, context);
  }

  const property = value.parent as PropertyNode | null;
  if (
    property?.type !== 'Property' ||
    property.value !== value ||
    property.computed ||
    propertyName(property.key) !== 'setup'
  ) {
    return false;
  }

  const options = property.parent;
  if (options?.type !== 'ObjectExpression') return false;
  const owner = options.parent as OwnerNode | null;
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
    isImportedVueDefineComponent(owner.callee, context)
  );
}

export function isVueScriptSetupNode(
  node: Rule.Node,
  context: Rule.RuleContext,
): boolean {
  if (!context.filename.toLowerCase().endsWith('.vue') || !node.range) {
    return false;
  }
  const source = context.sourceCode.text;
  const before = source.slice(0, node.range[0]);
  const opening = before.lastIndexOf('<script');
  if (opening <= before.lastIndexOf('</script>')) return false;
  const closing = source.indexOf('>', opening);
  if (closing < 0 || closing >= node.range[0]) return false;
  return /\bsetup(?:\s|=|>)/u.test(source.slice(opening, closing + 1));
}

export function isImportedVueDefineComponent(
  node: unknown,
  context: Rule.RuleContext,
): boolean {
  const callee = node as {
    computed?: boolean;
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

export function propertyName(node: unknown): string | undefined {
  const key = node as { name?: string; type?: string; value?: unknown };
  if (key?.type === 'Identifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string'
    ? key.value
    : undefined;
}

function isVueComponentOptionsObject(
  options: ParentNode,
  context: Rule.RuleContext,
  allowBareExportDefault = true,
): boolean {
  const value = unwrapTransparentParent(options);
  const owner = value.parent as OwnerNode | null;
  if (
    allowBareExportDefault &&
    owner?.type === 'ExportDefaultDeclaration' &&
    owner.declaration === value
  ) {
    return true;
  }
  return (
    owner?.type === 'CallExpression' &&
    owner.arguments?.[0] === value &&
    isImportedVueDefineComponent(owner.callee, context)
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

function unwrapTransparentParent(node: ParentNode): ParentNode {
  let value = node;
  while (
    value.parent &&
    isTransparentExpression(value.parent) &&
    expressionChild(value.parent) === value
  ) {
    value = value.parent;
  }
  return value;
}

function isTransparentExpression(node: ParentNode): boolean {
  return (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TypeCastExpression'
  );
}

function expressionChild(node: ParentNode): unknown {
  return node.expression;
}

interface PropertyNode extends ParentNode {
  computed?: boolean;
  key?: unknown;
  value?: unknown;
}

interface OwnerNode extends ParentNode {
  arguments?: unknown[];
  callee?: unknown;
  declaration?: unknown;
}

interface SpreadNode extends ParentNode {
  argument?: unknown;
}
