import fs from 'node:fs';
import path from 'node:path';
import {
  Analyzer,
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
  type Symbol as YukuSymbol,
} from 'yuku-analyzer';
import { createImportResolver } from './resolve-import.js';

type Node = NodeOfType<NodeType>;

export interface StaticArgsWarning {
  line: number;
  column: number;
}

export function analyzeStaticArgs(
  code: string,
  filename: string,
  tsconfigPath?: string,
): StaticArgsWarning[] {
  const resolve = createImportResolver(tsconfigPath);
  const analyzer = new Analyzer({ resolve });
  analyzer.addFile(
    'virtual:ai-i18n',
    'export function t(source) { return source }',
  );
  const entryPath = normalizeFilename(filename);
  const entry = analyzer.addFile(entryPath, code);
  loadDependencies(analyzer, entry, resolve);
  analyzer.link();
  return collectWarnings(entry);
}

function loadDependencies(
  analyzer: Analyzer,
  entry: Module,
  resolve: (specifier: string, importer: string) => string | null,
) {
  const queue = [entry];
  const visited = new Set<string>();
  while (queue.length) {
    const module = queue.shift()!;
    if (visited.has(module.path)) continue;
    visited.add(module.path);
    for (const item of module.imports) {
      const resolved = resolve(item.specifier, module.path);
      if (!resolved || resolved === 'virtual:ai-i18n') continue;
      let dependency = analyzer.module(resolved);
      if (!dependency) {
        try {
          dependency = analyzer.addFile(resolved, fs.readFileSync(resolved, 'utf8'));
        } catch {
          continue;
        }
      }
      queue.push(dependency);
    }
  }
}

function collectWarnings(module: Module): StaticArgsWarning[] {
  const warnings: StaticArgsWarning[] = [];
  const translateSymbols = new Set<YukuSymbol>();
  for (const item of module.imports) {
    if (
      !item.typeOnly &&
      item.name === 't' &&
      item.local &&
      (item.specifier === 'virtual:ai-i18n' ||
        item.local.definition()?.module.path === 'virtual:ai-i18n')
    ) {
      translateSymbols.add(item.local);
    }
  }
  collectHookTranslationSymbols(module, translateSymbols);

  module.walk({
    CallExpression(node) {
      if (node.callee.type !== 'Identifier') return;
      const symbol = module.symbolOf(node.callee);
      if (!symbol || !translateSymbols.has(symbol)) return;
      const source = evaluateStrings(node.arguments[0], module);
      const comment =
        node.arguments.length < 2
          ? ['']
          : evaluateStrings(node.arguments[1], module);
      if (
        source === null ||
        source === undefined ||
        comment === null ||
        comment === undefined ||
        node.arguments.length > 2
      ) {
        warnings.push(sourceLocation(module.source, node.start));
      }
    },
  });
  return warnings;
}

function collectHookTranslationSymbols(
  module: Module,
  translateSymbols: Set<YukuSymbol>,
): void {
  const hooks = new Set<YukuSymbol>();
  for (const item of module.imports) {
    if (
      !item.typeOnly &&
      item.name === 'useI18n' &&
      item.local &&
      (item.specifier === '@ai-i18n/vue' ||
        item.specifier === '@ai-i18n/react')
    ) {
      hooks.add(item.local);
    }
  }
  if (!hooks.size) return;

  module.walk({
    VariableDeclarator(node) {
      const hookSymbol =
        node.init?.type === 'CallExpression' &&
        node.init.callee.type === 'Identifier'
          ? module.symbolOf(node.init.callee)
          : undefined;
      if (
        node.id.type !== 'ObjectPattern' ||
        !hookSymbol ||
        !hooks.has(hookSymbol)
      ) {
        return;
      }
      for (const property of node.id.properties) {
        if (
          property.type === 'Property' &&
          property.key.type === 'Identifier' &&
          property.key.name === 't' &&
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
      const consequent = evaluateStrings(node.consequent, module, new Set(seen));
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

function normalizeFilename(filename: string) {
  return filename.startsWith('<')
    ? path.resolve('eslint-input.ts')
    : path.resolve(filename);
}

function sourceLocation(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
