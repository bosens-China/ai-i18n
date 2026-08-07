import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import {
  defaultTreeAdapter,
  parse,
  parseFragment,
  type DefaultTreeAdapterTypes,
} from 'parse5';
import type { AutoImportOption } from '../../analyze.js';
import {
  analyzeTranslationMessages,
  reportAnalysisFailureOnce,
} from '../../rule-analysis.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
}

export const noEmbeddedMarkup: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '警告翻译源文中内嵌的静态 HTML 或 SVG 结构',
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
      embeddedMarkup: diagnosticMessage(
        '翻译源文包含静态 HTML 或 SVG 结构。请保留完整的自然语言，并将 markup 移出翻译调用或作为占位符传入。',
        'The translation source contains static HTML or SVG structure. Keep the complete natural-language message, and move markup outside the translation call or pass it as a placeholder.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    return {
      'Program:exit'(program) {
        let messages;
        try {
          messages = analyzeTranslationMessages(context, options);
        } catch (error) {
          reportAnalysisFailureOnce(context, program as Rule.Node, error);
          return;
        }

        const reported = new Set<string>();
        for (const message of messages) {
          if (!containsEmbeddedMarkup(message.source)) continue;
          for (const location of message.locations) {
            const key = `${location.line}:${location.column}`;
            if (reported.has(key)) continue;
            reported.add(key);
            context.report({
              node: program as Rule.Node,
              loc: {
                start: location,
                end: { line: location.line, column: location.column + 1 },
              },
              messageId: 'embeddedMarkup',
            });
          }
        }
      },
    };
  },
};

function containsEmbeddedMarkup(source: string): boolean {
  if (!source.includes('<')) return false;
  const options = { sourceCodeLocationInfo: true } as const;
  // fragment 保留 table 等局部标签；document 补充识别显式 html/body 包装标签。
  return (
    containsLocatedMarkup(parseFragment(source, options)) ||
    containsLocatedMarkup(parse(source, options))
  );
}

function containsLocatedMarkup(
  parent: DefaultTreeAdapterTypes.ParentNode,
): boolean {
  return parent.childNodes.some((node) => {
    if (
      (defaultTreeAdapter.isElementNode(node) ||
        defaultTreeAdapter.isCommentNode(node)) &&
      node.sourceCodeLocation
    ) {
      return true;
    }
    return (
      defaultTreeAdapter.isElementNode(node) && containsLocatedMarkup(node)
    );
  });
}
