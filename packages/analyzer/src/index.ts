import {
  createMessageId,
  createTemplateMessage,
  normalizeComment,
} from '@ai-i18n/core';
import {
  analyze,
  Analyzer,
  type AddFileOptions,
  type Module,
  type NodeOfType,
  type NodeType,
  type Symbol as YukuSymbol,
} from 'yuku-analyzer';
import {
  argumentWarning,
  evaluateStrings,
  sourceLocation,
  type StaticWarningCode,
} from './static-values.js';

export type { Module } from 'yuku-analyzer';

export const AI_I18N_VIRTUAL_MODULE_ID = 'virtual:ai-i18n';

export type AnalysisLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

export interface TranslationHookBinding {
  module: string;
  hook: string;
  property: string;
  autoImport?: boolean;
}

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ExtractedMessage {
  id: string;
  source: string;
  comment?: string;
  locations: SourceLocation[];
}

export type ExtractWarningCode = StaticWarningCode;

export interface ExtractWarning extends SourceLocation {
  code: ExtractWarningCode;
  file: string;
  message: string;
}

export interface ExtractResult {
  messages: ExtractedMessage[];
  warnings: ExtractWarning[];
  dependencies: string[];
  pending: boolean;
}

type Node = NodeOfType<NodeType>;

export function analyzeModule(
  code: string,
  id: string,
  analyzer?: Analyzer,
  lang?: AnalysisLanguage,
): Module {
  const parseOptions: AddFileOptions | undefined = lang ? { lang } : undefined;
  return analyzer
    ? analyzer.addFile(id, code, parseOptions)
    : analyze(code, { path: id, ...parseOptions });
}

export function extractMessages(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime = false,
): ExtractResult {
  const messages = new Map<string, ExtractedMessage>();
  const warnings: ExtractWarning[] = module.diagnostics.map((diagnostic) => ({
    code: 'parse-error',
    file: module.path,
    ...sourceLocation(module.source, diagnostic.start),
    message: diagnostic.message,
  }));
  let pending = false;
  const dependencies = new Set<string>();
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

  if (
    !translateSymbols.size &&
    !translationObjects.size &&
    !autoImportRuntime
  ) {
    return { messages: [], warnings, dependencies: [], pending };
  }

  const addMessage = (
    source: string,
    rawComment: string | undefined,
    offset: number,
  ) => {
    const comment = normalizeComment(rawComment);
    const id = createMessageId(source, comment);
    const location = sourceLocation(module.source, offset);
    const previous = messages.get(id);
    if (previous) {
      previous.locations.push(location);
      return;
    }
    messages.set(id, {
      id,
      source,
      ...(comment ? { comment } : {}),
      locations: [location],
    });
  };

  module.walk({
    CallExpression(node) {
      if (
        !isTranslationCallee(
          node.callee,
          module,
          translateSymbols,
          translationObjects,
          valueWrappers,
          autoImportRuntime,
        )
      ) {
        return;
      }

      const sources = evaluateStrings(
        node.arguments[0],
        module,
        new Set(),
        dependencies,
      );
      const comments =
        node.arguments.length < 2 ||
        isUnboundUndefined(node.arguments[1], module)
          ? ['']
          : evaluateStrings(node.arguments[1], module, new Set(), dependencies);
      if (sources === undefined || comments === undefined) {
        pending = true;
        warnings.push(
          argumentWarning(module, node.start, 'unresolved-argument'),
        );
        return;
      }
      if (sources === null || comments === null || node.arguments.length > 2) {
        warnings.push(argumentWarning(module, node.start, 'dynamic-argument'));
        return;
      }

      for (const source of sources) {
        for (const rawComment of comments) {
          addMessage(source, rawComment, node.start);
        }
      }
    },
    TaggedTemplateExpression(node) {
      if (
        !isTranslationCallee(
          node.tag,
          module,
          translateSymbols,
          translationObjects,
          valueWrappers,
          autoImportRuntime,
        )
      ) {
        return;
      }
      addMessage(
        createTemplateMessage(
          node.quasi.quasis.map(
            (quasi) => quasi.value.cooked ?? quasi.value.raw,
          ),
        ),
        undefined,
        node.start,
      );
    },
  });

  return {
    messages: [...messages.values()],
    warnings,
    dependencies: [...dependencies].sort(),
    pending,
  };
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
      if (item.name !== binding.hook || item.specifier !== binding.module)
        continue;
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

function isTranslationCallee(
  node: Node,
  module: Module,
  translateSymbols: ReadonlySet<YukuSymbol>,
  translationObjects: ReadonlyMap<YukuSymbol, ReadonlySet<string>>,
  valueWrappers: ReadonlySet<YukuSymbol>,
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
  const symbol = valueSymbol(node, module, valueWrappers);
  if (symbol && translateSymbols.has(symbol)) return true;
  if (node.type !== 'MemberExpression') return false;
  const objectSymbol = valueSymbol(node.object, module, valueWrappers);
  const properties = objectSymbol
    ? translationObjects.get(objectSymbol)
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

export function findUnboundCalls(
  module: Module,
  names: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  module.walk({
    CallExpression(node) {
      if (
        node.callee.type === 'Identifier' &&
        names.has(node.callee.name) &&
        !module.symbolOf(node.callee)
      ) {
        found.add(node.callee.name);
      }
    },
    TaggedTemplateExpression(node) {
      if (
        node.tag.type === 'Identifier' &&
        names.has(node.tag.name) &&
        !module.symbolOf(node.tag)
      ) {
        found.add(node.tag.name);
      }
    },
  });
  return [...found];
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

function isUnboundUndefined(node: Node | undefined, module: Module): boolean {
  return (
    node?.type === 'Identifier' &&
    node.name === 'undefined' &&
    !module.symbolOf(node)
  );
}

export { Analyzer };
