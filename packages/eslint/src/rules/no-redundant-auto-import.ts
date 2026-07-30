import type { Rule } from 'eslint';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { ALL_AUTO_IMPORT_APIS, type AutoImportApi } from '../auto-imports.js';

const RUNTIME_MODULE = 'virtual:ai-i18n';

interface RuleOptions {
  autoImport: readonly AutoImportApi[];
}

type ImportSpecifierNode = Extract<Rule.Node, { type: 'ImportSpecifier' }> & {
  importKind?: 'type' | 'value';
};

type ImportDeclarationNode = Extract<
  Rule.Node,
  { type: 'ImportDeclaration' }
> & {
  importKind?: 'type' | 'value';
};

export const noRedundantAutoImport: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '禁止显式导入已由 ai-i18n autoImport 注入的 Runtime API',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          autoImport: {
            type: 'array',
            items: { enum: ALL_AUTO_IMPORT_APIS },
            minItems: 1,
            uniqueItems: true,
          },
        },
        required: ['autoImport'],
        additionalProperties: false,
      },
    ],
    messages: {
      redundantImport: diagnosticMessage(
        'ai-i18n autoImport 已注入以下 API：{{names}}。请删除来自 virtual:ai-i18n 的冗余导入。',
        'ai-i18n autoImport injects these APIs: {{names}}. Remove the redundant imports from virtual:ai-i18n.',
      ),
    },
  },
  create(context) {
    const enabled = new Set(
      ((context.options[0] as RuleOptions | undefined)?.autoImport ??
        []) as readonly string[],
    );
    return {
      ImportDeclaration(rawNode) {
        const node = rawNode as ImportDeclarationNode;
        if (
          node.importKind === 'type' ||
          node.source.value !== RUNTIME_MODULE
        ) {
          return;
        }
        const named = node.specifiers.filter(
          (specifier): specifier is ImportSpecifierNode =>
            specifier.type === 'ImportSpecifier',
        );
        const redundant = named.filter((specifier) => {
          const imported = importedName(specifier);
          return (
            specifier.importKind !== 'type' &&
            imported !== null &&
            imported === specifier.local.name &&
            enabled.has(imported)
          );
        });
        if (!redundant.length) return;

        const names = redundant
          .map((specifier) => importedName(specifier))
          .filter((name): name is string => name !== null);
        const fix = createFix(context, node, named, redundant);
        context.report({
          node,
          messageId: 'redundantImport',
          data: { names: names.join(', ') },
          fix,
        });
      },
    };
  },
};

function importedName(specifier: ImportSpecifierNode): string | null {
  if (
    specifier.imported.type === 'Identifier' &&
    'name' in specifier.imported
  ) {
    return specifier.imported.name;
  }
  return typeof specifier.imported.value === 'string'
    ? specifier.imported.value
    : null;
}

function createFix(
  context: Rule.RuleContext,
  node: ImportDeclarationNode,
  named: ImportSpecifierNode[],
  redundant: ImportSpecifierNode[],
): Rule.ReportFixer | undefined {
  // import 内部注释可能携带迁移说明，自动修复时不能静默丢弃。
  if (context.sourceCode.getCommentsInside(node).length) return undefined;
  const redundantSet = new Set<unknown>(redundant);
  const remaining = node.specifiers.filter(
    (specifier) => !redundantSet.has(specifier),
  );
  if (!remaining.length) {
    return (fixer) => fixer.remove(node);
  }

  const remainingNamed = named.filter(
    (specifier) => !redundantSet.has(specifier),
  );
  const firstNamed = named[0];
  const lastNamed = named.at(-1);
  if (!firstNamed || !lastNamed) return undefined;
  const openBrace = context.sourceCode.getTokenBefore(firstNamed);
  const closeBrace = context.sourceCode.getTokenAfter(lastNamed);
  if (openBrace?.value !== '{' || closeBrace?.value !== '}') return undefined;

  if (remainingNamed.length) {
    const [, openEnd] = context.sourceCode.getRange(openBrace);
    const [closeStart] = context.sourceCode.getRange(closeBrace);
    const replacement = remainingNamed
      .map((specifier) => context.sourceCode.getText(specifier))
      .join(', ');
    return (fixer) =>
      fixer.replaceTextRange([openEnd, closeStart], ` ${replacement} `);
  }

  const beforeOpen = context.sourceCode.getTokenBefore(openBrace);
  if (beforeOpen?.value !== ',') return undefined;
  const [commaStart] = context.sourceCode.getRange(beforeOpen);
  const [, closeEnd] = context.sourceCode.getRange(closeBrace);
  return (fixer) => fixer.removeRange([commaStart, closeEnd]);
}
