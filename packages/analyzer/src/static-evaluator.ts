import {
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';

type Node = NodeOfType<NodeType>;
type Primitive = string | number | boolean | bigint | null | undefined;
export type StaticResult = StaticValue[] | null | undefined;
export type StaticValue =
  | { kind: 'primitive'; value: Primitive }
  | { kind: 'array'; items: StaticResult[] }
  | { kind: 'object'; properties: Map<string, StaticResult> };

interface EvaluationContext {
  seen: Set<string>;
  dependencies: Set<string>;
  maxCandidates: number;
  onLimitExceeded: () => void;
}

export function evaluateStaticValues(
  node: Node | undefined,
  module: Module,
  seen: Set<string>,
  dependencies: Set<string>,
  maxCandidates: number,
  onLimitExceeded: () => void,
): StaticResult {
  return evaluateValue(node, module, {
    seen,
    dependencies,
    maxCandidates,
    onLimitExceeded,
  });
}

function evaluateValue(
  node: Node | undefined,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  if (!node) return null;

  switch (node.type) {
    case 'Literal':
      return isPrimitive(node.value)
        ? [{ kind: 'primitive', value: node.value }]
        : null;
    case 'TemplateLiteral':
      return evaluateTemplate(node, module, context);
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
    case 'ChainExpression':
      return evaluateValue(node.expression, module, context);
    case 'ConditionalExpression':
    case 'LogicalExpression':
      return mergeResults(
        evaluateValue(
          node.type === 'ConditionalExpression' ? node.consequent : node.left,
          module,
          branch(context),
        ),
        evaluateValue(
          node.type === 'ConditionalExpression' ? node.alternate : node.right,
          module,
          branch(context),
        ),
        context,
      );
    case 'SequenceExpression':
      return evaluateValue(node.expressions.at(-1), module, context);
    case 'BinaryExpression':
      return node.operator === '+'
        ? evaluateAddition(node.left, node.right, module, context)
        : null;
    case 'Identifier':
      return evaluateIdentifier(node, module, context);
    case 'ArrayExpression':
      return evaluateArray(node, module, context);
    case 'ObjectExpression':
      return evaluateObject(node, module, context);
    case 'MemberExpression':
      return evaluateMember(node, module, context);
    case 'CallExpression':
      return (isDefineI18nMessagesCall(node, module) ||
        isVueUnrefCall(node, module)) &&
        node.arguments.length === 1 &&
        node.arguments[0]?.type !== 'SpreadElement'
        ? evaluateValue(node.arguments[0], module, context)
        : null;
    default:
      return null;
  }
}

function evaluateIdentifier(
  node: NodeOfType<'Identifier'>,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  const symbol = module.symbolOf(node);
  if (!symbol) {
    return node.name === 'undefined'
      ? [{ kind: 'primitive', value: undefined }]
      : null;
  }
  const definition = symbol.definition();
  if (!definition && symbol.has(SymbolFlags.Import)) return undefined;
  const target = definition?.symbol ?? symbol;
  if (
    !target.has(SymbolFlags.Const) &&
    target.references.some((item) => item.isWrite)
  ) {
    return null;
  }
  if (target.module.path !== module.path) {
    context.dependencies.add(target.module.path);
  }
  const key = `${target.module.path}:${target.id}`;
  if (context.seen.has(key)) return null;
  const declaration = target.declarations[0];
  const parent = declaration ? target.module.parentOf(declaration) : null;
  if (parent?.type !== 'VariableDeclarator') return null;
  context.seen.add(key);
  return evaluateValue(parent.init ?? undefined, target.module, context);
}

function evaluateTemplate(
  node: NodeOfType<'TemplateLiteral'>,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  let values = [''];
  for (let index = 0; index < node.quasis.length; index += 1) {
    values = values.map(
      (value) =>
        value +
        (node.quasis[index]!.value.cooked ?? node.quasis[index]!.value.raw),
    );
    const expression = node.expressions[index];
    if (!expression) continue;
    const candidates = evaluateValue(expression, module, branch(context));
    if (!candidates) return candidates;
    const primitives = candidates.flatMap((candidate) =>
      candidate.kind === 'primitive' ? [String(candidate.value)] : [],
    );
    if (
      !primitives.length ||
      exceedsLimit(context, values.length * primitives.length)
    ) {
      return null;
    }
    values = values.flatMap((value) =>
      primitives.map((primitive) => value + primitive),
    );
  }
  return values.map((value) => ({ kind: 'primitive', value }));
}

function evaluateAddition(
  leftNode: Node,
  rightNode: Node,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  const left = evaluateValue(leftNode, module, branch(context));
  const right = evaluateValue(rightNode, module, branch(context));
  if (!left || !right) {
    return left === undefined || right === undefined ? undefined : null;
  }
  if (exceedsLimit(context, left.length * right.length)) return null;
  const values: StaticValue[] = [];
  for (const a of left) {
    for (const b of right) {
      if (a.kind !== 'primitive' || b.kind !== 'primitive') continue;
      if (typeof a.value === 'string' || typeof b.value === 'string') {
        values.push({
          kind: 'primitive',
          value: String(a.value) + String(b.value),
        });
      } else if (typeof a.value === 'number' && typeof b.value === 'number') {
        values.push({ kind: 'primitive', value: a.value + b.value });
      }
    }
  }
  return values.length ? values : null;
}

function evaluateArray(
  node: NodeOfType<'ArrayExpression'>,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  let arrays: Extract<StaticValue, { kind: 'array' }>[] = [
    { kind: 'array', items: [] },
  ];
  for (const element of node.elements) {
    if (!element) {
      arrays.forEach((array) => array.items.push([]));
      continue;
    }
    if (element.type !== 'SpreadElement') {
      const value = evaluateValue(element, module, branch(context));
      arrays.forEach((array) => array.items.push(value));
      continue;
    }
    const spread = evaluateValue(element.argument, module, branch(context));
    if (!spread) return spread;
    const candidates = spread.filter(
      (value): value is Extract<StaticValue, { kind: 'array' }> =>
        value.kind === 'array',
    );
    if (
      !candidates.length ||
      exceedsLimit(context, arrays.length * candidates.length)
    ) {
      return null;
    }
    arrays = arrays.flatMap((array) =>
      candidates.map((candidate) => ({
        kind: 'array',
        items: [...array.items, ...candidate.items],
      })),
    );
  }
  return arrays;
}

function evaluateObject(
  node: NodeOfType<'ObjectExpression'>,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  let objects: Extract<StaticValue, { kind: 'object' }>[] = [
    { kind: 'object', properties: new Map() },
  ];
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      const spread = evaluateValue(property.argument, module, branch(context));
      if (!spread) return spread;
      const candidates = spread.filter(
        (value): value is Extract<StaticValue, { kind: 'object' }> =>
          value.kind === 'object',
      );
      if (
        !candidates.length ||
        exceedsLimit(context, objects.length * candidates.length)
      ) {
        return null;
      }
      objects = objects.flatMap((object) =>
        candidates.map((candidate) => ({
          kind: 'object',
          properties: new Map([...object.properties, ...candidate.properties]),
        })),
      );
      continue;
    }
    if (property.kind !== 'init' || property.method) return null;
    const keys = propertyKeys(property, module, context);
    if (!keys) return keys;
    const value = evaluateValue(property.value, module, branch(context));
    for (const object of objects) {
      for (const key of keys) object.properties.set(key, value);
    }
  }
  return objects;
}

function propertyKeys(
  property: NodeOfType<'Property'>,
  module: Module,
  context: EvaluationContext,
): string[] | null | undefined {
  if (!property.computed && property.key.type === 'Identifier') {
    return [property.key.name];
  }
  if (!property.computed && property.key.type === 'Literal') {
    return [String(property.key.value)];
  }
  const values = evaluateValue(property.key, module, branch(context));
  if (!values) return values;
  const keys = values.flatMap((value) =>
    value.kind === 'primitive' &&
    (typeof value.value === 'string' || typeof value.value === 'number')
      ? [String(value.value)]
      : [],
  );
  return keys.length ? [...new Set(keys)] : null;
}

function evaluateMember(
  node: NodeOfType<'MemberExpression'>,
  module: Module,
  context: EvaluationContext,
): StaticResult {
  const object = evaluateValue(node.object, module, branch(context));
  if (!object) return object;
  let keys: string[] | null | undefined;
  if (!node.computed && node.property.type === 'Identifier') {
    keys = [node.property.name];
  } else {
    const values = evaluateValue(node.property, module, branch(context));
    if (values === undefined) return undefined;
    keys = values
      ? values.flatMap((value) =>
          value.kind === 'primitive' &&
          (typeof value.value === 'string' || typeof value.value === 'number')
            ? [String(value.value)]
            : [],
        )
      : null;
  }
  const selected: StaticResult[] = [];
  for (const value of object) {
    if (value.kind === 'array') {
      selected.push(
        ...(keys?.length
          ? keys.map((key) =>
              /^(0|[1-9]\d*)$/.test(key)
                ? (value.items[Number(key)] ?? [])
                : [],
            )
          : value.items),
      );
    } else if (value.kind === 'object') {
      selected.push(
        ...(keys?.length
          ? keys.map((key) => value.properties.get(key) ?? [])
          : value.properties.values()),
      );
    }
  }
  return mergeMany(selected, context);
}

function mergeResults(
  left: StaticResult,
  right: StaticResult,
  context: EvaluationContext,
): StaticResult {
  return mergeMany([left, right], context);
}

function mergeMany(
  results: StaticResult[],
  context: EvaluationContext,
): StaticResult {
  const values = results.flatMap((result) => result ?? []);
  if (values.length) {
    return exceedsLimit(context, values.length) ? null : values;
  }
  return results.some((result) => result === undefined) ? undefined : null;
}

function exceedsLimit(context: EvaluationContext, count: number): boolean {
  if (count <= context.maxCandidates) return false;
  context.onLimitExceeded();
  return true;
}

function branch(context: EvaluationContext): EvaluationContext {
  return { ...context, seen: new Set(context.seen) };
}

export function isDefineI18nMessagesCall(
  node: NodeOfType<'CallExpression'>,
  module: Module,
): boolean {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'defineI18nMessages' &&
    !module.symbolOf(node.callee)
  );
}

function isVueUnrefCall(
  node: NodeOfType<'CallExpression'>,
  module: Module,
): boolean {
  if (node.callee.type !== 'Identifier') return false;
  const symbol = module.symbolOf(node.callee);
  return Boolean(
    symbol &&
    module.imports.some(
      (item) =>
        item.local === symbol &&
        item.name === 'unref' &&
        item.specifier === 'vue',
    ),
  );
}

function isPrimitive(value: unknown): value is Primitive {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}
