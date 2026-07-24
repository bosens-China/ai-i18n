import {
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';

type Node = NodeOfType<NodeType>;

export type StaticWarningCode =
  'parse-error' | 'dynamic-argument' | 'unresolved-argument';

export function evaluateStrings(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
  dependencies = new Set<string>(),
): string[] | null | undefined {
  if (!node) return null;

  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [node.value] : null;
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? [
            node.quasis
              .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
              .join(''),
          ]
        : null;
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
      return evaluateStrings(node.expression, module, seen, dependencies);
    case 'ConditionalExpression': {
      const consequent = evaluateStrings(
        node.consequent,
        module,
        new Set(seen),
        dependencies,
      );
      const alternate = evaluateStrings(
        node.alternate,
        module,
        new Set(seen),
        dependencies,
      );
      if (consequent === undefined || alternate === undefined) return undefined;
      return consequent === null || alternate === null
        ? null
        : [...new Set([...consequent, ...alternate])];
    }
    case 'Identifier': {
      const symbol = module.symbolOf(node);
      if (!symbol) return null;
      const definition = symbol.definition();
      if (!definition && symbol.has(SymbolFlags.Import)) return undefined;
      const target = definition?.symbol ?? symbol;
      if (!target.has(SymbolFlags.Const)) return null;
      if (target.module.path !== module.path) {
        dependencies.add(target.module.path);
      }
      const key = `${target.module.path}:${target.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const declaration = target.declarations[0];
      const parent = declaration ? target.module.parentOf(declaration) : null;
      return parent?.type === 'VariableDeclarator'
        ? evaluateStrings(
            parent.init ?? undefined,
            target.module,
            seen,
            dependencies,
          )
        : null;
    }
    default:
      return null;
  }
}

export function argumentWarning(
  module: Module,
  offset: number,
  code: StaticWarningCode,
) {
  return {
    code,
    file: module.path,
    ...sourceLocation(module.source, offset),
    message: 't() arguments must be statically evaluable strings',
  };
}

export function sourceLocation(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
