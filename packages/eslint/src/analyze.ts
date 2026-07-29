import fs from 'node:fs';
import path from 'node:path';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  extractMessages,
  findInvalidDefineI18nMessagesReferences,
  findTranslationCalls,
  findUnboundCalls,
  validateRecommendedUsage,
  type Module,
  type ExtractWarningCode,
  type RecommendedUsageCode,
  type AnalysisLanguage,
  type TranslationCall,
  type TranslationHookBinding,
} from '@ai-i18n/analyzer';
import { createImportResolver } from './resolve-import.js';

export interface StaticArgsWarning {
  code: ExtractWarningCode | RecommendedUsageCode;
  line: number;
  column: number;
  message: string;
}

export interface StaticAnalysisResult {
  warnings: StaticArgsWarning[];
  translationCalls: TranslationCall[];
}

export type AutoImportApi = 't' | 'useI18n';
export type AutoImportOption = boolean | readonly AutoImportApi[];

interface AutoImportBindings {
  t: boolean;
  useI18n: boolean;
}

const POTENTIAL_TRANSLATION_RE =
  /virtual:ai-i18n|\b(?:t|useI18n|defineI18nMessages)\b/;

export function analyzeStaticArgs(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
  autoImport: AutoImportOption = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): StaticArgsWarning[] {
  return analyzeStaticSource(
    code,
    filename,
    tsconfigPath,
    lang,
    autoImport,
    maxStaticCandidates,
  ).warnings;
}

export function analyzeStaticSource(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
  autoImport: AutoImportOption = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): StaticAnalysisResult {
  if (!hasPotentialTranslationCandidate(code)) {
    return { warnings: [], translationCalls: [] };
  }
  const autoImports = normalizeAutoImports(autoImport);
  const resolve = createImportResolver(tsconfigPath);
  const analyzer = new Analyzer({ resolve });
  analyzer.addFile(
    AI_I18N_VIRTUAL_MODULE_ID,
    'export function t(source) { return source }',
  );
  const entryPath = normalizeFilename(filename);
  const entry = analyzer.addFile(entryPath, code, lang ? { lang } : undefined);
  if (!hasTranslationCandidate(entry, autoImports)) {
    return { warnings: [], translationCalls: [] };
  }
  loadDependencies(analyzer, entry, resolve);
  analyzer.link();
  const hooks = translationHooks(autoImports);
  const extraction = extractMessages(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    hooks,
    autoImports.t,
    maxStaticCandidates,
  ).warnings;
  const recommended = validateRecommendedUsage(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    hooks,
    autoImports.t,
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
  return {
    warnings: warnings.map(({ code: warningCode, line, column, message }) => ({
      code: warningCode,
      line,
      column,
      message,
    })),
    translationCalls: findTranslationCalls(
      entry,
      AI_I18N_VIRTUAL_MODULE_ID,
      hooks,
      autoImports.t,
    ),
  };
}

export function hasPotentialTranslationCandidate(code: string): boolean {
  return POTENTIAL_TRANSLATION_RE.test(code);
}

export function normalizeAutoImports(
  autoImport: AutoImportOption | undefined,
): AutoImportBindings {
  if (typeof autoImport === 'boolean') {
    return { t: autoImport, useI18n: autoImport };
  }
  return {
    t: autoImport?.includes('t') ?? false,
    useI18n: autoImport?.includes('useI18n') ?? false,
  };
}

function hasTranslationCandidate(
  module: Module,
  autoImports: AutoImportBindings,
): boolean {
  const unbound = ['defineI18nMessages'];
  if (autoImports.t) unbound.push('t');
  if (autoImports.useI18n) unbound.push('useI18n');
  return (
    module.imports.some(
      (item) =>
        !item.typeOnly &&
        (item.specifier === AI_I18N_VIRTUAL_MODULE_ID ||
          item.name === 't' ||
          item.name === 'useI18n'),
    ) ||
    findInvalidDefineI18nMessagesReferences(module).length > 0 ||
    findUnboundCalls(module, new Set(unbound)).length > 0
  );
}

function translationHooks(
  autoImports: AutoImportBindings,
): readonly TranslationHookBinding[] {
  return [
    {
      module: AI_I18N_VIRTUAL_MODULE_ID,
      hook: 'useI18n',
      property: 't',
      autoImport: autoImports.useI18n,
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
