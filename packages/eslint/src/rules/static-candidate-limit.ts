import type { Rule } from 'eslint';
import { analyzeRuleContext } from '../rule-analysis.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: boolean;
  maxStaticCandidates?: number;
}

export const staticCandidateLimit: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '警告单个 t() 展开的静态候选数量过多',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tsconfigPath: { type: 'string' },
          autoImport: { type: 'boolean' },
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
        } catch {
          // 主规则负责报告分析失败；本规则只补充候选数量警告。
        }
      },
    };
  },
};
