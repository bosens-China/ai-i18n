export type AstNode = {
  type: string;
  [key: string]: unknown;
};

export function hasTopLevelValueBinding(
  statements: readonly AstNode[],
  name: string,
): boolean {
  return statements.some((statement) => {
    if (statement.type === 'ImportDeclaration') {
      if (statement.importKind === 'type') return false;
      return nodes(statement.specifiers).some((specifier) => {
        if (specifier.importKind === 'type') return false;
        const local = node(specifier.local);
        return local?.type === 'Identifier' && local.name === name;
      });
    }
    return statementBindings(statement).has(name);
  });
}

export function statementBindings(statement: AstNode): Set<string> {
  const result = new Set<string>();
  if (
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration'
  ) {
    const declaration = node(statement.declaration);
    return declaration ? statementBindings(declaration) : result;
  }
  if (statement.type === 'VariableDeclaration') {
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
  return result;
}

export function collectPatternNames(
  pattern: AstNode | null,
  result: Set<string>,
): void {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    result.add(String(pattern.name));
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of nodes(pattern.properties)) {
      collectPatternNames(
        node(
          property.type === 'RestElement' ? property.argument : property.value,
        ),
        result,
      );
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of nodes(pattern.elements)) {
      collectPatternNames(element, result);
    }
  } else if (
    pattern.type === 'AssignmentPattern' ||
    pattern.type === 'RestElement'
  ) {
    collectPatternNames(node(pattern.left ?? pattern.argument), result);
  }
}

export function unwrapNode(value: AstNode | null): AstNode | null {
  while (
    value &&
    (value.type === 'TSAsExpression' ||
      value.type === 'TSSatisfiesExpression' ||
      value.type === 'TSNonNullExpression' ||
      value.type === 'TypeCastExpression' ||
      value.type === 'ParenthesizedExpression')
  ) {
    value = node(value.expression);
  }
  return value;
}

export function propertyName(value: unknown): string | null {
  const property = node(value);
  if (property?.type === 'Identifier') return String(property.name);
  if (
    (property?.type === 'StringLiteral' || property?.type === 'Literal') &&
    typeof property.value === 'string'
  ) {
    return property.value;
  }
  return null;
}

export function nodes(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

export function node(value: unknown): AstNode | null {
  return isNode(value) ? value : null;
}

export function isNode(value: unknown): value is AstNode {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string',
  );
}
