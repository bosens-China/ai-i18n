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
  evaluateTranslationInput,
  evaluateTranslationOptions,
  sourceLocation,
  type StaticWarningCode,
} from './static-values.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './analysis-queries.js';
import { diagnosticMessage } from './diagnostics.js';
import { findRuntimeTypedLocalTranslationCalls } from './runtime-type-diagnostics.js';
import {
  createTranslationContext,
  hasTranslationAutoImports,
  isTranslationCallee,
  type TranslationAutoImports,
  type TranslationHookBinding,
} from './translation-calls.js';

export type { Module } from 'yuku-analyzer';
export {
  AI_I18N_VIRTUAL_MODULE_ID,
  findDefineI18nMessagesCalls,
  findTranslationCalls,
  findUnboundCalls,
  findUnboundReferences,
  validateRecommendedUsage,
} from './analysis-queries.js';
export type {
  DefineI18nMessagesCall,
  TranslationCall,
} from './analysis-queries.js';
export { diagnosticMessage, resolveDiagnosticLocale } from './diagnostics.js';
export type { DiagnosticLocale } from './diagnostics.js';
export type {
  RecommendedUsageCode,
  RecommendedUsageWarning,
} from './recommended-usage.js';
export { findInvalidDefineI18nMessagesReferences } from './static-values.js';
export { findRuntimeImportDeclarations } from './runtime-imports.js';
export type {
  RuntimeImportDeclaration,
  RuntimeImportSpecifier,
} from './runtime-imports.js';
export { findRuntimeTypedLocalTranslationCalls } from './runtime-type-diagnostics.js';
export type { RuntimeTypedTranslationCall } from './runtime-type-diagnostics.js';
export type {
  TranslationAutoImports,
  TranslationCalleeOrigin,
  TranslationHookBinding,
  TranslationRuntimeApi,
} from './translation-calls.js';

export type AnalysisLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ExtractedMessage {
  id: string;
  source: string;
  comment?: string;
  locations: SourceLocation[];
}

export type ExtractWarningCode =
  StaticWarningCode | 'unrecognized-runtime-t-binding';

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
  autoImportRuntime: TranslationAutoImports = false,
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
  for (const call of findRuntimeTypedLocalTranslationCalls(module)) {
    warnings.push({
      code: 'unrecognized-runtime-t-binding',
      file: module.path,
      ...sourceLocation(module.source, call.start),
      message: diagnosticMessage(
        `“${call.name}”虽然标注为 I18nRuntime['t']，但局部函数值不会作为 ai-i18n Runtime t 提取。请直接调用从 virtual:ai-i18n 导入的 t，或 useI18n() 返回的 t。`,
        `"${call.name}" is typed as I18nRuntime['t'], but local function values are not extracted as the ai-i18n Runtime t. Call t imported from virtual:ai-i18n or returned by useI18n() directly.`,
      ),
    });
  }

  if (
    !translationContext.translateSymbols.size &&
    !translationContext.translationObjects.size &&
    !hasTranslationAutoImports(autoImportRuntime)
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
      const input = evaluateTranslationInput(
        node.arguments[0],
        module,
        new Set(),
        dependencies,
        maxStaticCandidates,
        markCandidateLimitExceeded,
      );
      const options =
        input?.kind === 'tree'
          ? node.arguments.length === 1
            ? [{}]
            : null
          : node.arguments.length < 2 ||
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
      const sources =
        input === undefined ? undefined : input === null ? null : input.sources;
      const candidateCount = (sources?.length ?? 0) * (options?.length ?? 0);
      if (candidateLimitExceeded || candidateCount > maxStaticCandidates) {
        warnings.push({
          code: 'static-candidate-limit',
          file: module.path,
          ...sourceLocation(module.source, node.start),
          message: diagnosticMessage(
            `翻译调用的静态候选超过 ${maxStaticCandidates} 个，请缩小候选集合或调整 ESLint 规则配置。`,
            `The translation call expands to more than ${maxStaticCandidates} static candidates. Reduce the candidate set or adjust the ESLint rule configuration.`,
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

function isUnboundUndefined(node: Node | undefined, module: Module): boolean {
  return (
    node?.type === 'Identifier' &&
    node.name === 'undefined' &&
    !module.symbolOf(node)
  );
}

export { Analyzer };
