import fs from 'node:fs';
import path from 'node:path';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  extractMessages,
  type Module,
  type ExtractWarningCode,
  type AnalysisLanguage,
  type TranslationHookBinding,
} from '@ai-i18n/analyzer';
import { createImportResolver } from './resolve-import.js';

export interface StaticArgsWarning {
  code: ExtractWarningCode;
  line: number;
  column: number;
  message: string;
}

const TRANSLATION_HOOKS: readonly TranslationHookBinding[] = [
  { module: '@ai-i18n/vue', hook: 'useI18n', property: 't' },
  { module: '@ai-i18n/react', hook: 'useI18n', property: 't' },
];

export function analyzeStaticArgs(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
): StaticArgsWarning[] {
  const resolve = createImportResolver(tsconfigPath);
  const analyzer = new Analyzer({ resolve });
  analyzer.addFile(
    AI_I18N_VIRTUAL_MODULE_ID,
    'export function t(source) { return source }',
  );
  const entryPath = normalizeFilename(filename);
  const entry = analyzer.addFile(entryPath, code, lang ? { lang } : undefined);
  if (!hasTranslationCandidate(entry)) return [];
  loadDependencies(analyzer, entry, resolve);
  analyzer.link();
  return extractMessages(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    TRANSLATION_HOOKS,
  ).warnings.map(({ code: warningCode, line, column, message }) => ({
    code: warningCode,
    line,
    column,
    message,
  }));
}

function hasTranslationCandidate(module: Module): boolean {
  return module.imports.some(
    (item) => !item.typeOnly && (item.name === 't' || item.name === 'useI18n'),
  );
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
      if (!resolved || resolved === AI_I18N_VIRTUAL_MODULE_ID) continue;
      let dependency = analyzer.module(resolved);
      if (!dependency) {
        try {
          dependency = analyzer.addFile(
            resolved,
            fs.readFileSync(resolved, 'utf8'),
          );
        } catch {
          continue;
        }
      }
      queue.push(dependency);
    }
  }
}

function normalizeFilename(filename: string) {
  return filename.startsWith('<')
    ? path.resolve('eslint-input.ts')
    : path.resolve(filename);
}
