import {
  hasTopLevelValueBinding,
  isNode,
  node,
  nodes,
  propertyName,
  unwrapNode,
  type AstNode,
} from './vue-ast-utils.js';

interface ComponentContext {
  factories: Set<string>;
  namespaces: Set<string>;
}

export type ComponentBinding =
  | { kind: 'ambiguous' }
  | { kind: 'ordinary' }
  | { kind: 'runtime'; local: string };

export function resolveComponentBinding(
  scriptAst: readonly unknown[],
  name: string,
): ComponentBinding | null {
  const statements = scriptAst.filter(isNode);
  const options = findComponentOptions(statements);
  if (options === undefined) return { kind: 'ambiguous' };
  if (!options) return null;
  const optionProperties = nodes(options.properties);
  // 根 options spread 可能覆盖整个 methods，无法证明模板中的 t 仍指向 Runtime。
  if (optionProperties.some((property) => property.type === 'SpreadElement')) {
    return { kind: 'ordinary' };
  }
  let runtimeMethod: ComponentBinding | null = null;

  for (const property of optionProperties) {
    if (property.computed) return { kind: 'ordinary' };
    const option = propertyName(property.key);
    if (option === 'extends' || option === 'mixins') {
      return { kind: 'ordinary' };
    }
    const value = unwrapNode(node(property.value));
    if (option === 'methods') {
      const method = resolveRuntimeMethod(value, name, statements);
      if (method?.kind === 'ordinary') return method;
      if (method) {
        if (runtimeMethod) return { kind: 'ordinary' };
        runtimeMethod = method;
      }
      continue;
    }
    if (option === 'computed') {
      if (
        collectionKeyResult(value, name, false, (property) =>
          isRuntimeComputedSpread(property, name, statements),
        ) !== 'absent'
      ) {
        return { kind: 'ordinary' };
      }
    }
    if (option === 'props' || option === 'inject') {
      if (collectionKeyResult(value, name, true) !== 'absent') {
        return { kind: 'ordinary' };
      }
    }
    if (option === 'data' || option === 'setup') {
      if (functionReturnKeyResult(property, value, name) !== 'absent') {
        return { kind: 'ordinary' };
      }
    }
  }
  return runtimeMethod;
}

function resolveRuntimeMethod(
  value: AstNode | null,
  name: string,
  statements: readonly AstNode[],
): ComponentBinding | null {
  if (value?.type !== 'ObjectExpression') return { kind: 'ordinary' };
  const properties = nodes(value.properties);
  const matches = properties.filter(
    (property) => !property.computed && propertyName(property.key) === name,
  );
  if (!matches.length) {
    return properties.some(
      (property) =>
        property.type === 'SpreadElement' || Boolean(property.computed),
    )
      ? { kind: 'ordinary' }
      : null;
  }
  if (
    matches.length !== 1 ||
    properties.some(
      (property) =>
        property.type === 'SpreadElement' || Boolean(property.computed),
    )
  ) {
    return { kind: 'ordinary' };
  }

  const property = matches[0]!;
  if (property.type !== 'ObjectProperty' && property.type !== 'Property') {
    return { kind: 'ordinary' };
  }
  const method = unwrapNode(node(property.value));
  if (method?.type !== 'Identifier') return { kind: 'ordinary' };
  const local = String(method.name);
  if (isRuntimeImport(statements, local, 't')) {
    return { kind: 'runtime', local };
  }
  return local === name && !hasTopLevelValueBinding(statements, local)
    ? { kind: 'runtime', local }
    : { kind: 'ordinary' };
}

function isRuntimeImport(
  statements: readonly AstNode[],
  localName: string,
  importedName: string,
): boolean {
  return statements.some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.importKind !== 'type' &&
      node(statement.source)?.value === 'virtual:ai-i18n' &&
      nodes(statement.specifiers).some((specifier) => {
        const local = node(specifier.local);
        return (
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind !== 'type' &&
          local?.type === 'Identifier' &&
          local.name === localName &&
          propertyName(specifier.imported) === importedName
        );
      }),
  );
}

function isRuntimeComputedSpread(
  property: AstNode,
  name: string,
  statements: readonly AstNode[],
): boolean {
  // i18nComputed 的公开契约不包含 t；仅信任可静态确认的 Runtime 调用。
  if (name !== 't' || property.type !== 'SpreadElement') return false;
  const expression = unwrapNode(node(property.argument));
  if (
    expression?.type !== 'CallExpression' ||
    nodes(expression.arguments).length > 0
  ) {
    return false;
  }
  const callee = unwrapNode(node(expression.callee));
  if (callee?.type !== 'Identifier') return false;
  const local = String(callee.name);
  return (
    isRuntimeImport(statements, local, 'i18nComputed') ||
    (local === 'i18nComputed' &&
      !hasTopLevelValueBinding(statements, 'i18nComputed'))
  );
}

function findComponentOptions(
  statements: readonly AstNode[],
): AstNode | null | undefined {
  const context = createComponentContext(statements);
  const exported = statements.find(
    (statement) => statement.type === 'ExportDefaultDeclaration',
  );
  if (!exported) {
    return statements.some(hasNamedDefaultExport) ? undefined : null;
  }
  const value = unwrapNode(node(exported.declaration));
  if (value?.type === 'ObjectExpression') return value;
  if (
    value?.type !== 'CallExpression' ||
    !isComponentFactory(node(value.callee), context)
  ) {
    return undefined;
  }
  const argument = unwrapNode(nodes(value.arguments)[0] ?? null);
  return argument?.type === 'ObjectExpression' ? argument : undefined;
}

function createComponentContext(
  statements: readonly AstNode[],
): ComponentContext {
  const context: ComponentContext = {
    factories: new Set(),
    namespaces: new Set(),
  };
  for (const statement of statements) {
    if (
      statement.type !== 'ImportDeclaration' ||
      node(statement.source)?.value !== 'vue'
    ) {
      continue;
    }
    for (const specifier of nodes(statement.specifiers)) {
      const local = node(specifier.local);
      if (local?.type !== 'Identifier') continue;
      if (specifier.type === 'ImportNamespaceSpecifier') {
        context.namespaces.add(String(local.name));
      } else if (
        specifier.type === 'ImportSpecifier' &&
        propertyName(specifier.imported) === 'defineComponent'
      ) {
        context.factories.add(String(local.name));
      }
    }
  }
  if (!hasTopLevelValueBinding(statements, 'defineComponent')) {
    // unplugin-auto-import 等工具只在转换阶段补 import，源码 AST 中会保留裸调用。
    context.factories.add('defineComponent');
  }
  return context;
}

function isComponentFactory(
  callee: AstNode | null,
  context: ComponentContext,
): boolean {
  if (callee?.type === 'Identifier') {
    return context.factories.has(String(callee.name));
  }
  if (callee?.type !== 'MemberExpression') return false;
  const object = node(callee.object);
  return (
    object?.type === 'Identifier' &&
    context.namespaces.has(String(object.name)) &&
    propertyName(callee.property) === 'defineComponent'
  );
}

type KeyResult = 'absent' | 'ambiguous' | 'present';

function functionReturnKeyResult(
  property: AstNode,
  value: AstNode | null,
  name: string,
): KeyResult {
  const fn = property.type === 'ObjectMethod' ? property : value;
  if (
    fn?.type !== 'ObjectMethod' &&
    fn?.type !== 'FunctionExpression' &&
    fn?.type !== 'ArrowFunctionExpression'
  ) {
    return 'ambiguous';
  }
  const body = unwrapNode(node(fn.body));
  if (body?.type === 'ObjectExpression') {
    return collectionKeyResult(body, name, false);
  }
  if (body?.type !== 'BlockStatement') return 'ambiguous';
  const returns = collectReturns(nodes(body.body));
  if (!returns.length) return 'absent';
  const results = returns.map((statement) =>
    collectionKeyResult(unwrapNode(node(statement.argument)), name, false),
  );
  return results.includes('present')
    ? 'present'
    : results.includes('ambiguous')
      ? 'ambiguous'
      : 'absent';
}

function collectReturns(statements: readonly AstNode[]): AstNode[] {
  const result: AstNode[] = [];
  const visit = (value: AstNode): void => {
    if (value.type === 'ReturnStatement') {
      result.push(value);
      return;
    }
    if (isFunction(value)) return;
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

function collectionKeyResult(
  value: AstNode | null,
  name: string,
  allowArray: boolean,
  isSafeSpread?: (property: AstNode) => boolean,
): KeyResult {
  if (value?.type === 'ObjectExpression') {
    const properties = nodes(value.properties);
    if (
      properties.some(
        (property) =>
          (property.type === 'SpreadElement' && !isSafeSpread?.(property)) ||
          Boolean(property.computed),
      )
    ) {
      return 'ambiguous';
    }
    return properties.some((property) => propertyName(property.key) === name)
      ? 'present'
      : 'absent';
  }
  if (allowArray && value?.type === 'ArrayExpression') {
    const elements = nodes(value.elements);
    if (
      elements.some(
        (element) =>
          element.type !== 'Literal' || typeof element.value !== 'string',
      )
    ) {
      return 'ambiguous';
    }
    return elements.some((element) => element.value === name)
      ? 'present'
      : 'absent';
  }
  return 'ambiguous';
}

function hasNamedDefaultExport(statement: AstNode): boolean {
  return (
    statement.type === 'ExportNamedDeclaration' &&
    nodes(statement.specifiers).some(
      (specifier) => propertyName(specifier.exported) === 'default',
    )
  );
}

function isFunction(value: AstNode): boolean {
  return (
    value.type === 'FunctionDeclaration' ||
    value.type === 'FunctionExpression' ||
    value.type === 'ArrowFunctionExpression' ||
    value.type === 'ObjectMethod' ||
    value.type === 'ClassMethod'
  );
}
