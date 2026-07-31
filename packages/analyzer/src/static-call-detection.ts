import type { Module, NodeOfType } from 'yuku-analyzer';

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

export function isVueUnrefCall(
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
