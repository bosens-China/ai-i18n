import type {
  Module,
  NodeOfType,
  NodeType,
  Symbol as YukuSymbol,
} from 'yuku-analyzer';

type Node = NodeOfType<NodeType>;

export interface TranslationHookBinding {
  module: string;
  hook: string;
  property: string;
  autoImport?: boolean;
}

export interface TranslationContext {
  translateSymbols: Set<YukuSymbol>;
  translationObjects: Map<YukuSymbol, Set<string>>;
  valueWrappers: Set<YukuSymbol>;
}

export function createTranslationContext(
  module: Module,
  runtimeModuleId: string,
  translationHooks: readonly TranslationHookBinding[],
): TranslationContext {
  const translateSymbols = new Set<YukuSymbol>();
  const translationObjects = new Map<YukuSymbol, Set<string>>();
  const valueWrappers = new Set<YukuSymbol>();

  for (const item of module.imports) {
    if (
      !item.typeOnly &&
      item.name === 't' &&
      item.local &&
      (item.specifier === runtimeModuleId ||
        item.local.definition()?.module.path === runtimeModuleId)
    ) {
      translateSymbols.add(item.local);
    }
    if (
      !item.typeOnly &&
      item.name === 'unref' &&
      item.specifier === 'vue' &&
      item.local
    ) {
      valueWrappers.add(item.local);
    }
  }

  collectHookTranslationSymbols(
    module,
    translationHooks,
    translateSymbols,
    translationObjects,
  );
  return { translateSymbols, translationObjects, valueWrappers };
}

export function isTranslationCallee(
  node: Node,
  module: Module,
  context: TranslationContext,
  autoImportRuntime: boolean,
): boolean {
  if (
    autoImportRuntime &&
    node.type === 'Identifier' &&
    node.name === 't' &&
    !module.symbolOf(node)
  ) {
    return true;
  }
  const symbol = valueSymbol(node, module, context.valueWrappers);
  if (symbol && context.translateSymbols.has(symbol)) return true;
  if (node.type !== 'MemberExpression') return false;
  const objectSymbol = valueSymbol(node.object, module, context.valueWrappers);
  const properties = objectSymbol
    ? context.translationObjects.get(objectSymbol)
    : undefined;
  if (!properties) return false;
  const property = node.computed
    ? node.property.type === 'Literal' &&
      typeof node.property.value === 'string'
      ? node.property.value
      : null
    : node.property.type === 'Identifier'
      ? node.property.name
      : null;
  return property !== null && properties.has(property);
}

export function isTranslationReference(
  node: Node,
  module: Module,
  context: TranslationContext,
): boolean {
  const symbol = valueSymbol(node, module, context.valueWrappers);
  return Boolean(symbol && context.translateSymbols.has(symbol));
}

export function isTranslationObject(
  node: Node,
  module: Module,
  context: TranslationContext,
): boolean {
  const symbol = valueSymbol(node, module, context.valueWrappers);
  return Boolean(symbol && context.translationObjects.has(symbol));
}

export function isTranslationHookCall(
  node: NodeOfType<'CallExpression'>,
  module: Module,
  bindings: readonly TranslationHookBinding[],
): boolean {
  if (node.callee.type !== 'Identifier') return false;
  const hookName = node.callee.name;
  const symbol = module.symbolOf(node.callee);
  return bindings.some((binding) =>
    symbol
      ? module.imports.some(
          (item) =>
            item.local === symbol &&
            item.name === binding.hook &&
            item.specifier === binding.module,
        )
      : binding.autoImport && hookName === binding.hook,
  );
}

function collectHookTranslationSymbols(
  module: Module,
  bindings: readonly TranslationHookBinding[],
  translateSymbols: Set<YukuSymbol>,
  translationObjects: Map<YukuSymbol, Set<string>>,
): void {
  if (!bindings.length) return;
  const hookProperties = new Map<YukuSymbol, Set<string>>();
  const autoImports = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (!binding.autoImport) continue;
    const properties = autoImports.get(binding.hook) ?? new Set<string>();
    properties.add(binding.property);
    autoImports.set(binding.hook, properties);
  }
  for (const item of module.imports) {
    if (item.typeOnly || !item.local) continue;
    for (const binding of bindings) {
      if (item.name !== binding.hook || item.specifier !== binding.module) {
        continue;
      }
      const properties = hookProperties.get(item.local) ?? new Set<string>();
      properties.add(binding.property);
      hookProperties.set(item.local, properties);
    }
  }
  if (!hookProperties.size && !autoImports.size) return;

  module.walk({
    VariableDeclarator(node) {
      if (
        node.init?.type !== 'CallExpression' ||
        node.init.callee.type !== 'Identifier'
      ) {
        return;
      }
      const hookSymbol = module.symbolOf(node.init.callee);
      const properties = hookSymbol
        ? hookProperties.get(hookSymbol)
        : autoImports.get(node.init.callee.name);
      if (!properties) return;
      if (node.id.type === 'Identifier') {
        const symbol = module.symbolOf(node.id);
        if (symbol) translationObjects.set(symbol, properties);
        return;
      }
      if (node.id.type !== 'ObjectPattern') return;
      for (const property of node.id.properties) {
        if (
          property.type === 'Property' &&
          property.key.type === 'Identifier' &&
          properties.has(property.key.name) &&
          property.value.type === 'Identifier'
        ) {
          const symbol = module.symbolOf(property.value);
          if (symbol) translateSymbols.add(symbol);
        }
      }
    },
  });
}

/** Vue 编译模板时会生成 `_unref(t)(...)`，这里透传到真正的 Hook symbol。 */
function valueSymbol(
  node: Node,
  module: Module,
  valueWrappers: ReadonlySet<YukuSymbol>,
): YukuSymbol | null {
  if (node.type === 'Identifier') return module.symbolOf(node);
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'Identifier'
  ) {
    const wrapper = module.symbolOf(node.callee);
    if (wrapper && valueWrappers.has(wrapper)) {
      return module.symbolOf(node.arguments[0]);
    }
  }
  if (node.type === 'ParenthesizedExpression') {
    return valueSymbol(node.expression, module, valueWrappers);
  }
  return null;
}
