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
  runtimeTranslateSymbols: Set<YukuSymbol>;
  runtimeRefSymbols: Set<YukuSymbol>;
  runtimeComputedSymbols: Set<YukuSymbol>;
  hookTranslateSymbols: Set<YukuSymbol>;
  translationObjects: Map<YukuSymbol, Set<string>>;
  valueWrappers: Set<YukuSymbol>;
}

export type TranslationRuntimeApi = 't' | 'tRef' | 'tComputed';
export type TranslationAutoImports =
  boolean | ReadonlySet<TranslationRuntimeApi>;
export type TranslationCalleeOrigin =
  'runtime' | 'hook' | 'vue-ref' | 'vue-computed';

export function createTranslationContext(
  module: Module,
  runtimeModuleId: string,
  translationHooks: readonly TranslationHookBinding[],
): TranslationContext {
  const translateSymbols = new Set<YukuSymbol>();
  const runtimeTranslateSymbols = new Set<YukuSymbol>();
  const runtimeRefSymbols = new Set<YukuSymbol>();
  const runtimeComputedSymbols = new Set<YukuSymbol>();
  const hookTranslateSymbols = new Set<YukuSymbol>();
  const translationObjects = new Map<YukuSymbol, Set<string>>();
  const valueWrappers = new Set<YukuSymbol>();

  for (const item of module.imports) {
    if (
      !item.typeOnly &&
      isTranslationRuntimeApi(item.name) &&
      item.local &&
      (item.specifier === runtimeModuleId ||
        item.local.definition()?.module.path === runtimeModuleId)
    ) {
      translateSymbols.add(item.local);
      if (item.name === 'tRef') {
        runtimeRefSymbols.add(item.local);
      } else if (item.name === 'tComputed') {
        runtimeComputedSymbols.add(item.local);
      } else {
        runtimeTranslateSymbols.add(item.local);
      }
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
    hookTranslateSymbols,
    translationObjects,
  );
  return {
    translateSymbols,
    runtimeTranslateSymbols,
    runtimeRefSymbols,
    runtimeComputedSymbols,
    hookTranslateSymbols,
    translationObjects,
    valueWrappers,
  };
}

export function isTranslationCallee(
  node: Node,
  module: Module,
  context: TranslationContext,
  autoImportRuntime: TranslationAutoImports,
): boolean {
  return (
    translationCalleeOrigin(node, module, context, autoImportRuntime) !== null
  );
}

export function translationCalleeOrigin(
  node: Node,
  module: Module,
  context: TranslationContext,
  autoImportRuntime: TranslationAutoImports,
): TranslationCalleeOrigin | null {
  if (
    node.type === 'Identifier' &&
    isTranslationRuntimeApi(node.name) &&
    isAutoImported(node.name, autoImportRuntime) &&
    !module.symbolOf(node)
  ) {
    return runtimeOrigin(node.name);
  }
  const symbol = valueSymbol(node, module, context.valueWrappers);
  if (symbol && context.hookTranslateSymbols.has(symbol)) return 'hook';
  if (symbol && context.runtimeRefSymbols.has(symbol)) return 'vue-ref';
  if (symbol && context.runtimeComputedSymbols.has(symbol)) {
    return 'vue-computed';
  }
  if (symbol && context.runtimeTranslateSymbols.has(symbol)) return 'runtime';
  if (node.type !== 'MemberExpression') return null;
  const objectSymbol = valueSymbol(node.object, module, context.valueWrappers);
  const properties = objectSymbol
    ? context.translationObjects.get(objectSymbol)
    : undefined;
  if (!properties) return null;
  const property = node.computed
    ? node.property.type === 'Literal' &&
      typeof node.property.value === 'string'
      ? node.property.value
      : null
    : node.property.type === 'Identifier'
      ? node.property.name
      : null;
  return property !== null && properties.has(property) ? 'hook' : null;
}

export function hasTranslationAutoImports(
  autoImports: TranslationAutoImports,
): boolean {
  return typeof autoImports === 'boolean' ? autoImports : autoImports.size > 0;
}

function isTranslationRuntimeApi(
  name: string | null,
): name is TranslationRuntimeApi {
  return name === 't' || name === 'tRef' || name === 'tComputed';
}

function isAutoImported(
  name: TranslationRuntimeApi,
  autoImports: TranslationAutoImports,
): boolean {
  return typeof autoImports === 'boolean' ? autoImports : autoImports.has(name);
}

function runtimeOrigin(name: TranslationRuntimeApi): TranslationCalleeOrigin {
  return name === 'tRef'
    ? 'vue-ref'
    : name === 'tComputed'
      ? 'vue-computed'
      : 'runtime';
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
  hookTranslateSymbols: Set<YukuSymbol>,
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
          if (symbol) {
            translateSymbols.add(symbol);
            hookTranslateSymbols.add(symbol);
          }
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
