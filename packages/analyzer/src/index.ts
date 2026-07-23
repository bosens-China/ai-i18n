import { createMessageId, normalizeComment } from '@ai-i18n/core';
import {
  analyze,
  Analyzer,
  SymbolFlags,
  type AddFileOptions,
  type Module,
  type NodeOfType,
  type NodeType,
  type Symbol as YukuSymbol,
} from 'yuku-analyzer';

export type { Module } from 'yuku-analyzer';

export const AI_I18N_VIRTUAL_MODULE_ID = 'virtual:ai-i18n';

export type AnalysisLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

export interface TranslationHookBinding {
  module: string;
  hook: string;
  property: string;
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

export type ExtractWarningCode =
  'parse-error' | 'dynamic-argument' | 'unresolved-argument';

export interface ExtractWarning extends SourceLocation {
  code: ExtractWarningCode;
  file: string;
  message: string;
}

export interface ExtractResult {
  messages: ExtractedMessage[];
  warnings: ExtractWarning[];
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
): ExtractResult {
  const messages = new Map<string, ExtractedMessage>();
  const warnings: ExtractWarning[] = module.diagnostics.map((diagnostic) => ({
    code: 'parse-error',
    file: module.path,
    ...sourceLocation(module.source, diagnostic.start),
    message: diagnostic.message,
  }));
  let pending = false;
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

  if (!translateSymbols.size && !translationObjects.size) {
    return { messages: [], warnings, pending };
  }

  module.walk({
    CallExpression(node) {
      if (
        !isTranslationCallee(
          node.callee,
          module,
          translateSymbols,
          translationObjects,
          valueWrappers,
        )
      ) {
        return;
      }

      const sources = evaluateStrings(node.arguments[0], module);
      const comments =
        node.arguments.length < 2 ||
        isUnboundUndefined(node.arguments[1], module)
          ? ['']
          : evaluateStrings(node.arguments[1], module);
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

      const location = sourceLocation(module.source, node.start);
      for (const source of sources) {
        for (const rawComment of comments) {
          const comment = normalizeComment(rawComment);
          const id = createMessageId(source, comment);
          const previous = messages.get(id);
          if (previous) previous.locations.push(location);
          else {
            messages.set(id, {
              id,
              source,
              ...(comment ? { comment } : {}),
              locations: [location],
            });
          }
        }
      }
    },
  });

  return { messages: [...messages.values()], warnings, pending };
}

function collectHookTranslationSymbols(
  module: Module,
  bindings: readonly TranslationHookBinding[],
  translateSymbols: Set<YukuSymbol>,
  translationObjects: Map<YukuSymbol, Set<string>>,
): void {
  if (!bindings.length) return;
  const hookProperties = new Map<YukuSymbol, Set<string>>();
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
  if (!hookProperties.size) return;

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
        : undefined;
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
): boolean {
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

function evaluateStrings(
  node: Node | undefined,
  module: Module,
  seen = new Set<string>(),
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
      return evaluateStrings(node.expression, module, seen);
    case 'ConditionalExpression': {
      const consequent = evaluateStrings(
        node.consequent,
        module,
        new Set(seen),
      );
      const alternate = evaluateStrings(node.alternate, module, new Set(seen));
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
      const key = `${target.module.path}:${target.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const declaration = target.declarations[0];
      const parent = declaration ? target.module.parentOf(declaration) : null;
      return parent?.type === 'VariableDeclarator'
        ? evaluateStrings(parent.init ?? undefined, target.module, seen)
        : null;
    }
    default:
      return null;
  }
}

function argumentWarning(
  module: Module,
  offset: number,
  code: ExtractWarningCode,
): ExtractWarning {
  return {
    code,
    file: module.path,
    ...sourceLocation(module.source, offset),
    message: 't() arguments must be statically evaluable strings',
  };
}

function sourceLocation(source: string, offset: number): SourceLocation {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}

export { Analyzer };
