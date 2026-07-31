import type { Rule } from 'eslint';
import { isImportedVueDefineComponent, propertyName } from './vue-options.js';

const RUNTIME_MODULE = 'virtual:ai-i18n';
const TRANSPARENT_EXPRESSIONS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TypeCastExpression',
]);
const STATIC_INSTANCE_SOURCES = new Set(['computed', 'inject', 'props']);
const RETURNED_INSTANCE_SOURCES = new Set(['data', 'setup']);
const UNCERTAIN_INSTANCE_SOURCES = new Set(['extends', 'mixins']);

export type VueInstanceMemberOrigin =
  'ai-i18n' | 'local' | 'missing' | 'unknown' | 'not-component';

export function resolveVueInstanceMemberOrigin(
  context: Rule.RuleContext,
  node: Rule.Node,
  name: 't' | '$t',
  inTemplate: boolean,
): VueInstanceMemberOrigin {
  const options = inTemplate
    ? defaultComponentOptions(context)
    : enclosingComponentOptions(node, context);
  if (options === 'unknown') return 'unknown';
  if (!options) return inTemplate ? 'missing' : 'not-component';
  if (!inTemplate && !usesComponentThis(node, options)) {
    return 'not-component';
  }
  return resolveOptionsMember(options, name, context);
}

function resolveOptionsMember(
  options: AstNode,
  name: 't' | '$t',
  context: Rule.RuleContext,
): VueInstanceMemberOrigin {
  let methods: AstNode | 'unknown' | null = null;
  let localSource = false;
  let uncertainSource = false;

  for (const entry of options.properties ?? []) {
    if (entry.type === 'SpreadElement') {
      methods = 'unknown';
      uncertainSource = true;
      continue;
    }
    if (entry.type !== 'Property') continue;
    const key = staticPropertyName(entry);
    if (key === null) {
      methods = 'unknown';
      uncertainSource = true;
      continue;
    }
    if (key === 'methods') {
      const value = unwrapExpression(entry.value);
      methods = value?.type === 'ObjectExpression' ? value : 'unknown';
      continue;
    }
    if (STATIC_INSTANCE_SOURCES.has(key)) {
      const origin = resolveStaticSourceMember(entry.value, name, context);
      if (origin === 'local') localSource = true;
      if (origin === 'unknown') uncertainSource = true;
      continue;
    }
    if (RETURNED_INSTANCE_SOURCES.has(key)) {
      const origin = resolveReturnedSourceMember(entry.value, name, context);
      if (origin === 'local') localSource = true;
      if (origin === 'unknown') uncertainSource = true;
      continue;
    }
    if (UNCERTAIN_INSTANCE_SOURCES.has(key)) uncertainSource = true;
  }

  if (methods === 'unknown') return 'unknown';
  const methodOrigin = methods
    ? resolveObjectMember(methods, name, context)
    : 'missing';
  if (methodOrigin === 'local' || localSource) return 'local';
  if (methodOrigin === 'unknown' || uncertainSource) return 'unknown';
  return methodOrigin;
}

function resolveStaticSourceMember(
  rawValue: AstNode | undefined,
  name: 't' | '$t',
  context: Rule.RuleContext,
): 'local' | 'missing' | 'unknown' {
  const value = unwrapExpression(rawValue);
  if (!value) return 'unknown';
  if (value.type === 'ObjectExpression') {
    const origin = resolveObjectMember(value, name, context);
    return origin === 'missing'
      ? 'missing'
      : origin === 'unknown'
        ? 'unknown'
        : 'local';
  }
  if (value.type !== 'ArrayExpression') return 'unknown';
  for (const element of value.elements ?? []) {
    if (propertyName(element) === name) return 'local';
    if (element.type !== 'Literal') return 'unknown';
  }
  return 'missing';
}

function resolveReturnedSourceMember(
  rawValue: AstNode | undefined,
  name: 't' | '$t',
  context: Rule.RuleContext,
): 'local' | 'missing' | 'unknown' {
  const fn = unwrapExpression(rawValue);
  if (
    !fn ||
    (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression')
  ) {
    return 'unknown';
  }
  const rawBody = fn.body as unknown as AstNode | undefined;
  if (!rawBody) return 'unknown';
  if (rawBody.type === 'ObjectExpression') {
    return localObjectMemberOrigin(rawBody, name, context);
  }
  if (rawBody.type !== 'BlockStatement') return 'unknown';

  const statements = rawBody.body ?? [];
  const returned = statements.at(-1);
  if (
    returned?.type !== 'ReturnStatement' ||
    statements
      .slice(0, -1)
      .some((statement) => !isStraightLineStatement(statement))
  ) {
    return 'unknown';
  }
  const value = unwrapExpression(returned.argument);
  return value?.type === 'ObjectExpression'
    ? localObjectMemberOrigin(value, name, context)
    : 'unknown';
}

function localObjectMemberOrigin(
  object: AstNode,
  name: 't' | '$t',
  context: Rule.RuleContext,
): 'local' | 'missing' | 'unknown' {
  const origin = resolveObjectMember(object, name, context);
  return origin === 'missing'
    ? 'missing'
    : origin === 'unknown'
      ? 'unknown'
      : 'local';
}

function isStraightLineStatement(node: AstNode): boolean {
  return (
    node.type === 'ExpressionStatement' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'VariableDeclaration'
  );
}

function resolveObjectMember(
  object: AstNode,
  name: 't' | '$t',
  context: Rule.RuleContext,
): Exclude<VueInstanceMemberOrigin, 'not-component'> {
  let origin: Exclude<VueInstanceMemberOrigin, 'not-component'> = 'missing';
  for (const entry of object.properties ?? []) {
    if (entry.type === 'SpreadElement') {
      origin = 'unknown';
      continue;
    }
    if (entry.type !== 'Property') continue;
    const key = staticPropertyName(entry);
    if (key === null) {
      origin = 'unknown';
      continue;
    }
    if (key !== name) continue;
    origin = methodValueOrigin(entry.value, context);
  }
  return origin;
}

function methodValueOrigin(
  rawValue: AstNode | undefined,
  context: Rule.RuleContext,
): 'ai-i18n' | 'local' | 'unknown' {
  const value = unwrapExpression(rawValue);
  if (!value) return 'unknown';
  if (value.type !== 'Identifier' || !value.name) return 'local';
  const variable = findVariable(context, value);
  if (!variable) return 'unknown';
  return variable.defs.some(isRuntimeTImport) ? 'ai-i18n' : 'local';
}

function findVariable(
  context: Rule.RuleContext,
  identifier: AstNode,
): ScopeVariable | null {
  let scope: ScopeLike | null = context.sourceCode.getScope(
    identifier as unknown as Rule.Node,
  ) as unknown as ScopeLike;
  while (scope) {
    const variable = scope.set.get(identifier.name!);
    if (variable) return variable;
    scope = scope.upper;
  }
  return null;
}

function isRuntimeTImport(definition: ScopeDefinition): boolean {
  if (definition.type !== 'ImportBinding') return false;
  const specifier = definition.node;
  const declaration = specifier.parent;
  return (
    specifier.type === 'ImportSpecifier' &&
    declaration?.type === 'ImportDeclaration' &&
    declaration.source?.value === RUNTIME_MODULE &&
    propertyName(specifier.imported) === 't'
  );
}

function enclosingComponentOptions(
  node: Rule.Node,
  context: Rule.RuleContext,
): AstNode | null {
  let current = node as unknown as AstNode;
  while (current.parent) {
    current = current.parent;
    if (
      current.type === 'ObjectExpression' &&
      isComponentOptions(current, context)
    ) {
      return current;
    }
  }
  return null;
}

function defaultComponentOptions(
  context: Rule.RuleContext,
): AstNode | 'unknown' | null {
  const program = context.sourceCode.ast as unknown as AstNode;
  const owner = program.body?.find(
    (entry) => entry.type === 'ExportDefaultDeclaration',
  );
  if (!owner) return null;
  const declaration = unwrapExpression(owner.declaration);
  if (!declaration) return 'unknown';
  if (declaration.type === 'ObjectExpression') return declaration;
  if (
    declaration.type !== 'CallExpression' ||
    !isImportedVueDefineComponent(declaration.callee, context)
  ) {
    return 'unknown';
  }
  const options = unwrapExpression(declaration.arguments?.[0]);
  return options?.type === 'ObjectExpression' ? options : 'unknown';
}

function isComponentOptions(
  options: AstNode,
  context: Rule.RuleContext,
): boolean {
  const value = unwrapParent(options);
  const owner = value.parent;
  if (
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

function usesComponentThis(node: Rule.Node, options: AstNode): boolean {
  let current = node as unknown as AstNode;
  while (current.parent && current.parent !== options) {
    current = current.parent;
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return isDirectOptionsFunction(current, options);
    }
  }
  return false;
}

function isDirectOptionsFunction(fn: AstNode, options: AstNode): boolean {
  const property = fn.parent;
  if (
    property?.type !== 'Property' ||
    unwrapExpression(property.value) !== fn
  ) {
    return false;
  }
  if (property.parent === options) return true;
  const section = property.parent;
  const sectionProperty = section?.parent;
  return (
    section?.type === 'ObjectExpression' &&
    sectionProperty?.type === 'Property' &&
    unwrapExpression(sectionProperty.value) === section &&
    sectionProperty.parent === options
  );
}

function staticPropertyName(property: AstNode): string | null {
  return propertyName(property.key) ?? null;
}

function unwrapExpression(node: AstNode | undefined): AstNode | undefined {
  let value = node;
  while (value && TRANSPARENT_EXPRESSIONS.has(value.type)) {
    value = value.expression;
  }
  return value;
}

function unwrapParent(node: AstNode): AstNode {
  let value = node;
  while (
    value.parent &&
    TRANSPARENT_EXPRESSIONS.has(value.parent.type) &&
    value.parent.expression === value
  ) {
    value = value.parent;
  }
  return value;
}

interface AstNode {
  type: string;
  arguments?: AstNode[];
  argument?: AstNode;
  body?: AstNode[];
  callee?: AstNode;
  computed?: boolean;
  declaration?: AstNode;
  expression?: AstNode;
  elements?: AstNode[];
  imported?: AstNode;
  key?: AstNode;
  name?: string;
  parent: AstNode | null;
  properties?: AstNode[];
  source?: { value?: unknown };
  value?: AstNode;
}

interface ScopeDefinition {
  type: string;
  node: AstNode;
}

interface ScopeVariable {
  defs: ScopeDefinition[];
}

interface ScopeLike {
  set: Map<string, ScopeVariable>;
  upper: ScopeLike | null;
}
