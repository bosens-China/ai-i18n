import {
  createMessageId,
  createTemplateMessage,
  escapeTemplateLiteral,
  translationComment,
  type TranslationOptions,
} from '@ai-i18n/core';
import {
  analyze,
  Analyzer,
  type AddFileOptions,
  type Module,
  type NodeOfType,
  type NodeType,
} from 'yuku-analyzer';
import {
  argumentWarning,
  evaluateStrings,
  evaluateTranslationOptions,
  isDefineI18nMessagesCall,
  sourceLocation,
  type StaticWarningCode,
} from './static-values.js';
import {
  validateRecommendedUsage as validateUsage,
  type RecommendedUsageWarning,
} from './recommended-usage.js';
import { diagnosticMessage } from './diagnostics.js';
import {
  createTranslationContext,
  isTranslationCallee,
  isTranslationHookCall,
  isTranslationObject,
  isTranslationReference,
  translationCalleeOrigin,
  type TranslationCalleeOrigin,
  type TranslationHookBinding,
} from './translation-calls.js';

export type { Module } from 'yuku-analyzer';
export { diagnosticMessage, resolveDiagnosticLocale } from './diagnostics.js';
export type { DiagnosticLocale } from './diagnostics.js';
export type {
  RecommendedUsageCode,
  RecommendedUsageWarning,
} from './recommended-usage.js';
export { findInvalidDefineI18nMessagesReferences } from './static-values.js';
export type {
  TranslationCalleeOrigin,
  TranslationHookBinding,
} from './translation-calls.js';

export const AI_I18N_VIRTUAL_MODULE_ID = 'virtual:ai-i18n';

export type AnalysisLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

export interface SourceLocation {
  line: number;
  column: number;
}

export interface TranslationCall extends SourceLocation {
  file: string;
  kind: 'call' | 'tagged-template';
  origin: TranslationCalleeOrigin;
}

export interface ExtractedMessage {
  id: string;
  source: string;
  comment?: string;
  locations: SourceLocation[];
}

export type ExtractWarningCode = StaticWarningCode;

export interface ExtractWarning extends SourceLocation {
  code: ExtractWarningCode;
  file: string;
  message: string;
}

export interface ExtractResult {
  messages: ExtractedMessage[];
  warnings: ExtractWarning[];
  dependencies: string[];
  pending: boolean;
}

type Node = NodeOfType<NodeType>;

export interface DefineI18nMessagesCall {
  start: number;
  end: number;
  argument: { start: number; end: number } | null;
}

export function analyzeModule(
  code: string,
  id: string,
  analyzer?: Analyzer,
  lang?: AnalysisLanguage,
): Module {
  const parseOptions: AddFileOptions | undefined = lang ? { lang } : undefined;
  return analyzer
    ? analyzer.addFile(id, code, parseOptions)
    : analyze(code, { path: id, ...parseOptions });
}

export function extractMessages(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime = false,
  maxStaticCandidates = Number.POSITIVE_INFINITY,
): ExtractResult {
  const messages = new Map<string, ExtractedMessage>();
  const warnings: ExtractWarning[] = module.diagnostics.map((diagnostic) => ({
    code: 'parse-error',
    file: module.path,
    ...sourceLocation(module.source, diagnostic.start),
    message: diagnostic.message,
  }));
  let pending = false;
  const dependencies = new Set<string>();
  const translationContext = createTranslationContext(
    module,
    runtimeModuleId,
    translationHooks,
  );

  if (
    !translationContext.translateSymbols.size &&
    !translationContext.translationObjects.size &&
    !autoImportRuntime
  ) {
    return { messages: [], warnings, dependencies: [], pending };
  }

  const addMessage = (
    source: string,
    options: TranslationOptions | undefined,
    offset: number,
  ) => {
    const location = sourceLocation(module.source, offset);
    const comment = translationComment(options);
    const id = createMessageId(source, options);
    const previous = messages.get(id);
    if (previous) {
      previous.locations.push(location);
      return;
    }
    messages.set(id, {
      id,
      source,
      ...(comment ? { comment } : {}),
      locations: [location],
    });
  };

  module.walk({
    CallExpression(node) {
      if (
        !isTranslationCallee(
          node.callee,
          module,
          translationContext,
          autoImportRuntime,
        )
      ) {
        return;
      }

      let candidateLimitExceeded = false;
      const markCandidateLimitExceeded = () => {
        candidateLimitExceeded = true;
      };
      const sources = evaluateStrings(
        node.arguments[0],
        module,
        new Set(),
        dependencies,
        maxStaticCandidates,
        markCandidateLimitExceeded,
      );
      const options =
        node.arguments.length < 2 ||
        isUnboundUndefined(node.arguments[1], module)
          ? [{}]
          : evaluateTranslationOptions(
              node.arguments[1],
              module,
              new Set(),
              dependencies,
              maxStaticCandidates,
              markCandidateLimitExceeded,
            );
      const candidateCount = (sources?.length ?? 0) * (options?.length ?? 0);
      if (candidateLimitExceeded || candidateCount > maxStaticCandidates) {
        warnings.push({
          code: 'static-candidate-limit',
          file: module.path,
          ...sourceLocation(module.source, node.start),
          message: diagnosticMessage(
            `t() 的静态候选超过 ${maxStaticCandidates} 个，请缩小候选集合或调整 ESLint 规则配置。`,
            `t() expands to more than ${maxStaticCandidates} static candidates. Reduce the candidate set or adjust the ESLint rule configuration.`,
          ),
        });
        return;
      }
      if (sources === undefined || options === undefined) {
        pending = true;
        warnings.push(
          argumentWarning(module, node.start, 'unresolved-argument'),
        );
        return;
      }
      if (sources === null || options === null || node.arguments.length > 2) {
        warnings.push(argumentWarning(module, node.start, 'dynamic-argument'));
        return;
      }

      for (const source of sources) {
        for (const messageOptions of options) {
          addMessage(escapeTemplateLiteral(source), messageOptions, node.start);
        }
      }
    },
    TaggedTemplateExpression(node) {
      if (
        !isTranslationCallee(
          node.tag,
          module,
          translationContext,
          autoImportRuntime,
        )
      ) {
        return;
      }
      addMessage(
        createTemplateMessage(
          node.quasi.quasis.map(
            (quasi) => quasi.value.cooked ?? quasi.value.raw,
          ),
        ),
        undefined,
        node.start,
      );
    },
  });

  return {
    messages: [...messages.values()],
    warnings,
    dependencies: [...dependencies].sort(),
    pending,
  };
}

export function findTranslationCalls(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime = false,
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
  autoImportRuntime = false,
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

function isUnboundUndefined(node: Node | undefined, module: Module): boolean {
  return (
    node?.type === 'Identifier' &&
    node.name === 'undefined' &&
    !module.symbolOf(node)
  );
}

export { Analyzer };
