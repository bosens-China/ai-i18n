import { type Module, type NodeOfType, type NodeType } from 'yuku-analyzer';
import {
  findInvalidDefineI18nMessagesReferences,
  isDefineI18nMessagesCall,
  sourceLocation,
} from './static-values.js';
import { diagnosticMessage } from './diagnostics.js';
import {
  recommendedArgumentIssue,
  type RecommendedUsageCode,
} from './recommended-arguments.js';

type Node = NodeOfType<NodeType>;

export type { RecommendedUsageCode } from './recommended-arguments.js';

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
      message: diagnosticMessage(
        'defineI18nMessages() 只能直接调用，不能赋值、传递或保存为其他变量。',
        'defineI18nMessages() must be called directly and cannot be assigned, passed, or stored.',
      ),
    });
  }

  module.walk({
    CallExpression(node) {
      if (isDefineI18nMessagesCall(node, module)) {
        if (!isCanonicalMacroDeclaration(node, module)) {
          warn(
            node,
            'invalid-macro',
            diagnosticMessage(
              'defineI18nMessages() 必须直接赋值给 const 标识符，且只能接收一个参数。',
              'Assign defineI18nMessages() directly to a const identifier and pass exactly one argument.',
            ),
          );
        }
        return;
      }
      if (isUnsupportedNamespaceCall(node, module, options.runtimeModuleId)) {
        warn(
          node,
          'non-recommended-callee',
          diagnosticMessage(
            '请通过命名导入使用 t；不支持通过命名空间对象调用 i18n.t()。',
            'Use a named import for t; namespace calls such as i18n.t() are not supported.',
          ),
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
          diagnosticMessage(
            '请先解构 useI18n() 返回的 t，或先保存 Hook 结果再调用 i18n.t()。',
            'Destructure t from useI18n(), or store the Hook result before calling i18n.t().',
          ),
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
          diagnosticMessage(
            '不要再次赋值翻译函数；如需别名，请在 import 或 useI18n() 解构时直接命名。',
            'Do not reassign a translation function; create an alias in the import or useI18n() destructuring.',
          ),
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
          diagnosticMessage(
            '请直接从 useI18n() 解构 t，不要对 Hook 结果进行二次解构。',
            'Destructure t directly from useI18n(); do not destructure the Hook result again.',
          ),
        );
      }
      if (isRuntimeRequire(node.init, module, options.runtimeModuleId)) {
        warn(
          node,
          'non-recommended-callee',
          diagnosticMessage(
            '不支持 require()；请使用 virtual:ai-i18n 的 ESM 命名导入。',
            'require() is not supported; use an ESM named import from virtual:ai-i18n.',
          ),
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
