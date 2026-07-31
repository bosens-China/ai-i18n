import type { TranslationOptions } from '@ai-i18n/core';
import type { Module, NodeOfType, NodeType } from 'yuku-analyzer';
import { diagnosticMessage } from './diagnostics.js';
import {
  evaluateStaticValues,
  type StaticResult,
  type StaticValue,
} from './static-evaluator.js';
import { isDefineI18nMessagesCall } from './static-call-detection.js';

type Node = NodeOfType<NodeType>;

export { isDefineI18nMessagesCall };

export type StaticWarningCode =
  | 'parse-error'
  | 'dynamic-argument'
  | 'unresolved-argument'
  | 'static-candidate-limit';

export interface TranslationInput {
  kind: 'source' | 'tree';
  sources: string[];
}

export function evaluateTranslationInput(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
  dependencies = new Set<string>(),
  maxCandidates = Number.POSITIVE_INFINITY,
  onLimitExceeded = () => {},
): TranslationInput | null | undefined {
  const values = evaluateStaticValues(
    node,
    module,
    seen,
    dependencies,
    maxCandidates,
    onLimitExceeded,
  );
  if (values === undefined || values === null) return values;

  if (
    values.every(
      (value) => value.kind === 'primitive' && typeof value.value === 'string',
    )
  ) {
    return {
      kind: 'source',
      sources: uniqueStrings(
        values.map((value) =>
          value.kind === 'primitive' ? String(value.value) : '',
        ),
        maxCandidates,
        onLimitExceeded,
      ),
    };
  }
  if (
    !values.length ||
    !values.every((value) => value.kind === 'array' || value.kind === 'object')
  ) {
    return null;
  }

  const sources = new Set<string>();
  for (const value of values) {
    const result = collectTreeStrings(
      [value],
      sources,
      maxCandidates,
      onLimitExceeded,
    );
    if (result !== true) return result;
  }
  return { kind: 'tree', sources: [...sources] };
}

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

function collectTreeStrings(
  values: StaticResult,
  sources: Set<string>,
  maxCandidates: number,
  onLimitExceeded: () => void,
): true | null | undefined {
  if (values === undefined || values === null) return values;
  for (const value of values) {
    if (value.kind === 'primitive') {
      if (typeof value.value !== 'string') continue;
      sources.add(value.value);
      if (sources.size > maxCandidates) {
        onLimitExceeded();
        return null;
      }
      continue;
    }
    const children =
      value.kind === 'array' ? value.items : [...value.properties.values()];
    for (const child of children) {
      const result = collectTreeStrings(
        child,
        sources,
        maxCandidates,
        onLimitExceeded,
      );
      if (result !== true) return result;
    }
  }
  return true;
}

function uniqueStrings(
  values: string[],
  maxCandidates: number,
  onLimitExceeded: () => void,
): string[] {
  const unique = [...new Set(values)];
  if (unique.length > maxCandidates) onLimitExceeded();
  return unique;
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
      [...value.properties.keys()].some((key) => key !== 'comment')
    ) {
      continue;
    }
    const comments = optionalStrings(value, 'comment');
    if (comments === undefined) return undefined;
    if (!comments) continue;
    if (
      comments.length > maxCandidates ||
      options.length + comments.length > maxCandidates
    ) {
      onLimitExceeded();
      return null;
    }
    for (const comment of comments) {
      options.push({
        ...(comment === undefined ? {} : { comment }),
      });
    }
  }

  return options.length
    ? [...new Map(options.map((option) => [option.comment, option])).values()]
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
    value.kind === 'primitive' &&
    (typeof value.value === 'string' || value.value === undefined)
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
      '翻译参数必须是可静态提取的字符串或纯文案树；字符串 options 必须是仅包含 comment 的静态对象。',
      'Translation input must be a statically extractable string or message-only tree; string options must be a static object containing only comment.',
    ),
  };
}

export function sourceLocation(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
