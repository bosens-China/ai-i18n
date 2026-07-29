import type { Rule } from 'eslint';
import type { AutoImportOption } from '../analyze.js';
import {
  analyzeRuleContext,
  reportAnalysisFailureOnce,
} from '../rule-analysis.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
  maxStaticCandidates?: number;
}

export const staticCandidateLimit: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '警告单个 t() 展开的静态候选数量过多',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tsconfigPath: { type: 'string' },
          autoImport: {
            anyOf: [
              { type: 'boolean' },
              {
                type: 'array',
                items: { enum: ['t', 'tRef', 'useI18n'] },
                uniqueItems: true,
              },
            ],
          },
          maxStaticCandidates: {
            type: 'integer',
            minimum: 1,
            maximum: Number.MAX_SAFE_INTEGER,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      candidateLimit: '{{reason}}',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    return {
      'Program:exit'(node) {
        try {
          const warnings = analyzeRuleContext(
            context,
            options,
            options.maxStaticCandidates ?? 1_000,
          );
          for (const warning of warnings) {
            if (warning.code !== 'static-candidate-limit') continue;
            context.report({
              node,
              loc: {
                start: warning,
                end: { line: warning.line, column: warning.column + 1 },
              },
              messageId: 'candidateLimit',
              data: { reason: warning.message },
            });
          }
        } catch (error) {
          reportAnalysisFailureOnce(context, node as Rule.Node, error);
        }
      },
    };
  },
};
