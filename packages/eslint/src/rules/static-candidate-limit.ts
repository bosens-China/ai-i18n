import type { Rule } from 'eslint';
import { analyzeStaticArgs } from '../analyze.js';
import { createVueAnalysisSource } from '../vue-sfc.js';

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
          const source = context.filename.endsWith('.vue')
            ? createVueAnalysisSource(
                context.sourceCode.text,
                context.filename,
                context.sourceCode.parserServices,
              )
            : {
                code: context.sourceCode.text,
                lang: undefined,
                mapLocation: (location: { line: number; column: number }) =>
                  location,
              };
          const warnings = analyzeStaticArgs(
            source.code,
            context.filename,
            options.tsconfigPath,
            source.lang,
            options.autoImport,
            options.maxStaticCandidates ?? 1_000,
          );
          for (const warning of warnings) {
            if (warning.code !== 'static-candidate-limit') continue;
            const location = source.mapLocation(warning);
            context.report({
              node,
              loc: {
                start: location,
                end: { line: location.line, column: location.column + 1 },
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
