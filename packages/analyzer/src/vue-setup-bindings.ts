import { hasUnsafeSetupReturn } from './vue-setup-safety.js';
import {
  collectPatternNames,
  isNode,
  node,
  nodes,
  propertyName,
  unwrapNode,
  type AstNode,
} from './vue-ast-utils.js';

export interface OrdinarySetupTranslation {
  hook: string;
  kind: 'object' | 't';
}

interface ScriptContext {
  componentFactories: Set<string>;
  hooks: Set<string>;
  moduleBindings: Set<string>;
  namespaces: Set<string>;
}

export function findOrdinarySetupTranslations(
  scriptAst: readonly unknown[],
): Map<string, OrdinarySetupTranslation> {
  const statements = scriptAst.filter(isNode);
  const context = createScriptContext(statements);
  const options = findComponentOptions(statements, context);
  const setup = options && findSetupFunction(options);
  if (!setup) return new Map();

  const bindings = collectReturnedTranslations(setup, context);
  for (const name of collectOptionMethodNames(options)) bindings.delete(name);
  return bindings;
}

function collectReturnedTranslations(
  setup: AstNode,
  context: ScriptContext,
): Map<string, OrdinarySetupTranslation> {
  const body = node(setup.body);
  if (body?.type !== 'BlockStatement') return new Map();
  const statements = nodes(body.body);
  // 多分支返回无法证明模板拿到的一定是同一个 t，因此只接受唯一的直接 return。
  const returns = collectSetupReturns(statements);
  if (returns.length !== 1 || !statements.includes(returns[0]!))
    return new Map();
  const returnedObject = unwrapNode(node(returns[0]!.argument));
  if (returnedObject?.type !== 'ObjectExpression') return new Map();

  const setupBindings = new Set<string>();
  for (const parameter of nodes(setup.params)) {
    collectPatternNames(parameter, setupBindings);
  }
  for (const statement of statements) {
    collectStatementBindings(statement, setupBindings);
  }

  const origins = new Map<string, OrdinarySetupTranslation>();
  for (const statement of statements) {
    if (
      statement.type !== 'VariableDeclaration' ||
      statement.kind !== 'const'
    ) {
      continue;
    }
    for (const declaration of nodes(statement.declarations)) {
      collectTranslationDeclaration(
        declaration,
        origins,
        context,
        setupBindings,
      );
    }
  }

  const properties = nodes(returnedObject.properties);
  // 对象写入或返回键不明确时，整个 setup 保守退出以避免误提取。
  if (hasUnsafeSetupReturn(statements, origins, properties)) return new Map();

  const returned = new Map<string, OrdinarySetupTranslation>();
  for (const property of properties) {
    if (property.type !== 'ObjectProperty') continue;
    const exposed = propertyName(property.key);
    const origin = translationOrigin(node(property.value), origins);
    if (exposed && origin) returned.set(exposed, origin);
  }
  return returned;
}

function collectTranslationDeclaration(
  declaration: AstNode,
  origins: Map<string, OrdinarySetupTranslation>,
  context: ScriptContext,
  setupBindings: ReadonlySet<string>,
): void {
  if (declaration.type !== 'VariableDeclarator') return;
  const target = node(declaration.id);
  const value = unwrapNode(node(declaration.init));
  if (!target || !value) return;

  const hook = directHookCall(value, context, setupBindings);
  if (hook) {
    if (target.type === 'Identifier') {
      origins.set(String(target.name), { hook, kind: 'object' });
      return;
    }
    if (target.type === 'ObjectPattern') {
      for (const property of nodes(target.properties)) {
        if (
          property.type === 'ObjectProperty' &&
          !property.computed &&
          propertyName(property.key) === 't'
        ) {
          const local = node(property.value);
          if (local?.type === 'Identifier') {
            origins.set(String(local.name), { hook, kind: 't' });
          }
        }
      }
    }
    return;
  }

  if (target.type !== 'Identifier') return;
  const origin = translationOrigin(value, origins);
  if (origin) origins.set(String(target.name), origin);
}

function translationOrigin(
  value: AstNode | null,
  origins: ReadonlyMap<string, OrdinarySetupTranslation>,
): OrdinarySetupTranslation | null {
  const unwrapped = unwrapNode(value);
  if (!unwrapped) return null;
  if (unwrapped.type === 'Identifier') {
    return origins.get(String(unwrapped.name)) ?? null;
  }
  if (
    unwrapped.type === 'MemberExpression' &&
    propertyName(unwrapped.property) === 't'
  ) {
    const object = unwrapNode(node(unwrapped.object));
    if (object?.type !== 'Identifier') return null;
    const origin = origins.get(String(object.name));
    return origin?.kind === 'object' ? { hook: origin.hook, kind: 't' } : null;
  }
  return null;
}

function directHookCall(
  value: AstNode,
  context: ScriptContext,
  setupBindings: ReadonlySet<string>,
): string | null {
  if (value.type !== 'CallExpression' || nodes(value.arguments).length) {
    return null;
  }
  const callee = node(value.callee);
  if (callee?.type !== 'Identifier') return null;
  const name = String(callee.name);
  if (setupBindings.has(name)) return null;
  if (context.hooks.has(name)) return name;
  return name === 'useI18n' && !context.moduleBindings.has(name) ? name : null;
}

function createScriptContext(statements: readonly AstNode[]): ScriptContext {
  const context: ScriptContext = {
    componentFactories: new Set(),
    hooks: new Set(),
    moduleBindings: new Set(),
    namespaces: new Set(),
  };
  for (const statement of statements) {
    collectStatementBindings(statement, context.moduleBindings);
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type'
    ) {
      continue;
    }
    const source = node(statement.source)?.value;
    for (const specifier of nodes(statement.specifiers)) {
      if (specifier.importKind === 'type') continue;
      const local = node(specifier.local);
      if (local?.type !== 'Identifier') continue;
      const localName = String(local.name);
      if (source === 'vue') {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          context.namespaces.add(localName);
        } else if (
          specifier.type === 'ImportSpecifier' &&
          propertyName(specifier.imported) === 'defineComponent'
        ) {
          context.componentFactories.add(localName);
        }
      } else if (
        source === 'virtual:ai-i18n' &&
        specifier.type === 'ImportSpecifier' &&
        propertyName(specifier.imported) === 'useI18n'
      ) {
        context.hooks.add(localName);
      }
    }
  }
  return context;
}

function findComponentOptions(
  statements: readonly AstNode[],
  context: ScriptContext,
): AstNode | null {
  const exported = statements.find(
    (statement) => statement.type === 'ExportDefaultDeclaration',
  );
  return exported
    ? resolveComponentOptions(node(exported.declaration), context)
    : null;
}

function resolveComponentOptions(
  value: AstNode | null,
  context: ScriptContext,
): AstNode | null {
  const unwrapped = unwrapNode(value);
  if (!unwrapped) return null;
  if (unwrapped.type === 'ObjectExpression') return unwrapped;
  if (
    unwrapped.type !== 'CallExpression' ||
    !isVueComponentFactory(node(unwrapped.callee), context)
  ) {
    return null;
  }
  const argument = unwrapNode(nodes(unwrapped.arguments)[0] ?? null);
  return argument?.type === 'ObjectExpression' ? argument : null;
}

function collectSetupReturns(statements: readonly AstNode[]): AstNode[] {
  const result: AstNode[] = [];
  const visit = (value: AstNode): void => {
    if (value.type === 'ReturnStatement') {
      result.push(value);
      return;
    }
    if (
      value.type === 'FunctionDeclaration' ||
      value.type === 'FunctionExpression' ||
      value.type === 'ArrowFunctionExpression' ||
      value.type === 'ObjectMethod' ||
      value.type === 'ClassMethod'
    ) {
      return;
    }
    for (const child of Object.values(value)) {
      if (isNode(child)) visit(child);
      else if (Array.isArray(child)) {
        for (const item of child) if (isNode(item)) visit(item);
      }
    }
  };
  for (const statement of statements) visit(statement);
  return result;
}

function isVueComponentFactory(
  callee: AstNode | null,
  context: ScriptContext,
): boolean {
  if (callee?.type === 'Identifier') {
    return context.componentFactories.has(String(callee.name));
  }
  if (callee?.type !== 'MemberExpression') return false;
  const object = node(callee.object);
  return (
    object?.type === 'Identifier' &&
    context.namespaces.has(String(object.name)) &&
    propertyName(callee.property) === 'defineComponent'
  );
}

function findSetupFunction(options: AstNode): AstNode | null {
  for (const property of nodes(options.properties)) {
    if (property.computed || propertyName(property.key) !== 'setup') continue;
    if (property.type === 'ObjectMethod') return property;
    if (property.type !== 'ObjectProperty') continue;
    const value = unwrapNode(node(property.value));
    if (
      value?.type === 'FunctionExpression' ||
      value?.type === 'ArrowFunctionExpression'
    ) {
      return value;
    }
  }
  return null;
}

function collectOptionMethodNames(options: AstNode): Set<string> {
  const result = new Set<string>();
  for (const property of nodes(options.properties)) {
    if (property.computed || propertyName(property.key) !== 'methods') continue;
    const methods = unwrapNode(node(property.value));
    if (methods?.type !== 'ObjectExpression') continue;
    for (const method of nodes(methods.properties)) {
      if (method.computed) continue;
      const name = propertyName(method.key);
      if (name) result.add(name);
    }
  }
  return result;
}

function collectStatementBindings(
  statement: AstNode,
  result: Set<string>,
): void {
  if (statement.type === 'ImportDeclaration') {
    for (const specifier of nodes(statement.specifiers)) {
      collectPatternNames(node(specifier.local), result);
    }
  } else if (statement.type === 'VariableDeclaration') {
    for (const declaration of nodes(statement.declarations)) {
      collectPatternNames(node(declaration.id), result);
    }
  } else if (
    statement.type === 'FunctionDeclaration' ||
    statement.type === 'ClassDeclaration' ||
    statement.type === 'TSEnumDeclaration' ||
    statement.type === 'TSImportEqualsDeclaration' ||
    statement.type === 'TSModuleDeclaration'
  ) {
    collectPatternNames(node(statement.id), result);
  }
}
