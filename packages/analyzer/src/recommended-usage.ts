import {
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';
import {
  findInvalidDefineI18nMessagesReferences,
  isDefineI18nMessagesCall,
  sourceLocation,
} from './static-values.js';

type Node = NodeOfType<NodeType>;

export type RecommendedUsageCode =
  | 'invalid-macro'
  | 'mutable-binding'
  | 'non-recommended-argument'
  | 'non-recommended-callee'
  | 'unmarked-member';

export interface RecommendedUsageWarning {
  code: RecommendedUsageCode;
  file: string;
  line: number;
  column: number;
  message: string;
}

export function validateRecommendedUsage(
  module: Module,
  options: {
    runtimeModuleId: string;
    isTranslationCall(node: NodeOfType<'CallExpression'>): boolean;
    isTranslationReference(node: Node): boolean;
    isTranslationObject(node: Node): boolean;
    isTranslationHookCall(node: NodeOfType<'CallExpression'>): boolean;
  },
): RecommendedUsageWarning[] {
  const warnings: RecommendedUsageWarning[] = [];
  const warn = (node: Node, code: RecommendedUsageCode, message: string) => {
    warnings.push({
      code,
      file: module.path,
      ...sourceLocation(module.source, node.start),
      message,
    });
  };
  for (const reference of findInvalidDefineI18nMessagesReferences(module)) {
    warnings.push({
      code: 'invalid-macro',
      file: module.path,
      ...sourceLocation(module.source, reference.start),
      message:
        'defineI18nMessages 只能直接调用，不能赋值、传递或保存为其他变量。',
    });
  }

  module.walk({
    CallExpression(node) {
      if (isDefineI18nMessagesCall(node, module)) {
        if (!isCanonicalMacroDeclaration(node, module)) {
          warn(
            node,
            'invalid-macro',
            'defineI18nMessages() 必须直接赋值给 const 标识符，且只接收一个参数。',
          );
        }
        return;
      }
      if (isUnsupportedNamespaceCall(node, module, options.runtimeModuleId)) {
        warn(
          node,
          'non-recommended-callee',
          '请使用 t 的命名导入；不支持通过命名空间对象调用 i18n.t()。',
        );
        return;
      }
      if (
        node.callee.type === 'MemberExpression' &&
        memberPropertyName(node.callee) === 't' &&
        node.callee.object.type === 'CallExpression' &&
        options.isTranslationHookCall(node.callee.object)
      ) {
        warn(
          node,
          'non-recommended-callee',
          '请先解构 useI18n() 返回的 t，或先保存 Hook 结果再调用 i18n.t()。',
        );
        return;
      }
      if (!options.isTranslationCall(node)) return;
      const issue = recommendedArgumentIssue(
        node.arguments[0],
        module,
        new Set(),
      );
      if (issue) warn(node.arguments[0] ?? node, issue.code, issue.message);
    },
    VariableDeclarator(node) {
      if (
        node.id.type === 'Identifier' &&
        node.init &&
        options.isTranslationReference(node.init)
      ) {
        warn(
          node,
          'non-recommended-callee',
          '不要再次赋值 t；如需别名，请在 import 或 useI18n() 解构时直接命名。',
        );
      } else if (
        node.id.type === 'ObjectPattern' &&
        node.id.properties.some(
          (property) =>
            property.type === 'Property' &&
            property.key.type === 'Identifier' &&
            property.key.name === 't',
        ) &&
        node.init &&
        options.isTranslationObject(node.init)
      ) {
        warn(
          node,
          'non-recommended-callee',
          '请直接从 useI18n() 解构 t，不要对 Hook 结果进行二次解构。',
        );
      }
      if (isRuntimeRequire(node.init, module, options.runtimeModuleId)) {
        warn(
          node,
          'non-recommended-callee',
          '不支持 require()；请使用 virtual:ai-i18n 的 ESM 命名导入。',
        );
      }
    },
  });
  return warnings;
}

function isUnsupportedNamespaceCall(
  node: NodeOfType<'CallExpression'>,
  module: Module,
  runtimeModuleId: string,
): boolean {
  if (
    node.callee.type !== 'MemberExpression' ||
    memberPropertyName(node.callee) !== 't' ||
    node.callee.object.type !== 'Identifier'
  ) {
    return false;
  }
  const symbol = module.symbolOf(node.callee.object);
  return Boolean(
    symbol &&
    module.imports.some(
      (item) =>
        item.local === symbol &&
        item.name === null &&
        item.specifier === runtimeModuleId,
    ),
  );
}

function memberPropertyName(
  node: NodeOfType<'MemberExpression'>,
): string | null {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
    ? node.property.value
    : null;
}

function isRuntimeRequire(
  node: Node | null,
  module: Module,
  runtimeModuleId: string,
): boolean {
  return Boolean(
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    !module.symbolOf(node.callee) &&
    node.arguments[0]?.type === 'Literal' &&
    node.arguments[0].value === runtimeModuleId,
  );
}

function recommendedArgumentIssue(
  node: Node | undefined,
  module: Module,
  seen: Set<string>,
): { code: RecommendedUsageCode; message: string } | null {
  if (!node) {
    return {
      code: 'non-recommended-argument',
      message: 't() 必须接收可静态提取的文案。',
    };
  }
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string'
        ? null
        : {
            code: 'non-recommended-argument',
            message: 't() 请直接传入字符串文案。',
          };
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? null
        : {
            code: 'non-recommended-argument',
            message: '运行时插值请使用 tagged template：t`...${value}`。',
          };
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
    case 'ChainExpression':
      return recommendedArgumentIssue(node.expression, module, seen);
    case 'ConditionalExpression':
      return (
        recommendedArgumentIssue(node.consequent, module, new Set(seen)) ??
        recommendedArgumentIssue(node.alternate, module, new Set(seen))
      );
    case 'Identifier':
      return identifierIssue(node, module, seen);
    case 'MemberExpression': {
      const macro = findMacroRoot(node, module, new Set());
      if (!macro) {
        return {
          code: 'unmarked-member',
          message:
            '对象或数组文案请先用 defineI18nMessages() 标记，再传给 t()。',
        };
      }
      return macroContainsDiscouragedSyntax(macro.node, macro.module)
        ? {
            code: 'non-recommended-argument',
            message:
              'defineI18nMessages() 内的文案不要使用字符串拼接或逻辑表达式。',
          }
        : null;
    }
    default:
      return {
        code: 'non-recommended-argument',
        message:
          '请使用字符串字面量、静态 const、条件表达式或 defineI18nMessages() 成员。',
      };
  }
}

function identifierIssue(
  node: NodeOfType<'Identifier'>,
  module: Module,
  seen: Set<string>,
): { code: RecommendedUsageCode; message: string } | null {
  const symbol = module.symbolOf(node);
  if (!symbol) {
    return {
      code: 'non-recommended-argument',
      message: 't() 不支持无法解析的变量，请使用 const 静态文案。',
    };
  }
  const target = symbol.definition()?.symbol ?? symbol;
  if (!target.has(SymbolFlags.Const)) {
    return {
      code: 'mutable-binding',
      message: '传给 t() 的静态变量必须使用 const 声明。',
    };
  }
  const key = `${target.module.path}:${target.id}`;
  if (seen.has(key)) {
    return {
      code: 'non-recommended-argument',
      message: 't() 参数包含循环引用，无法按推荐语法提取。',
    };
  }
  const declaration = target.declarations[0];
  const parent = declaration ? target.module.parentOf(declaration) : null;
  return parent?.type === 'VariableDeclarator'
    ? recommendedArgumentIssue(
        parent.init ?? undefined,
        target.module,
        new Set([...seen, key]),
      )
    : {
        code: 'non-recommended-argument',
        message: 't() 请使用字符串字面量或可解析的 const 静态文案。',
      };
}

function findMacroRoot(
  node: Node,
  module: Module,
  seen: Set<string>,
): { node: NodeOfType<'CallExpression'>; module: Module } | null {
  if (
    node.type === 'CallExpression' &&
    isDefineI18nMessagesCall(node, module)
  ) {
    return { node, module };
  }
  if (
    node.type === 'MemberExpression' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSInstantiationExpression' ||
    node.type === 'ChainExpression'
  ) {
    return findMacroRoot(
      node.type === 'MemberExpression' ? node.object : node.expression,
      module,
      seen,
    );
  }
  if (node.type !== 'Identifier') return null;
  const symbol = module.symbolOf(node);
  if (!symbol) return null;
  const target = symbol.definition()?.symbol ?? symbol;
  const key = `${target.module.path}:${target.id}`;
  if (!target.has(SymbolFlags.Const) || seen.has(key)) return null;
  const declaration = target.declarations[0];
  const parent = declaration ? target.module.parentOf(declaration) : null;
  return parent?.type === 'VariableDeclarator' && parent.init
    ? findMacroRoot(parent.init, target.module, new Set([...seen, key]))
    : null;
}

function macroContainsDiscouragedSyntax(
  call: NodeOfType<'CallExpression'>,
  module: Module,
): boolean {
  const argument = call.arguments[0];
  if (!argument) return false;
  let discouraged = false;
  module.walk({
    BinaryExpression(node) {
      if (
        node.operator === '+' &&
        node.start >= argument.start &&
        node.end <= argument.end
      ) {
        discouraged = true;
      }
    },
    LogicalExpression(node) {
      if (node.start >= argument.start && node.end <= argument.end) {
        discouraged = true;
      }
    },
  });
  return discouraged;
}

function isCanonicalMacroDeclaration(
  call: NodeOfType<'CallExpression'>,
  module: Module,
): boolean {
  if (
    call.arguments.length !== 1 ||
    call.arguments[0]?.type === 'SpreadElement'
  ) {
    return false;
  }
  const declarator = module.parentOf(call);
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.init !== call ||
    declarator.id.type !== 'Identifier'
  ) {
    return false;
  }
  const declaration = module.parentOf(declarator);
  if (
    declaration?.type !== 'VariableDeclaration' ||
    declaration.kind !== 'const'
  ) {
    return false;
  }
  return true;
}
