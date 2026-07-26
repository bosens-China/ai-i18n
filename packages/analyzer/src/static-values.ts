import type { TranslationOptions } from '@ai-i18n/core';
import type { Module, NodeOfType, NodeType } from 'yuku-analyzer';
import { diagnosticMessage } from './diagnostics.js';
import {
  evaluateStaticValues,
  isDefineI18nMessagesCall,
  type StaticValue,
} from './static-evaluator.js';

type Node = NodeOfType<NodeType>;

export { isDefineI18nMessagesCall };

export type StaticWarningCode =
  | 'parse-error'
  | 'dynamic-argument'
  | 'unresolved-argument'
  | 'static-candidate-limit';

export function evaluateStrings(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
  dependencies = new Set<string>(),
  maxCandidates = Number.POSITIVE_INFINITY,
  onLimitExceeded = () => {},
): string[] | null | undefined {
  const values = evaluateStaticValues(
    node,
    module,
    seen,
    dependencies,
    maxCandidates,
    onLimitExceeded,
  );
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
  maxCandidates = Number.POSITIVE_INFINITY,
  onLimitExceeded = () => {},
): TranslationOptions[] | null | undefined {
  const values = evaluateStaticValues(
    node,
    module,
    seen,
    dependencies,
    maxCandidates,
    onLimitExceeded,
  );
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
    if (!ids || !comments) continue;
    const count = ids.length * comments.length;
    if (count > maxCandidates || options.length + count > maxCandidates) {
      onLimitExceeded();
      return null;
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
