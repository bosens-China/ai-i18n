import type { Rule } from 'eslint';
import { analyzeStaticArgs, type StaticArgsWarning } from './analyze.js';
import { createVueAnalysisSource } from './vue-sfc.js';

interface RuleAnalysisOptions {
  tsconfigPath?: string;
  autoImport?: boolean;
}

interface CachedAnalysis {
  source: ReturnType<typeof createAnalysisSource>;
  warnings: Map<string, StaticArgsWarning[]>;
}

const DEFAULT_CANDIDATE_LIMIT = 1_000;
const cache = new WeakMap<object, CachedAnalysis>();

export function analyzeRuleContext(
  context: Rule.RuleContext,
  options: RuleAnalysisOptions,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): StaticArgsWarning[] {
  const cached: CachedAnalysis = cache.get(context.sourceCode) ?? {
    source: createAnalysisSource(context),
    warnings: new Map<string, StaticArgsWarning[]>(),
  };
  cache.set(context.sourceCode, cached);

  const analyze = (limit: number) => {
    const key = JSON.stringify([
      options.tsconfigPath ?? null,
      options.autoImport ?? false,
      limit,
    ]);
    const existing = cached.warnings.get(key);
    if (existing) return existing;
    const warnings = analyzeStaticArgs(
      cached.source.code,
      context.filename,
      options.tsconfigPath,
      cached.source.lang,
      options.autoImport,
      limit,
    ).map((warning) => ({
      ...warning,
      ...cached.source.mapLocation(warning),
    }));
    cached.warnings.set(key, warnings);
    return warnings;
  };

  if (Number.isFinite(maxStaticCandidates)) {
    return analyze(maxStaticCandidates);
  }
  const preflight = analyze(DEFAULT_CANDIDATE_LIMIT);
  return preflight.some((warning) => warning.code === 'static-candidate-limit')
    ? analyze(Number.POSITIVE_INFINITY)
    : preflight;
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
