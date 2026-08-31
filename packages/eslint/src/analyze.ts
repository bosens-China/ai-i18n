import fs from 'node:fs';
import path from 'node:path';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  extractMessages,
  findInvalidDefineI18nMessagesReferences,
  findRuntimeTypedLocalTranslationCalls,
  findTranslationCalls,
  findUnboundCalls,
  validateRecommendedUsage,
  type Module,
  type ExtractWarningCode,
  type ExtractedMessage,
  type RecommendedUsageCode,
  type AnalysisLanguage,
  type TranslationCall,
  type TranslationHookBinding,
  type TranslationRuntimeApi,
} from '@ai-i18n/analyzer';
import { createImportResolver, type ImportAlias } from './resolve-import.js';

export interface StaticArgsWarning {
  code: ExtractWarningCode | RecommendedUsageCode;
  line: number;
  column: number;
  message: string;
}

export interface StaticAnalysisResult {
  warnings: StaticArgsWarning[];
  translationCalls: TranslationCall[];
  messages: ExtractedMessage[];
}

export type AutoImportApi = 't' | 'tRef' | 'tComputed' | 'useI18n';
export type AutoImportOption = boolean | readonly AutoImportApi[];

interface AutoImportBindings {
  t: boolean;
  tRef: boolean;
  tComputed: boolean;
  useI18n: boolean;
}

const POTENTIAL_TRANSLATION_RE =
  /virtual:ai-i18n|\b(?:t|tRef|tComputed|useI18n|defineI18nMessages)\b/;

export function analyzeStaticArgs(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
  autoImport: AutoImportOption = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
  alias?: ImportAlias,
): StaticArgsWarning[] {
  return analyzeStaticSource(
    code,
    filename,
    tsconfigPath,
    lang,
    autoImport,
    maxStaticCandidates,
    alias,
  ).warnings;
}

export function analyzeStaticSource(
  code: string,
  filename: string,
  tsconfigPath?: string,
  lang?: AnalysisLanguage,
  autoImport: AutoImportOption = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
  alias?: ImportAlias,
): StaticAnalysisResult {
  if (!hasPotentialTranslationCandidate(code)) {
    return { warnings: [], translationCalls: [], messages: [] };
  }
  const autoImports = normalizeAutoImports(autoImport);
  const translationAutoImports = runtimeAutoImports(autoImports);
  const resolve = createImportResolver(tsconfigPath, alias);
  const analyzer = new Analyzer({ resolve });
  analyzer.addFile(
    AI_I18N_VIRTUAL_MODULE_ID,
    'export function t(source) { return source } export function tRef(source) { return source } export function tComputed(source) { return source }',
  );
  const entryPath = normalizeFilename(filename);
  const entry = analyzer.addFile(entryPath, code, lang ? { lang } : undefined);
  if (!hasTranslationCandidate(entry, autoImports)) {
    return { warnings: [], translationCalls: [], messages: [] };
  }
  loadDependencies(analyzer, entry, resolve);
  analyzer.link();
  const hooks = translationHooks(autoImports);
  const extraction = extractMessages(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    hooks,
    translationAutoImports,
    maxStaticCandidates,
  );
  const recommended = validateRecommendedUsage(
    entry,
    AI_I18N_VIRTUAL_MODULE_ID,
    hooks,
    translationAutoImports,
  );
  const warnings = recommended.length
    ? [
        ...extraction.warnings.filter(
          (warning) => warning.code === 'parse-error',
        ),
        ...extraction.warnings.filter(
          (warning) =>
            warning.code === 'static-candidate-limit' ||
            warning.code === 'unrecognized-runtime-t-binding',
        ),
        ...recommended,
      ]
    : extraction.warnings;
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
      translationAutoImports,
    ),
    messages: extraction.messages,
  };
}

export function hasPotentialTranslationCandidate(code: string): boolean {
  return POTENTIAL_TRANSLATION_RE.test(code);
}

export function normalizeAutoImports(
  autoImport: AutoImportOption | undefined,
): AutoImportBindings {
  if (typeof autoImport === 'boolean') {
    // boolean 保留跨框架语义；Vue-only API 由 Vue preset 显式声明。
    return {
      t: autoImport,
      tRef: false,
      tComputed: false,
      useI18n: autoImport,
    };
  }
  return {
    t: autoImport?.includes('t') ?? false,
    tRef: autoImport?.includes('tRef') ?? false,
    tComputed: autoImport?.includes('tComputed') ?? false,
    useI18n: autoImport?.includes('useI18n') ?? false,
  };
}

function hasTranslationCandidate(
  module: Module,
  autoImports: AutoImportBindings,
): boolean {
  const unbound = ['defineI18nMessages'];
  if (autoImports.t) unbound.push('t');
  if (autoImports.tRef) unbound.push('tRef');
  if (autoImports.tComputed) unbound.push('tComputed');
  if (autoImports.useI18n) unbound.push('useI18n');
  return (
    module.imports.some(
      (item) =>
        !item.typeOnly &&
        (item.specifier === AI_I18N_VIRTUAL_MODULE_ID ||
          item.name === 't' ||
          item.name === 'tRef' ||
          item.name === 'tComputed' ||
          item.name === 'useI18n'),
    ) ||
    findInvalidDefineI18nMessagesReferences(module).length > 0 ||
    findRuntimeTypedLocalTranslationCalls(module).length > 0 ||
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

function runtimeAutoImports(
  autoImports: AutoImportBindings,
): ReadonlySet<TranslationRuntimeApi> {
  const names = new Set<TranslationRuntimeApi>();
  if (autoImports.t) names.add('t');
  if (autoImports.tRef) names.add('tRef');
  if (autoImports.tComputed) names.add('tComputed');
  return names;
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
