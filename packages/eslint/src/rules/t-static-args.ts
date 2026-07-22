import type { Rule } from 'eslint';
import { analyzeStaticArgs } from '../analyze.js';

interface RuleOptions {
  tsconfigPath?: string;
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
        properties: { tsconfigPath: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      dynamicArg:
        "t() 参数无法静态提取，请使用字符串字面量、静态模板、条件表达式或可解析的 const 字符串。",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    return {
      'Program:exit'(node) {
        let warnings;
        try {
          warnings = analyzeStaticArgs(
            context.sourceCode.text,
            context.filename,
            options.tsconfigPath,
          );
        } catch {
          return;
        }
        for (const warning of warnings) {
          context.report({
            node,
            loc: {
              start: warning,
              end: { line: warning.line, column: warning.column + 1 },
            },
            messageId: 'dynamicArg',
          });
        }
      },
    };
  },
};
