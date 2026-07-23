import type { Rule } from 'eslint';
import { analyzeStaticArgs } from '../analyze.js';
import { createVueAnalysisSource } from '../vue-sfc.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: boolean;
}

export const tStaticArgs: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '要求 virtual:ai-i18n 的 t() 参数可被静态提取',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tsconfigPath: { type: 'string' },
          autoImport: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      analysisFailed: 'ai-i18n 静态分析失败：{{reason}}',
      dynamicArg:
        't() 参数无法静态提取，请使用字符串字面量、静态模板、条件表达式或可解析的 const 字符串。',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    return {
      'Program:exit'(node) {
        let warnings;
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
          warnings = analyzeStaticArgs(
            source.code,
            context.filename,
            options.tsconfigPath,
            source.lang,
            options.autoImport,
          );
          warnings = warnings.map((warning) => ({
            ...warning,
            ...source.mapLocation(warning),
          }));
        } catch (error) {
          context.report({
            node,
            messageId: 'analysisFailed',
            data: {
              reason: error instanceof Error ? error.message : String(error),
            },
          });
          return;
        }
        for (const warning of warnings) {
          const analysisFailed = warning.code === 'parse-error';
          context.report({
            node,
            loc: {
              start: warning,
              end: { line: warning.line, column: warning.column + 1 },
            },
            messageId: analysisFailed ? 'analysisFailed' : 'dynamicArg',
            ...(analysisFailed ? { data: { reason: warning.message } } : {}),
          });
        }
      },
    };
  },
};
