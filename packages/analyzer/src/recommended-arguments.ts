import {
  SymbolFlags,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';
import { diagnosticMessage } from './diagnostics.js';
import {
  evaluateStrings,
  evaluateTranslationInput,
  isDefineI18nMessagesCall,
} from './static-values.js';
import { isVueUnrefCall } from './static-call-detection.js';

type Node = NodeOfType<NodeType>;

export type RecommendedUsageCode =
  | 'invalid-macro'
  | 'mutable-binding'
  | 'non-recommended-argument'
  | 'non-recommended-callee'
  | 'unmarked-member';

export function recommendedArgumentIssue(
  node: Node | undefined,
  module: Module,
  seen: Set<string>,
): { code: RecommendedUsageCode; message: string } | null {
  if (!node) {
    return {
      code: 'non-recommended-argument',
      message: diagnosticMessage(
        '翻译调用必须接收可静态提取的文案。',
        'A translation call requires a statically extractable message.',
      ),
    };
  }
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string'
        ? null
        : {
            code: 'non-recommended-argument',
            message: diagnosticMessage(
              '请将字符串文案直接传给翻译调用。',
              'Pass the message string directly to the translation call.',
            ),
          };
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? null
        : {
            code: 'non-recommended-argument',
            message: diagnosticMessage(
              '运行时插值请改用翻译函数的标签模板写法。',
              'Use the translation function as a tagged template for runtime interpolation.',
            ),
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
    case 'CallExpression':
      return isVueUnrefCall(node, module) &&
        node.arguments.length === 1 &&
        node.arguments[0]?.type !== 'SpreadElement'
        ? recommendedArgumentIssue(node.arguments[0], module, seen)
        : unsupportedArgumentIssue();
    case 'ArrayExpression':
    case 'ObjectExpression': {
      const input = evaluateTranslationInput(node, module);
      return input?.kind === 'tree' && !containsDiscouragedSyntax(node, module)
        ? null
        : {
            code: 'non-recommended-argument',
            message: diagnosticMessage(
              '文案树只能包含静态对象、数组和字面量值，不能包含字符串拼接或逻辑表达式。',
              'Message trees may only contain static objects, arrays, and literal values without string concatenation or logical expressions.',
            ),
          };
    }
    case 'Identifier':
      return identifierIssue(node, module, seen);
    case 'MemberExpression': {
      const macro = findMacroRoot(node, module, new Set());
      if (!macro) {
        return isStaticCollectionMember(node, module) &&
          Boolean(evaluateStrings(node, module)?.length)
          ? {
              code: 'unmarked-member',
              message: diagnosticMessage(
                '对象或数组文案请先用 defineI18nMessages() 标记，再传给翻译调用。这是编译宏，无需 import。',
                'Mark object or array messages with defineI18nMessages() before passing them to the translation call. It is a compile-time macro and does not need to be imported.',
              ),
            }
          : {
              code: 'non-recommended-argument',
              message: diagnosticMessage(
                '翻译调用的参数无法静态提取，请传入静态文案。',
                'The translation-call argument cannot be statically extracted; pass a static message.',
              ),
            };
      }
      return containsDiscouragedSyntax(macro.node, macro.module)
        ? {
            code: 'non-recommended-argument',
            message: diagnosticMessage(
              'defineI18nMessages() 内的文案不能使用字符串拼接或逻辑表达式。',
              'Do not use string concatenation or logical expressions inside defineI18nMessages().',
            ),
          }
        : null;
    }
    default:
      return unsupportedArgumentIssue();
  }
}

function unsupportedArgumentIssue() {
  return {
    code: 'non-recommended-argument' as const,
    message: diagnosticMessage(
      '请使用字符串字面量、静态 const、条件表达式或 defineI18nMessages() 成员。',
      'Use a string literal, static const, conditional expression, or defineI18nMessages() member.',
    ),
  };
}

function isStaticCollectionMember(
  node: NodeOfType<'MemberExpression'>,
  module: Module,
): boolean {
  return isStaticCollection(node.object, module, new Set());
}

function isStaticCollection(
  node: Node,
  module: Module,
  seen: Set<string>,
): boolean {
  if (node.type === 'ObjectExpression' || node.type === 'ArrayExpression') {
    return true;
  }
  if (node.type === 'MemberExpression') {
    return isStaticCollection(node.object, module, seen);
  }
  if (
    node.type === 'CallExpression' &&
    isVueUnrefCall(node, module) &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type !== 'SpreadElement'
  ) {
    return isStaticCollection(node.arguments[0], module, seen);
  }
  if (
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSInstantiationExpression' ||
    node.type === 'ChainExpression'
  ) {
    return isStaticCollection(node.expression, module, seen);
  }
  if (node.type !== 'Identifier') return false;
  const symbol = module.symbolOf(node);
  if (!symbol) return false;
  const target = symbol.definition()?.symbol ?? symbol;
  const key = `${target.module.path}:${target.id}`;
  if (!target.has(SymbolFlags.Const) || seen.has(key)) {
    return false;
  }
  const declaration = target.declarations[0];
  const parent = declaration ? target.module.parentOf(declaration) : null;
  return Boolean(
    parent?.type === 'VariableDeclarator' &&
    parent.init &&
    isStaticCollection(parent.init, target.module, new Set([...seen, key])),
  );
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
      message: diagnosticMessage(
        '翻译调用不支持无法解析的变量，请使用 const 静态文案。',
        'The translation call cannot resolve this variable; use a static const message.',
      ),
    };
  }
  const target = symbol.definition()?.symbol ?? symbol;
  if (!target.has(SymbolFlags.Const)) {
    return {
      code: 'mutable-binding',
      message: diagnosticMessage(
        '传给翻译调用的静态变量必须使用 const 声明。',
        'Static variables passed to a translation call must be declared with const.',
      ),
    };
  }
  const key = `${target.module.path}:${target.id}`;
  if (seen.has(key)) {
    return {
      code: 'non-recommended-argument',
      message: diagnosticMessage(
        '翻译调用参数包含循环引用，无法按推荐语法提取。',
        'The translation-call argument contains a circular reference and cannot be extracted.',
      ),
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
        message: diagnosticMessage(
          '请向翻译调用传入字符串字面量或可解析的 const 静态文案。',
          'Pass a string literal or resolvable static const message to the translation call.',
        ),
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
    node.type === 'CallExpression' &&
    isVueUnrefCall(node, module) &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type !== 'SpreadElement'
  ) {
    return findMacroRoot(node.arguments[0], module, seen);
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

function containsDiscouragedSyntax(root: Node, module: Module): boolean {
  const argument = root.type === 'CallExpression' ? root.arguments[0] : root;
  if (!argument || argument.type === 'SpreadElement') return false;
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
