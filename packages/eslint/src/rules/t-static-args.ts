import type { Rule } from 'eslint';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { normalizeAutoImports, type AutoImportOption } from '../analyze.js';
import {
  analyzeRuleContext,
  reportAnalysisFailureOnce,
} from '../rule-analysis.js';

interface RuleOptions {
  tsconfigPath?: string;
  autoImport?: AutoImportOption;
}

interface AstNode {
  type: string;
  name?: string;
  importKind?: string;
  range?: [number, number];
  argument?: AstNode;
  left?: AstNode;
  elements?: Array<AstNode | null>;
  properties?: AstNode[];
  value?: AstNode;
  id?: AstNode;
  declarations?: AstNode[];
  specifiers?: AstNode[];
  local?: AstNode;
  declaration?: AstNode | null;
  body?: AstNode[];
  parent?: AstNode | null;
}

interface VueElement extends AstNode {
  startTag?: {
    attributes?: Array<{
      directive?: boolean;
      key?: { name?: string };
    }>;
  };
}

interface VueDocument {
  children?: AstNode[];
}

interface VueParserServices {
  defineTemplateBodyVisitor?: (
    templateVisitor: Record<string, (node: AstNode) => void>,
    scriptVisitor: Rule.RuleListener,
  ) => Rule.RuleListener;
  getDocumentFragment?: () => VueDocument | null;
}

interface VueReference {
  id?: AstNode;
  variable?: unknown;
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
          autoImport: {
            anyOf: [
              { type: 'boolean' },
              {
                type: 'array',
                items: { enum: ['t', 'useI18n'] },
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
      templateNeedsI18n: '{{reason}}',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const scriptVisitor: Rule.RuleListener = {
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
                      't() 的参数无法静态提取。source 请使用静态字符串，options 请使用只包含 comment 的静态对象。',
                      'The t() arguments cannot be statically extracted. Use a static string for source and a static object containing only comment for options.',
                    ),
            },
          });
        }
      },
    };

    if (
      !context.filename.toLowerCase().endsWith('.vue') ||
      !normalizeAutoImports(options.autoImport).t
    ) {
      return scriptVisitor;
    }
    const services = context.sourceCode
      .parserServices as unknown as VueParserServices;
    const document = services.getDocumentFragment?.();
    const scripts = document?.children?.filter(isScriptElement) ?? [];
    const setupScript = scripts.find(isScriptSetup);
    // 普通 Options API 的模板可从组件实例获得 t，无法仅凭 SFC 静态确认来源。
    if ((!setupScript && scripts.length > 0) || !document) {
      return scriptVisitor;
    }
    if (
      setupScript &&
      hasTopLevelBinding(
        context.sourceCode.ast as unknown as AstNode,
        setupScript,
        't',
      )
    ) {
      return scriptVisitor;
    }
    if (!services.defineTemplateBodyVisitor) return scriptVisitor;

    const reportTemplateT = (node: AstNode) => {
      const target =
        node.type === 'CallExpression'
          ? (node as AstNode & { callee?: AstNode }).callee
          : (node as AstNode & { tag?: AstNode }).tag;
      if (
        target?.type !== 'Identifier' ||
        target.name !== 't' ||
        isTemplateLocal(target)
      ) {
        return;
      }
      context.report({
        node: target as Rule.Node,
        messageId: 'templateNeedsI18n',
        data: {
          reason: diagnosticMessage(
            '模板中的裸 t 无法绑定到 ai-i18n，也不会订阅语言变化。请在 <script setup> 中声明 const { t } = useI18n()。',
            'A bare t in the template is not bound to ai-i18n and does not subscribe to language changes. Declare const { t } = useI18n() in <script setup>.',
          ),
        },
      });
    };
    return services.defineTemplateBodyVisitor(
      {
        CallExpression: reportTemplateT,
        TaggedTemplateExpression: reportTemplateT,
      },
      scriptVisitor,
    );
  },
};

function isScriptElement(node: AstNode): node is VueElement {
  return node.type === 'VElement' && node.name === 'script';
}

function isScriptSetup(node: VueElement): boolean {
  return (
    node.startTag?.attributes?.some(
      (attribute) => !attribute.directive && attribute.key?.name === 'setup',
    ) ?? false
  );
}

function hasTopLevelBinding(
  program: AstNode,
  script: VueElement,
  name: string,
): boolean {
  return (
    program.body?.some(
      (statement) =>
        isInside(statement, script) && statementDeclares(statement, name),
    ) ?? false
  );
}

function isInside(node: AstNode, container: AstNode): boolean {
  return Boolean(
    node.range &&
    container.range &&
    node.range[0] >= container.range[0] &&
    node.range[1] <= container.range[1],
  );
}

function statementDeclares(node: AstNode, name: string): boolean {
  switch (node.type) {
    case 'ImportDeclaration':
      return (
        node.importKind !== 'type' &&
        (node.specifiers?.some(
          (item) => item.importKind !== 'type' && item.local?.name === name,
        ) ??
          false)
      );
    case 'VariableDeclaration':
      return (
        node.declarations?.some((item) => patternDeclares(item.id, name)) ??
        false
      );
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSImportEqualsDeclaration':
      return node.id?.name === name;
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
      return node.declaration
        ? statementDeclares(node.declaration, name)
        : false;
    default:
      return false;
  }
}

function patternDeclares(node: AstNode | undefined, name: string): boolean {
  if (!node) return false;
  switch (node.type) {
    case 'Identifier':
      return node.name === name;
    case 'RestElement':
      return patternDeclares(node.argument, name);
    case 'AssignmentPattern':
      return patternDeclares(node.left, name);
    case 'ArrayPattern':
      return (
        node.elements?.some((item) =>
          patternDeclares(item ?? undefined, name),
        ) ?? false
      );
    case 'ObjectPattern':
      return (
        node.properties?.some((item) =>
          patternDeclares(
            item.type === 'RestElement' ? item.argument : item.value,
            name,
          ),
        ) ?? false
      );
    default:
      return false;
  }
}

function isTemplateLocal(node: AstNode): boolean {
  let parent = node.parent;
  while (parent && parent.type !== 'VExpressionContainer') {
    parent = parent.parent;
  }
  const references = (
    parent as (AstNode & { references?: VueReference[] }) | null | undefined
  )?.references;
  return (
    references?.some(
      (reference) =>
        reference.variable &&
        (reference.id === node ||
          (reference.id?.range?.[0] === node.range?.[0] &&
            reference.id?.range?.[1] === node.range?.[1])),
    ) ?? false
  );
}
