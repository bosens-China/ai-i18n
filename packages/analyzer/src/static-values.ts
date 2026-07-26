import {
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';
import type { TranslationOptions } from '@ai-i18n/core';
import { diagnosticMessage } from './diagnostics.js';

type Node = NodeOfType<NodeType>;
type Primitive = string | number | boolean | bigint | null | undefined;
type StaticResult = StaticValue[] | null | undefined;
type StaticValue =
  | { kind: 'primitive'; value: Primitive }
  | { kind: 'array'; items: StaticResult[] }
  | { kind: 'object'; properties: Map<string, StaticResult> };

const MAX_STATIC_CANDIDATES = 1_000;

export type StaticWarningCode =
  'parse-error' | 'dynamic-argument' | 'unresolved-argument';

export function evaluateStrings(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
  dependencies = new Set<string>(),
): string[] | null | undefined {
  const values = evaluateValue(node, module, seen, dependencies);
  if (values === undefined || values === null) return values;
  const strings = values.flatMap((value) =>
    value.kind === 'primitive' && typeof value.value === 'string'
      ? [value.value]
      : [],
  );
  return strings.length ? [...new Set(strings)] : null;
}

export function evaluateTranslationOptions(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
  dependencies = new Set<string>(),
): TranslationOptions[] | null | undefined {
  const values = evaluateValue(node, module, seen, dependencies);
  if (values === undefined || values === null) return values;
  const options: TranslationOptions[] = [];

  for (const value of values) {
    if (
      value.kind !== 'object' ||
      [...value.properties.keys()].some(
        (key) => key !== 'id' && key !== 'comment',
      )
    ) {
      continue;
    }
    const ids = optionalStrings(value, 'id');
    const comments = optionalStrings(value, 'comment');
    if (ids === undefined || comments === undefined) return undefined;
    if (
      !ids ||
      !comments ||
      ids.length * comments.length > MAX_STATIC_CANDIDATES
    ) {
      continue;
    }
    for (const id of ids) {
      for (const comment of comments) {
        options.push({
          ...(id === undefined ? {} : { id }),
          ...(comment === undefined ? {} : { comment }),
        });
      }
    }
  }

  return options.length
    ? [
        ...new Map(
          options.map((option) => [
            JSON.stringify([option.id, option.comment]),
            option,
          ]),
        ).values(),
      ]
    : null;
}

function optionalStrings(
  object: Extract<StaticValue, { kind: 'object' }>,
  property: string,
): Array<string | undefined> | null | undefined {
  if (!object.properties.has(property)) return [undefined];
  const values = object.properties.get(property);
  if (values === undefined) return undefined;
  if (values === null) return null;
  const strings = values.flatMap((value) =>
    value.kind === 'primitive' && typeof value.value === 'string'
      ? [value.value]
      : [],
  );
  return strings.length ? [...new Set(strings)] : null;
}

function evaluateValue(
  node: Node | undefined,
  module: Module,
  seen: Set<string>,
  dependencies: Set<string>,
): StaticResult {
  if (!node) return null;

  switch (node.type) {
    case 'Literal':
      return isPrimitive(node.value)
        ? [{ kind: 'primitive', value: node.value }]
        : null;
    case 'TemplateLiteral':
      return evaluateTemplate(node, module, seen, dependencies);
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
    case 'ChainExpression':
      return evaluateValue(node.expression, module, seen, dependencies);
    case 'ConditionalExpression':
    case 'LogicalExpression':
      return mergeResults(
        evaluateValue(
          node.type === 'ConditionalExpression' ? node.consequent : node.left,
          module,
          new Set(seen),
          dependencies,
        ),
        evaluateValue(
          node.type === 'ConditionalExpression' ? node.alternate : node.right,
          module,
          new Set(seen),
          dependencies,
        ),
      );
    case 'SequenceExpression':
      return evaluateValue(node.expressions.at(-1), module, seen, dependencies);
    case 'BinaryExpression':
      return node.operator === '+'
        ? evaluateAddition(node.left, node.right, module, seen, dependencies)
        : null;
    case 'Identifier':
      return evaluateIdentifier(node, module, seen, dependencies);
    case 'ArrayExpression':
      return evaluateArray(node, module, seen, dependencies);
    case 'ObjectExpression':
      return evaluateObject(node, module, seen, dependencies);
    case 'MemberExpression':
      return evaluateMember(node, module, seen, dependencies);
    case 'CallExpression':
      return (isDefineI18nMessagesCall(node, module) ||
        isVueUnrefCall(node, module)) &&
        node.arguments.length === 1 &&
        node.arguments[0]?.type !== 'SpreadElement'
        ? evaluateValue(node.arguments[0], module, seen, dependencies)
        : null;
    default:
      return null;
  }
}

function evaluateIdentifier(
  node: NodeOfType<'Identifier'>,
  module: Module,
  seen: Set<string>,
  dependencies: Set<string>,
): StaticResult {
  const symbol = module.symbolOf(node);
  if (!symbol) return null;
  const definition = symbol.definition();
  if (!definition && symbol.has(SymbolFlags.Import)) return undefined;
  const target = definition?.symbol ?? symbol;
  if (
    !target.has(SymbolFlags.Const) &&
    target.references.some((item) => item.isWrite)
  ) {
    return null;
  }
  if (target.module.path !== module.path) dependencies.add(target.module.path);
  const key = `${target.module.path}:${target.id}`;
  if (seen.has(key)) return null;
  const declaration = target.declarations[0];
  const parent = declaration ? target.module.parentOf(declaration) : null;
  if (parent?.type !== 'VariableDeclarator') return null;
  seen.add(key);
  return evaluateValue(
    parent.init ?? undefined,
    target.module,
    seen,
    dependencies,
  );
}

function evaluateTemplate(
  node: NodeOfType<'TemplateLiteral'>,
  module: Module,
  seen: Set<string>,
  dependencies: Set<string>,
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
    const candidates = evaluateValue(
      expression,
      module,
      new Set(seen),
      dependencies,
    );
    if (!candidates) return candidates;
    const primitives = candidates.flatMap((candidate) =>
      candidate.kind === 'primitive' ? [String(candidate.value)] : [],
    );
    if (
      !primitives.length ||
      values.length * primitives.length > MAX_STATIC_CANDIDATES
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
  seen: Set<string>,
  dependencies: Set<string>,
): StaticResult {
  const left = evaluateValue(leftNode, module, new Set(seen), dependencies);
  const right = evaluateValue(rightNode, module, new Set(seen), dependencies);
  if (!left || !right || left.length * right.length > MAX_STATIC_CANDIDATES) {
    return left === undefined || right === undefined ? undefined : null;
  }
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
  seen: Set<string>,
  dependencies: Set<string>,
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
      const value = evaluateValue(element, module, new Set(seen), dependencies);
      arrays.forEach((array) => array.items.push(value));
      continue;
    }
    const spread = evaluateValue(
      element.argument,
      module,
      new Set(seen),
      dependencies,
    );
    if (!spread) return spread;
    const candidates = spread.filter(
      (value): value is Extract<StaticValue, { kind: 'array' }> =>
        value.kind === 'array',
    );
    if (
      !candidates.length ||
      arrays.length * candidates.length > MAX_STATIC_CANDIDATES
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
  seen: Set<string>,
  dependencies: Set<string>,
): StaticResult {
  let objects: Extract<StaticValue, { kind: 'object' }>[] = [
    { kind: 'object', properties: new Map() },
  ];
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      const spread = evaluateValue(
        property.argument,
        module,
        new Set(seen),
        dependencies,
      );
      if (!spread) return spread;
      const candidates = spread.filter(
        (value): value is Extract<StaticValue, { kind: 'object' }> =>
          value.kind === 'object',
      );
      if (
        !candidates.length ||
        objects.length * candidates.length > MAX_STATIC_CANDIDATES
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
    const keys = propertyKeys(property, module, seen, dependencies);
    if (!keys) return keys;
    const value = evaluateValue(
      property.value,
      module,
      new Set(seen),
      dependencies,
    );
    for (const object of objects) {
      for (const key of keys) object.properties.set(key, value);
    }
  }
  return objects;
}

function propertyKeys(
  property: NodeOfType<'Property'>,
  module: Module,
  seen: Set<string>,
  dependencies: Set<string>,
): string[] | null | undefined {
  if (!property.computed && property.key.type === 'Identifier') {
    return [property.key.name];
  }
  if (!property.computed && property.key.type === 'Literal') {
    return [String(property.key.value)];
  }
  const values = evaluateValue(
    property.key,
    module,
    new Set(seen),
    dependencies,
  );
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
  seen: Set<string>,
  dependencies: Set<string>,
): StaticResult {
  const object = evaluateValue(
    node.object,
    module,
    new Set(seen),
    dependencies,
  );
  if (!object) return object;
  let keys: string[] | null | undefined;
  if (!node.computed && node.property.type === 'Identifier') {
    keys = [node.property.name];
  } else {
    const values = evaluateValue(
      node.property,
      module,
      new Set(seen),
      dependencies,
    );
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
          ? keys.map((key) => value.items[Number(key)] ?? [])
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
  return mergeMany(selected);
}

function mergeResults(left: StaticResult, right: StaticResult): StaticResult {
  return mergeMany([left, right]);
}

function mergeMany(results: StaticResult[]): StaticResult {
  const values = results.flatMap((result) => result ?? []);
  if (values.length) {
    return values.length <= MAX_STATIC_CANDIDATES ? values : null;
  }
  return results.some((result) => result === undefined) ? undefined : null;
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

export function findInvalidDefineI18nMessagesReferences(module: Module) {
  return module.references
    .filter(
      (reference) =>
        reference.name === 'defineI18nMessages' &&
        !reference.symbol &&
        !reference.inTypePosition,
    )
    .flatMap((reference) => {
      const parent = module.parentOf(reference.node);
      return parent?.type === 'CallExpression' &&
        parent.callee === reference.node
        ? []
        : [{ start: reference.node.start, end: reference.node.end }];
    });
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

export function argumentWarning(
  module: Module,
  offset: number,
  code: StaticWarningCode,
) {
  return {
    code,
    file: module.path,
    ...sourceLocation(module.source, offset),
    message: diagnosticMessage(
      't() 的 source 必须是可静态提取的字符串，options 必须是可静态提取的对象。',
      't() source must be a statically extractable string and options must be a statically extractable object.',
    ),
  };
}

export function sourceLocation(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
