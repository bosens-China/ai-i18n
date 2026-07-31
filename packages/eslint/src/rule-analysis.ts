import type { Rule } from 'eslint';
import {
  analyzeStaticSource,
  hasPotentialTranslationCandidate,
  normalizeAutoImports,
  type AutoImportOption,
  type StaticAnalysisResult,
  type StaticArgsWarning,
} from './analyze.js';
import { diagnosticMessage, type TranslationCall } from '@ai-i18n/analyzer';
import { createVueAnalysisSource } from './vue-sfc.js';
import type { ImportAlias } from './resolve-import.js';

interface RuleAnalysisOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
}

interface CachedAnalysis {
  source: ReturnType<typeof createAnalysisSource>;
  analyses: Map<string, StaticAnalysisResult>;
}

const DEFAULT_CANDIDATE_LIMIT = 1_000;
const cache = new WeakMap<object, CachedAnalysis>();
const reportedAnalysisFailures = new WeakSet<object>();
const EMPTY_ANALYSIS: StaticAnalysisResult = {
  warnings: [],
  translationCalls: [],
};

export function analyzeRuleContext(
  context: Rule.RuleContext,
  options: RuleAnalysisOptions,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): StaticArgsWarning[] {
  return analyzeRuleContextResult(context, options, maxStaticCandidates)
    .warnings;
}

export function analyzeTranslationCalls(
  context: Rule.RuleContext,
  options: RuleAnalysisOptions,
): TranslationCall[] {
  return analyzeRuleContextResult(context, options, DEFAULT_CANDIDATE_LIMIT)
    .translationCalls;
}

export function reportAnalysisFailureOnce(
  context: Rule.RuleContext,
  node: Rule.Node,
  error: unknown,
): void {
  if (reportedAnalysisFailures.has(context.sourceCode)) return;
  reportedAnalysisFailures.add(context.sourceCode);
  const detail = error instanceof Error ? error.message : String(error);
  context.report({
    node,
    message: diagnosticMessage(
      `静态分析失败：${detail}`,
      `Static analysis failed: ${detail}`,
    ),
  });
}

function analyzeRuleContextResult(
  context: Rule.RuleContext,
  options: RuleAnalysisOptions,
  maxStaticCandidates: number,
): StaticAnalysisResult {
  if (!hasPotentialTranslationCandidate(context.sourceCode.text)) {
    return EMPTY_ANALYSIS;
  }
  const cached: CachedAnalysis = cache.get(context.sourceCode) ?? {
    source: createAnalysisSource(context),
    analyses: new Map<string, StaticAnalysisResult>(),
  };
  cache.set(context.sourceCode, cached);
  const alias = readImportAlias(context);

  const analyze = (limit: number) => {
    const autoImports = normalizeAutoImports(options.autoImport);
    const key = JSON.stringify([
      options.tsconfigPath ?? null,
      autoImports.t,
      autoImports.tRef,
      autoImports.useI18n,
      Object.entries(alias ?? {}),
      limit,
    ]);
    const existing = cached.analyses.get(key);
    if (existing) return existing;
    const result = analyzeStaticSource(
      cached.source.code,
      context.filename,
      options.tsconfigPath,
      cached.source.lang,
      options.autoImport,
      limit,
      alias,
    );
    const analysis = {
      warnings: result.warnings.map((warning) => ({
        ...warning,
        ...cached.source.mapLocation(warning),
      })),
      translationCalls: result.translationCalls.map((call) => ({
        ...call,
        ...cached.source.mapLocation(call),
      })),
    };
    cached.analyses.set(key, analysis);
    return analysis;
  };

  if (Number.isFinite(maxStaticCandidates)) {
    return analyze(maxStaticCandidates);
  }
  const preflight = analyze(DEFAULT_CANDIDATE_LIMIT);
  return preflight.warnings.some(
    (warning) => warning.code === 'static-candidate-limit',
  )
    ? analyze(Number.POSITIVE_INFINITY)
    : preflight;
}

function readImportAlias(context: Rule.RuleContext): ImportAlias | undefined {
  const settings = context.settings['ai-i18n'];
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }
  const alias = (settings as { alias?: unknown }).alias;
  if (alias === undefined) return undefined;
  if (!alias || typeof alias !== 'object' || Array.isArray(alias)) {
    throw new TypeError(
      diagnosticMessage(
        'ai-i18n settings.alias 必须是字符串到绝对路径的对象。',
        'ai-i18n settings.alias must be an object mapping strings to absolute paths.',
      ),
    );
  }
  return alias as ImportAlias;
}

function createAnalysisSource(context: Rule.RuleContext) {
  return context.filename.endsWith('.vue')
    ? createVueAnalysisSource(
        context.sourceCode.text,
        context.filename,
        context.sourceCode.parserServices,
      )
    : {
        code: context.sourceCode.text,
        lang: undefined,
        mapLocation: (location: { line: number; column: number }) => location,
      };
}
