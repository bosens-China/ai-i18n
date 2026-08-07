import type { TranslationCall } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import type { AutoImportOption } from '../../analyze.js';
import { analyzeTranslationCalls } from '../../rule-analysis.js';

export interface TranslationRuleOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
}

export interface TranslationCandidate {
  kind: TranslationCall['kind'];
  node: Rule.Node;
}

export interface MatchedTranslationCall extends TranslationCandidate {
  call: TranslationCall;
}

export function matchTranslationCalls(
  context: Rule.RuleContext,
  options: TranslationRuleOptions,
  candidates: readonly TranslationCandidate[],
): MatchedTranslationCall[] {
  const calls = new Map(
    analyzeTranslationCalls(context, options).map((call) => [
      locationKey(call.line, call.column, call.kind),
      call,
    ]),
  );
  return candidates.flatMap((candidate) => {
    const location = candidate.node.loc?.start;
    if (!location) return [];
    const call = calls.get(
      locationKey(location.line, location.column, candidate.kind),
    );
    return call ? [{ ...candidate, call }] : [];
  });
}

function locationKey(
  line: number,
  column: number,
  kind: TranslationCall['kind'],
): string {
  return `${kind}:${line}:${column}`;
}
