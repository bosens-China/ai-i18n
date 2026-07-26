import fs from 'node:fs';
import path from 'node:path';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  extractMessages,
  findInvalidDefineI18nMessagesReferences,
  findUnboundCalls,
  validateRecommendedUsage,
  type Module,
  type ExtractWarningCode,
  type RecommendedUsageCode,
  type AnalysisLanguage,
  type TranslationHookBinding,
} from '@ai-i18n/analyzer';
import { createImportResolver } from './resolve-import.js';

export interface StaticArgsWarning {
  code: ExtractWarningCode | RecommendedUsageCode;
  line: number;
  column: number;
  message: string;
}

export function analyzeStaticArgs(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
  autoImport = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): StaticArgsWarning[] {
  const resolve = createImportResolver(tsconfigPath);
  const analyzer = new Analyzer({ resolve });
  analyzer.addFile(
    AI_I18N_VIRTUAL_MODULE_ID,
    'export function t(source) { return source }',
  );
  const entryPath = normalizeFilename(filename);
  const entry = analyzer.addFile(entryPath, code, lang ? { lang } : undefined);
  if (!hasTranslationCandidate(entry, autoImport)) return [];
  loadDependencies(analyzer, entry, resolve);
  analyzer.link();
  const extraction = extractMessages(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    translationHooks(autoImport),
    autoImport,
    maxStaticCandidates,
  ).warnings;
  const recommended = validateRecommendedUsage(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    translationHooks(autoImport),
    autoImport,
  );
  const warnings = recommended.length
    ? [
        ...extraction.filter((warning) => warning.code === 'parse-error'),
        ...extraction.filter(
          (warning) => warning.code === 'static-candidate-limit',
        ),
        ...recommended,
      ]
    : extraction;
  return warnings.map(({ code: warningCode, line, column, message }) => ({
    code: warningCode,
    line,
    column,
    message,
  }));
}

function hasTranslationCandidate(module: Module, autoImport: boolean): boolean {
  return (
    module.imports.some(
      (item) =>
        !item.typeOnly &&
        (item.specifier === AI_I18N_VIRTUAL_MODULE_ID ||
          item.name === 't' ||
          item.name === 'useI18n'),
    ) ||
    findInvalidDefineI18nMessagesReferences(module).length > 0 ||
    findUnboundCalls(
      module,
      new Set(['defineI18nMessages', ...(autoImport ? ['t', 'useI18n'] : [])]),
    ).length > 0
  );
}

function translationHooks(
  autoImport: boolean,
): readonly TranslationHookBinding[] {
  return [
    {
      module: AI_I18N_VIRTUAL_MODULE_ID,
      hook: 'useI18n',
      property: 't',
      autoImport,
    },
  ];
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
