import type { Rule } from 'eslint';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { AutoImportOption } from '../../analyze.js';
import {
  analyzeRuleContext,
  reportAnalysisFailureOnce,
} from '../../rule-analysis.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
}

export const tStaticArgs: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '要求 virtual:ai-i18n 的翻译 API 参数可被静态提取',
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
                items: { enum: ['t', 'tRef', 'tComputed', 'useI18n'] },
                uniqueItems: true,
              },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      analysisFailed: '{{reason}}',
      dynamicArg: '{{reason}}',
      invalidUsage: '{{reason}}',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    return {
      'Program:exit'(node) {
        let warnings;
        try {
          warnings = analyzeRuleContext(context, options);
        } catch (error) {
          reportAnalysisFailureOnce(context, node as Rule.Node, error);
          return;
        }
        for (const warning of warnings) {
          const analysisFailed = warning.code === 'parse-error';
          const invalidUsage =
            warning.code !== 'dynamic-argument' &&
            warning.code !== 'unresolved-argument' &&
            !analysisFailed;
          context.report({
            node,
            loc: {
              start: warning,
              end: { line: warning.line, column: warning.column + 1 },
            },
            messageId: analysisFailed
              ? 'analysisFailed'
              : invalidUsage
                ? 'invalidUsage'
                : 'dynamicArg',
            data: {
              reason: analysisFailed
                ? diagnosticMessage(
                    `静态分析失败：${warning.message}`,
                    `Static analysis failed: ${warning.message}`,
                  )
                : invalidUsage
                  ? warning.message
                  : diagnosticMessage(
                      '翻译调用的参数无法静态提取。source 请使用静态字符串，options 请使用只包含 comment 的静态对象。',
                      'The translation-call arguments cannot be statically extracted. Use a static string for source and a static object containing only comment for options.',
                    ),
            },
          });
        }
      },
    };
  },
};
