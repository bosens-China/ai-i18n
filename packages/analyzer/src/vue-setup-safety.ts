import {
  isNode,
  node,
  propertyName,
  unwrapNode,
  type AstNode,
} from './vue-ast-utils.js';

export function hasUnsafeSetupReturn(
  statements: readonly unknown[],
  origins: ReadonlyMap<string, { kind: string }>,
  properties: readonly unknown[],
): boolean {
  const returned = properties.filter(isNode);
  if (
    returned.length !== properties.length ||
    returned.some(
      (property) => property.type === 'SpreadElement' || property.computed,
    )
  ) {
    return true;
  }
  const names = returned.map((property) => propertyName(property.key));
  if (new Set(names).size !== names.length) return true;

  const objects = new Set(
    [...origins]
      .filter(([, origin]) => origin.kind === 'object')
      .map(([name]) => name),
  );
  return statements.some((statement) => containsMutation(statement, objects));
}

function containsMutation(
  value: unknown,
  objects: ReadonlySet<string>,
): boolean {
  // ponytail: 只跟踪语法可见的 .t 写入；出现真实的跨函数副作用需求时再接入完整数据流。
  if (Array.isArray(value)) {
    return value.some((item) => containsMutation(item, objects));
  }
  if (!isNode(value)) return false;
  if (
    (value.type === 'AssignmentExpression' ||
      value.type === 'UpdateExpression' ||
      (value.type === 'UnaryExpression' && value.operator === 'delete')) &&
    isTranslationMember(
      node(value.type === 'AssignmentExpression' ? value.left : value.argument),
      objects,
    )
  ) {
    return true;
  }
  return Object.values(value).some(
    (child) =>
      (Array.isArray(child) || isNode(child)) &&
      containsMutation(child, objects),
  );
}

function isTranslationMember(
  value: AstNode | null,
  objects: ReadonlySet<string>,
): boolean {
  const member = unwrapNode(value);
  if (
    member?.type !== 'MemberExpression' ||
    propertyName(member.property) !== 't'
  ) {
    return false;
  }
  const object = unwrapNode(node(member.object));
  return object?.type === 'Identifier' && objects.has(String(object.name));
}
