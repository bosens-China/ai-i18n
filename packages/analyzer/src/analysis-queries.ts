import type { Module, NodeOfType, NodeType } from 'yuku-analyzer';
import { isDefineI18nMessagesCall, sourceLocation } from './static-values.js';
import {
  validateRecommendedUsage as validateUsage,
  type RecommendedUsageWarning,
} from './recommended-usage.js';
import {
  createTranslationContext,
  isTranslationCallee,
  isTranslationHookCall,
  isTranslationObject,
  isTranslationReference,
  translationCalleeOrigin,
  type TranslationAutoImports,
  type TranslationCalleeOrigin,
  type TranslationHookBinding,
} from './translation-calls.js';

export const AI_I18N_VIRTUAL_MODULE_ID = 'virtual:ai-i18n';

type Node = NodeOfType<NodeType>;

export interface TranslationCall {
  file: string;
  kind: 'call' | 'tagged-template';
  origin: TranslationCalleeOrigin;
  line: number;
  column: number;
}

export interface DefineI18nMessagesCall {
  start: number;
  end: number;
  argument: { start: number; end: number } | null;
}

export function findTranslationCalls(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime: TranslationAutoImports = false,
): TranslationCall[] {
  const calls: TranslationCall[] = [];
  const translationContext = createTranslationContext(
    module,
    runtimeModuleId,
    translationHooks,
  );
  const add = (node: Node, callee: Node, kind: TranslationCall['kind']) => {
    const origin = translationCalleeOrigin(
      callee,
      module,
      translationContext,
      autoImportRuntime,
    );
    if (!origin) return;
    calls.push({
      file: module.path,
      kind,
      origin,
      ...sourceLocation(module.source, node.start),
    });
  };

  module.walk({
    CallExpression(node) {
      add(node, node.callee, 'call');
    },
    TaggedTemplateExpression(node) {
      add(node, node.tag, 'tagged-template');
    },
  });
  return calls;
}

export function findUnboundCalls(
  module: Module,
  names: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  module.walk({
    CallExpression(node) {
      if (
        node.callee.type === 'Identifier' &&
        names.has(node.callee.name) &&
        !module.symbolOf(node.callee)
      ) {
        found.add(node.callee.name);
      }
    },
    TaggedTemplateExpression(node) {
      if (
        node.tag.type === 'Identifier' &&
        names.has(node.tag.name) &&
        !module.symbolOf(node.tag)
      ) {
        found.add(node.tag.name);
      }
    },
  });
  return [...found];
}

export function findUnboundReferences(
  module: Module,
  names: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  // 只接纳运行时读取；声明、属性名、类型引用和赋值目标都不能触发自动导入。
  module.walk({
    Identifier(node, context) {
      const reference = context.reference;
      if (
        names.has(node.name) &&
        reference &&
        !reference.symbol &&
        !reference.inTypePosition &&
        !reference.isWrite
      ) {
        found.add(node.name);
      }
    },
  });
  return [...found];
}

export function findDefineI18nMessagesCalls(
  module: Module,
): DefineI18nMessagesCall[] {
  const calls: DefineI18nMessagesCall[] = [];
  module.walk({
    CallExpression(node) {
      if (!isDefineI18nMessagesCall(node, module)) return;
      const argument = node.arguments.length === 1 ? node.arguments[0] : null;
      calls.push({
        start: node.start,
        end: node.end,
        argument:
          argument && argument.type !== 'SpreadElement'
            ? { start: argument.start, end: argument.end }
            : null,
      });
    },
  });
  return calls;
}

export function validateRecommendedUsage(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime: TranslationAutoImports = false,
): RecommendedUsageWarning[] {
  const translationContext = createTranslationContext(
    module,
    runtimeModuleId,
    translationHooks,
  );
  return validateUsage(module, {
    runtimeModuleId,
    isTranslationCall: (node) =>
      isTranslationCallee(
        node.callee,
        module,
        translationContext,
        autoImportRuntime,
      ),
    isTranslationReference: (node) =>
      isTranslationReference(node, module, translationContext),
    isTranslationObject: (node) =>
      isTranslationObject(node, module, translationContext),
    isTranslationHookCall: (node) =>
      isTranslationHookCall(node, module, translationHooks),
  });
}
