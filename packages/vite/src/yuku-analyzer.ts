import { createMessageId, normalizeComment } from '@ai-i18n/core';
import {
  analyze,
  Analyzer,
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
  type Symbol as YukuSymbol,
} from 'yuku-analyzer';
import type { TranslationHookBinding } from './extractor.js';

export const AI_I18N_VIRTUAL_MODULE_ID = 'virtual:ai-i18n';

type Node = NodeOfType<NodeType>;

export interface ExtractedMessage {
  id: string;
  source: string;
  comment?: string;
  locations: Array<{ line: number; column: number }>;
}

export interface ExtractWarning {
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface ExtractResult {
  messages: ExtractedMessage[];
  warnings: ExtractWarning[];
  pending: boolean;
}

export function analyzeModule(
  code: string,
  id: string,
  analyzer?: Analyzer,
): Module {
  return analyzer
    ? analyzer.addFile(id, code)
    : analyze(code, {
        path: id,
      });
}

export function extractMessages(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
): ExtractResult {
  const messages = new Map<string, ExtractedMessage>();
  const warnings: ExtractWarning[] = [];
  let pending = false;
  const translateSymbols = new Set<YukuSymbol>();
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
  }

  collectHookTranslationSymbols(module, translationHooks, translateSymbols);

  if (!translateSymbols.size) return { messages: [], warnings, pending };

  module.walk({
    CallExpression(node) {
      if (node.callee.type !== 'Identifier') return;
      const symbol = module.symbolOf(node.callee);
      if (!symbol || !translateSymbols.has(symbol)) return;

      const sources = evaluateStrings(node.arguments[0], module);
      const comments =
        node.arguments.length < 2
          ? ['']
          : evaluateStrings(node.arguments[1], module);
      if (sources === undefined || comments === undefined) {
        pending = true;
        return;
      }
      if (sources === null || comments === null || node.arguments.length > 2) {
        const location = sourceLocation(module.source, node.start);
        warnings.push({
          file: module.path,
          ...location,
          message: 't() arguments must be statically evaluable strings',
        });
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
): void {
  if (!bindings.length) return;
  const hookProperties = new Map<YukuSymbol, Set<string>>();
  for (const item of module.imports) {
    if (item.typeOnly || !item.local) continue;
    for (const binding of bindings) {
      if (item.name !== binding.hook || item.specifier !== binding.module) continue;
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
        node.init.callee.type !== 'Identifier' ||
        node.id.type !== 'ObjectPattern'
      ) {
        return;
      }
      const hookSymbol = module.symbolOf(node.init.callee);
      const properties = hookSymbol ? hookProperties.get(hookSymbol) : undefined;
      if (!properties) return;
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
        ? [node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('')]
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
      const parent = declaration
        ? target.module.parentOf(declaration)
        : null;
      return parent?.type === 'VariableDeclarator'
        ? evaluateStrings(parent.init ?? undefined, target.module, seen)
        : null;
    }
    default:
      return null;
  }
}

function sourceLocation(source: string, offset: number) {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines.at(-1)?.length ?? 0,
  };
}

export { Analyzer };
